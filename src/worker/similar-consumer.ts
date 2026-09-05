// The one place the app asks `similarMedia`: on a run's page, after aggregation, per (run cluster,
// container) pair, re-asked only when the question changes.
//
// The ask lives HERE rather than inside each source's resolver because a source sees only its own
// view (kitsu has titles, a date and a count but no episode titles at handle time; justwatch would ask
// with JustWatch's numbering, the very collision under repair), asks on every operation unless it
// remembers the policy, and asks only for the pointers it happens to hold. The worker sees the whole
// cluster: the best day-precise date across members, every title, the highest-scored episode count,
// ani.zip's episode titles, and every container the run is PART_OF whatever source or fuzzy pass
// produced the edge. `Subscription.media` is the only caller, which is what keeps this off listings.
//
// Pure of the extractor on purpose: worker/extractor.ts cannot load under vitest, so the asking and
// the claiming are here and the resolver only wires them.
import type { SimilarMediaInput } from '../generated/schema/types.generated'
import type { Media } from './store/types'
import type { RequestContext } from './request-context'

import { findAggregatedEpisodesForMedia, findAggregatedMedia, findPartOfMedia, upsertMedia } from './store/db'
import {
  answerNamesOurShow,
  bestRunStartDate,
  describeEvidence,
  hasEvidence,
  similarAskKey,
  SHOW_TITLE_THRESHOLD,
  type RunEvidence,
  type SimilarOutcome,
} from '../sources/similar'
import { isOnlySeasonLabel } from '../sources/season'
import { policyFor } from './request-context'

export type SimilarAsk = { runUri: string, origin: string, showId: string, containerUri: string }

export type SimilarDeps = {
  ask: (origin: string, input: SimilarMediaInput) => Promise<SimilarOutcome>
  implemented: (origin: string) => boolean
}

/** How many times one (run cluster, container) pair is asked in a session; see `drive` for the count. */
export const MAX_ASKS_PER_PAIR = 4

type Question = {
  /** the source's question, `similarAskKey`: everything the answering source reads */
  fingerprint: string
  /** the run's titles as one key, which only the which-show check reads */
  titles: string
  evidence: RunEvidence
  ask: SimilarAsk
}

type AskRecord = {
  /** every uri seen in this run cluster, unioned over reads and over cluster merges, never replaced */
  members: Set<string>
  /** questions already put to this container and REFUSED by the source, so the same one is not asked twice */
  fingerprints: Set<string>
  /**
   * title sets an answer was checked against and did not name our show. Kept apart from the
   * fingerprints: more evidence about the SEASON cannot change the show an answer names, so it asks
   * nothing, while a title landing later can, so it asks again
   */
  refusedTitles: Set<string>
  /** asks that reached `deps.ask`, declines included; the cap reads this */
  asks: number
  /** an answer was claimed, another run of the origin is already in the cluster, or the cap was reached */
  settled: boolean
  /** the driver holding this record's one ask in flight, so two answers can never be claimed for one run */
  driver?: symbol
  /** the record this one was folded into by `recordFor`; a driver resumed on the old record follows it */
  mergedInto?: AskRecord
  /** the newest question a read computed, asked once the in-flight ask settles if it is still new */
  latest?: Question
  /** the one-time skip line was printed */
  skipLogged: boolean
}

/** keyed by container uri; one record per run cluster hanging off that container */
const records = new Map<string, AskRecord[]>()

const ownerOf = (record: AskRecord): AskRecord => {
  while (record.mergedInto) record = record.mergedInto
  return record
}

// A record is found by MEMBER INTERSECTION rather than by `graph.componentId`: `carryComponentId`
// keeps one of the two ids on a union, so a record keyed on the id that did not survive would be
// orphaned and re-asked. Two records both intersecting the cluster are two clusters that were
// unioned since they were last read, and they merge here. The absorbed record keeps a pointer to the
// survivor: its driver, if one is mid-ask, resumes on the survivor and clears the survivor's flag,
// where a copied boolean stayed set for the session and the merged pair was never asked again.
const recordFor = (containerUri: string, cluster: Media[]): AskRecord => {
  let list = records.get(containerUri)
  if (!list) {
    list = []
    records.set(containerUri, list)
  }
  const hits = list.filter(record => cluster.some(media => record.members.has(media.uri)))
  if (!hits.length) {
    const fresh: AskRecord = {
      members: new Set(cluster.map(media => media.uri)),
      fingerprints: new Set(),
      refusedTitles: new Set(),
      asks: 0,
      settled: false,
      skipLogged: false,
    }
    list.push(fresh)
    return fresh
  }
  const [record, ...others] = hits as [AskRecord, ...AskRecord[]]
  for (const other of others) {
    for (const member of other.members) record.members.add(member)
    for (const fingerprint of other.fingerprints) record.fingerprints.add(fingerprint)
    for (const titles of other.refusedTitles) record.refusedTitles.add(titles)
    record.asks += other.asks
    record.settled = record.settled || other.settled
    record.driver = record.driver ?? other.driver
    record.latest = record.latest ?? other.latest
    other.mergedInto = record
    list.splice(list.indexOf(other), 1)
  }
  for (const media of cluster) record.members.add(media.uri)
  if (others.length) console.warn(`similarMedia: consumer merged ${hits.length} records under ${containerUri} (${record.members.size} members)`)
  return record
}

