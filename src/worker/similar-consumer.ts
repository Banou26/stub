// The one place the app asks `similarMedia`: on a run's page, after aggregation, once per (run
// cluster, container origin) per session.
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

import { findAggregatedEpisodesForMedia, findPartOfMedia, upsertMedia } from './store/db'
import { bestRunStartDate, hasEvidence, type RunEvidence } from '../sources/similar'
import { isOnlySeasonLabel } from '../sources/season'
import { policyFor } from './request-context'

export type SimilarAsk = { runUri: string, origin: string, showId: string, containerUri: string }

export type SimilarDeps = {
  ask: (origin: string, input: SimilarMediaInput) => Promise<{ uri: string, origin: string, id: string, scope?: string | null } | undefined>
  implemented: (origin: string) => boolean
}

// Keyed by container uri, holding every member uri of the cluster at the time it was asked. A cluster
// is "already asked" when ANY current member is in the set: membership only grows, so this reads as
// once per run cluster per session and survives the cluster gaining members.
const asked = new Map<string, Set<string>>()

const alreadyAsked = (containerUri: string, cluster: Media[]) => {
  const members = asked.get(containerUri)
  return Boolean(members && cluster.some(media => members.has(media.uri)))
}

const dedupe = <T>(values: readonly T[]): T[] => [...new Set(values)]

/**
 * The asks a run page still owes: one per container origin that can answer, skipped once asked for
 * this cluster or already answered by a run of that origin in it. Recording happens here, so a
 * planned ask counts as made whether or not evidence turns up for it.
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
    if (alreadyAsked(container.uri, cluster)) continue
    asked.set(container.uri, new Set(cluster.map(media => media.uri)))
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
 * Ask every owed container origin and claim each answer as SAME_AS of the run. Never throws.
 *
 * Only a root whose policy spends cross-source work asks (a listing never does). The claim goes
 * through `upsertMedia` with no rows: the answer's own row lands through the answering extractor's
 * insertion, the claim waits for it under `pendingClaims`, and a RUN x RUN union emits `media:changed`,
 * which re-runs the page's read, whose re-ask of the newly named origin is how the answer's episodes
 * reach the store. The container edge is never touched.
 */
export const resolveSimilarRuns = async (cluster: Media[], context: RequestContext, deps: SimilarDeps): Promise<void> => {
  try {
    if (!policyFor({ context }).crossSource) return
    const asks = planSimilarAsks(cluster, findPartOfMedia(cluster), deps.implemented)
    if (!asks.length) return
    const episodes = await findAggregatedEpisodesForMedia(cluster.map(media => media.uri))
    const evidence = runEvidence(cluster, episodes.flat().flatMap(episode => (episode.titles ?? []).map(title => title.title)))
    if (!hasEvidence(evidence)) return
    await Promise.all(asks.map(async ask => {
      try {
        const answer = await deps.ask(ask.origin, {
          showId: ask.showId,
          context,
          startDate: evidence.startDate ?? undefined,
          titles: evidence.titles ? [...evidence.titles] : undefined,
          episodeCount: evidence.episodeCount ?? undefined,
          episodeTitles: evidence.episodeTitles ? [...evidence.episodeTitles] : undefined,
        })
        if (!answer) return
        await upsertMedia([], [{ mediaUri: ask.runUri, handleUri: answer.uri, relation: 'SAME_AS' }])
      } catch (cause) {
        console.error(new Error('similarMedia consumer failed', { cause }))
      }
    }))
  } catch (cause) {
    console.error(new Error('similarMedia consumer failed', { cause }))
  }
}

/** TESTS ONLY: forget which (cluster, container) pairs were asked. */
export const resetSimilarAsks = () => { asked.clear() }