const dedupe = <T>(values: readonly T[]): T[] => [...new Set(values)]

const questionFor = (ask: SimilarAsk, evidence: RunEvidence): Question => ({
  fingerprint: similarAskKey(ask.origin, ask.showId, evidence),
  titles: [...(evidence.titles ?? [])].sort().join('\u0001'),
  evidence,
  ask,
})

const isAsked = (record: AskRecord, question: Question): boolean =>
  record.fingerprints.has(question.fingerprint) || record.refusedTitles.has(question.titles)

/**
 * The asks a run page owes right now: one per container origin that can answer and has no run in the
 * cluster. Whether each is actually asked is decided per record in `resolveSimilarRuns`.
 */
export const planSimilarAsks = (cluster: Media[], containers: Media[], implemented: (origin: string) => boolean): SimilarAsk[] => {
  const runs = cluster.filter(media => media.scope !== 'CONTAINER')
  if (!runs.length) return []
  const runUri = runs.map(media => media.uri).sort()[0]!
  const origins = new Set(cluster.map(media => media.origin))
  const asks: SimilarAsk[] = []
  const seen = new Set<string>()
  for (const container of containers) {
    if (seen.has(container.uri)) continue
    seen.add(container.uri)
    if (!implemented(container.origin)) continue
    if (origins.has(container.origin)) continue
    asks.push({ runUri, origin: container.origin, showId: container.id, containerUri: container.uri })
  }
  return asks
}

const byScoreDescending = (a: Media, b: Media) => {
  if (a.score == null) return b.score == null ? 0 : 1
  if (b.score == null) return -1
  return b.score - a.score
}

/** What the cluster knows about its run, in the shape the answering source reads. */
export const runEvidence = (cluster: Media[], episodeTitles: readonly string[]): RunEvidence => {
  const sorted = [...cluster].sort(byScoreDescending)
  return {
    titles: dedupe(sorted.flatMap(media => (media.titles ?? []).map(title => title.title))).filter(title => !isOnlySeasonLabel(title)),
    startDate: bestRunStartDate(sorted.map(media => media.startDate)),
    episodeCount: sorted.find(media => media.episodeCount != null)?.episodeCount ?? undefined,
    episodeTitles: dedupe(episodeTitles).slice(0, 200),
  }
}

/**
 * Ask a record's newest question until the pair settles or the question repeats. One driver per
 * record at a time; a read landing while an ask is in flight only moves `latest`, and the loop
 * re-checks it when the ask settles. A decline never reached the source, so nothing is recorded and
 * the next read retries it; a refusal did, so the same evidence is not put again; an answer naming
 * another show is recorded with the titles it was checked against, so a title landing later (the
 * English one after a romaji-only first read, which scores 0.44 against Crunchyroll's English series
 * title) asks again and the same answer is checked again.
 */
const drive = async (start: AskRecord, context: RequestContext, deps: SimilarDeps): Promise<void> => {
  if (start.driver) {
    const { ask } = start.latest!
    console.warn(`similarMedia: consumer deferred ${ask.origin} ${ask.showId} for ${ask.runUri} (an ask is in flight; asked when it settles if still new)`)
    return
  }
  const driver = Symbol('similarMedia consumer driver')
  start.driver = driver
  let record = start
  try {
    for (;;) {
      // the record may have been folded into another since the last iteration: follow it, and take
      // it over if nobody is driving it, else leave the loop to the driver that is
      record = ownerOf(record)
      record.driver ??= driver
      if (record.driver !== driver) return
      if (record.settled || !record.latest || isAsked(record, record.latest)) return
      const question = record.latest
      const { evidence, ask } = question
      if (record.asks >= MAX_ASKS_PER_PAIR) {
        record.settled = true
        console.warn(`similarMedia: consumer settled ${ask.origin} ${ask.showId} for ${ask.runUri} (cap ${MAX_ASKS_PER_PAIR} reached)`)
        return
      }
      record.asks += 1
      console.warn(`similarMedia: consumer asked ${ask.origin} ${ask.showId} for ${ask.runUri} (ask ${record.asks} of ${MAX_ASKS_PER_PAIR}) with ${describeEvidence(evidence)}`)
      const result = await deps.ask(ask.origin, {
        showId: ask.showId,
        context,
        startDate: evidence.startDate ?? undefined,
        titles: evidence.titles ? [...evidence.titles] : undefined,
        episodeCount: evidence.episodeCount ?? undefined,
        episodeTitles: evidence.episodeTitles ? [...evidence.episodeTitles] : undefined,
      })
      record = ownerOf(record)
      if (record.settled) {
        console.warn(`similarMedia: consumer dropped ${ask.origin} ${ask.showId} for ${ask.runUri} (the pair settled while the ask was in flight)`)
        return
      }
      if (result.outcome === 'declined') {
        console.warn(`similarMedia: consumer declined ${ask.origin} ${ask.showId} for ${ask.runUri} (${result.reason}); retries on the next read`)
        return
      }
      if (result.outcome === 'refused') {
        record.fingerprints.add(question.fingerprint)
        console.warn(`similarMedia: consumer refused ${ask.origin} ${ask.showId} for ${ask.runUri} (${result.reason}); re-asks on new evidence`)
        continue
      }
      // another caller (anilist's own mapping, or a merged record's ask) may have named this origin's
      // run while the ask was in flight; a second run of one origin in one cluster is two seasons
      // welded, so the cluster is re-read and an answer that is not the run already there is refused
      const present = (await findAggregatedMedia(ask.runUri)).find(media => media.origin === ask.origin && media.scope !== 'CONTAINER')
      if (present) {
        record.settled = true
        if (present.uri === result.media.uri) console.warn(`similarMedia: consumer settled ${ask.origin} ${ask.showId} for ${ask.runUri} (${present.uri} is already the cluster's ${ask.origin} run)`)
        else console.warn(`similarMedia: consumer refused-by-origin ${result.media.uri} for ${ask.runUri} (${present.uri} is already the cluster's ${ask.origin} run)`)
        return
      }
      const runTitles = evidence.titles ?? []
      const answerTitles = (result.media.titles ?? []).map(title => title.title)
      const verdict = await answerNamesOurShow(runTitles, answerTitles)
      if (!verdict.ok) {
        record.refusedTitles.add(question.titles)
        console.warn(`similarMedia: consumer refused-by-title ${result.media.uri} for ${ask.runUri} (best ${verdict.score.toFixed(3)} of ${runTitles.length} run titles against ${answerTitles.length} answer titles, threshold ${SHOW_TITLE_THRESHOLD}); re-asks on a new title`)
        continue
      }
      record.settled = true
      await upsertMedia([], [{ mediaUri: ask.runUri, handleUri: result.media.uri, relation: 'SAME_AS' }])
      console.warn(`similarMedia: consumer claimed ${result.media.uri} as SAME_AS of ${ask.runUri}`)
      return
    }
  } catch (cause) {
    console.error(new Error('similarMedia consumer failed', { cause }))
  } finally {
    for (let held: AskRecord | undefined = start; held; held = held.mergedInto) {
      if (held.driver === driver) held.driver = undefined
    }
  }
}

/**
 * Ask every owed container origin and claim each answer as SAME_AS of the run. Never throws.
 *
 * Only a root whose policy spends cross-source work asks (a listing never does). A read with no
 * evidence records nothing, and a read whose run has no title asks nothing, since an answer could not
 * be checked against the show. The claim goes through `upsertMedia` with no rows: the answer's own
 * row lands through the answering extractor's insertion, the claim waits for it under
 * `pendingClaims`, and a RUN x RUN union emits `media:changed`, which re-runs the page's read, whose
 * re-ask of the newly named origin is how the answer's episodes reach the store. The container edge is
 * never touched.
 */
export const resolveSimilarRuns = async (cluster: Media[], context: RequestContext, deps: SimilarDeps): Promise<void> => {
  try {
    if (!policyFor({ context }).crossSource) return
    const asks = planSimilarAsks(cluster, findPartOfMedia(cluster), deps.implemented)
    if (!asks.length) return
    const episodes = await findAggregatedEpisodesForMedia(cluster.map(media => media.uri))
    const evidence = runEvidence(cluster, episodes.flat().flatMap(episode => (episode.titles ?? []).map(title => title.title)))
    if (!hasEvidence(evidence)) return
    await Promise.all(asks.map(ask => {
      const record = recordFor(ask.containerUri, cluster)
      if (record.settled) return
      if (!evidence.titles?.length) {
        if (!record.skipLogged) {
          record.skipLogged = true
          console.warn(`similarMedia: consumer skipped ${ask.origin} ${ask.showId} for ${ask.runUri} (no run titles to verify the show against)`)
        }
        return
      }
      record.latest = questionFor(ask, evidence)
      return drive(record, context, deps)
    }))
  } catch (cause) {
    console.error(new Error('similarMedia consumer failed', { cause }))
  }
}

/** TESTS ONLY: forget every (cluster, container) record. */
export const resetSimilarAsks = () => { records.clear() }
