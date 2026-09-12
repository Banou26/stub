/**
 * `plugin:range`, P4 of 5.4: which rows of a longer packaging are THIS run's episodes, proven one
 * episode at a time.
 *
 * WHAT IT REPLACES, AND WHAT IT KEEPS. `alignmentOffset` (`consensus.ts:113-155`) read a single
 * OFFSET off the dates two sources share and shifted a whole list by it. The evidence survives here
 * verbatim (distinct numbers per UTC day, a day of slack for the Tokyo boundary, a day naming two
 * reference numbers disqualified, `MIN_ALIGNED` or nothing) and the conclusion does not: what is
 * written is one `EPISODE_LINK` per episode, so an inserted special costs one episode its link
 * rather than shifting every later one (3.4). The title-vote offset that put 13 of 25 Blue Exorcist
 * rows on the wrong Netflix episode (2026-09-10) has no successor: there is no offset anywhere.
 *
 * IT MINTS NO `SAME_AS` BETWEEN MEDIA. Rule 3 and the "every episode paired, therefore the same
 * thing" upgrade were both deleted from 5.4 P4: a season that holds this run is a container whatever
 * share of it pairs, and 8.4 is the case that says so, five Netflix seasons each `PART_OF` one run
 * with no upgrade at any coverage. The `PART_OF` that reached a candidate stays exactly as it was in
 * every branch below, including the one that mints a range.
 *
 * PAIRS ARE ONLY EVER ONTO AN EXISTING MEMBER EPISODE, inside `1..runLength`. That is what lets a
 * date pair skip the two-witness bar a count-based loan needed (`consensus.ts:171,234`): the loan was
 * placed BY NUMBER onto a row that might not exist, and a pair is placed by a shared day onto a row
 * the run's own sources already list. The bar still applies to the window, which is P5's.
 *
 * WHAT IT PROMISES. Same graph, same scope, same output: every scan is ordered, every candidate is
 * decided by a pure function of the two episode lists and the cluster's length, and the one place
 * two rows could be picked from (several reference rows carrying one number on one day) resolves on
 * the lowest uri rather than on arrival order.
 *
 * THE 2C HOOK. `delta` is not built, so `ctx.delta.full` is always true and every scan below reads
 * the whole graph rather than the run clusters in `delta.clusters`. The statements are the anchored
 * ones of 5.4 P4 with the `UNWIND $clusters` head removed, which is also what keeps an empty graph
 * from meeting the empty-`UNWIND` runtime death (2026-09-12).
 *
 * THREE SPELLING CHOICES the spec's own Cypher does not fix, each made for a stated reason:
 * - The class 1 scan is UNDIRECTED, because a `PART_OF` points from the shorter side to the longer
 *   and 8.4's five seasons therefore point INTO the run. The reason is beside the statement.
 * - The scans return FLAT ROWS and are grouped in JS, where 5.4 P4 collects a struct per candidate. A
 *   struct field is typed from the first row of a list and a JSON column inside one is unmeasured on
 *   0.20.4, and the failure mode of getting that wrong is a whole statement dying at runtime after
 *   the binder passed it (`00-engine-facts.md`, step 1b).
 * - The candidate scan's uncertain set carries `asserted` from a FOLDING origin beside the six
 *   reasons 5.4 P4 lists. A Crunchyroll season reached by a source claim rather than by an `ask`
 *   lands as `asserted` (`plugin:direct`'s table), and 8.1 is exactly that row until a source ships
 *   `containing` (4.4).
 *
 * THE FOURTH INPUT, `EPISODE_CLAIMS`, is the one rule here that weighs no evidence of its own: a
 * source said two episodes are the same, and all this plugin decides is whether the two rows are
 * anywhere near each other in the graph. Inside one RUN cluster, or across an active attachment, it
 * is an `asserted` pair; anywhere else it is written REFUSED `foreign-episode`, which is
 * `db.ts:410`'s union with the guards it never had ("accepts a uri that was never set"). It is the
 * only reader that table has. The refusal is a row rather than a silence because the claim edge is
 * already there to hang it off, which is the same test the lend and member classes fail below: a
 * plugin may not invent an edge to carry its own silence.
 */
import type { EpisodeLinkProposal, LinkProposal, Plugin, PluginContext, PluginOutput } from './contract'

import { EPISODE_TITLE_COVERAGE, MIN_EPISODE_TITLE_MATCHES } from '../../../sources/similar'
import { stripTitle } from '../../../sources/utils'
import { RETRANSLATING_ORIGINS } from './origins'

/** The version of 5.1: bumped when a rule below changes, which retracts and recomputes every row. */
export const RANGE_VERSION = 1

/**
 * Two pairs or nothing (`consensus.ts:111`).
 *
 * One shared date is a coincidence: a twelve episode run and a twenty-four episode season share a
 * weekday, and any two lists dated a week apart share their first day about one time in seven.
 */
export const MIN_ALIGNED = 2

/**
 * A day either side, because one broadcast is two dates (`consensus.ts:136-140`).
 *
 * ani.zip stamps `2021-01-10T15:00:00Z`, which is the 11th in Tokyo, and Crunchyroll publishes the
 * Tokyo date. Episodes are a week apart, so a day of slack cannot reach the neighbour, and the
 * ambiguity refusal still applies across the whole window.
 */
export const DAY_SLACK = 1

/** Why nothing was minted for a candidate, written onto its refused `LINK` row so it is queryable. */
export type RangeRefusal = 'no-dates' | 'ambiguous-day' | 'retranslates' | 'no-titles'

/** One episode of either side, as both rules read it. */
export type SideEpisode = {
  uri: string
  /** The origin that NUMBERED it, which is the episode's own and not the row it hangs off (4.4). */
  origin: string
  number: number | null
  /** The UTC day of its release date, or NULL when it carries none (5.4 P0, `consensus.ts:85-88`). */
  day: number | null
  /** `EpisodeProfile.titleKeys`, which are already stripped and already free of generic titles. */
  keys: string[]
  /** The `HAS_EPISODE` key it hangs by, which every edge derived from it names in `supports`. */
  hung: string
}

/** One proven pair: their row, our row, and what proved it. */
export type Pair = {
  from: SideEpisode
  to: SideEpisode
  fromNumber: number
  toNumber: number
  evidence: { day: number, slack: number } | { key: string }
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byUri = (a: SideEpisode, b: SideEpisode): number => compare(a.uri, b.uri)

/**
 * Rule 1 of 5.4 P4, by DATE: every candidate row a single reference number is reachable from.
 *
 * `runByDay` holds DISTINCT NUMBERS per day rather than rows per day, which is the whole of
 * `consensus.ts:118-127`: several sources describing one run all saying that this day is episode 1 is
 * the opposite of an ambiguity, and what disqualifies a day is the RUN using it for two different
 * episodes. The candidate's own day, then the day before, then the day after: the number is unique
 * across the three or the row is refused, and `ambiguous` counts the rows refused that way so the
 * verdict can say `ambiguous-day` rather than `no-dates`.
 *
 * The row a pair NAMES is the dated reference row that proved it, never merely a row carrying that
 * number: a Kitsu episode 1 with no date is the same broadcast, but it is not the evidence, and the
 * trace prints what was measured. Ties inside that (two reference rows on one day with one number)
 * go to the lowest uri, so the output does not depend on the scan's order.
 */
export const pairsByDay = (
  reference: readonly SideEpisode[],
  theirs: readonly SideEpisode[]
): { pairs: Pair[], ambiguous: number } => {
  const byDay = new Map<number, Map<number, SideEpisode>>()
  for (const episode of [...reference].sort(byUri)) {
    if (episode.day === null || episode.number === null) continue
    const numbers = byDay.get(episode.day) ?? new Map<number, SideEpisode>()
    if (!numbers.has(episode.number)) numbers.set(episode.number, episode)
    byDay.set(episode.day, numbers)
  }
  if (!byDay.size) return { pairs: [], ambiguous: 0 }

  const pairs: Pair[] = []
  let ambiguous = 0
  for (const episode of [...theirs].sort(byUri)) {
    if (episode.day === null || episode.number === null) continue
    // the exact day first, so a number reachable on two of the three days is taken from the one the
    // candidate itself published and the recorded slack is the smallest true one
    const reachable = new Map<number, SideEpisode>()
    for (const day of [episode.day, episode.day - DAY_SLACK, episode.day + DAY_SLACK]) {
      for (const [number, row] of byDay.get(day) ?? []) {
        if (!reachable.has(number)) reachable.set(number, row)
      }
    }
    if (!reachable.size) continue
    if (reachable.size > 1) {
      ambiguous += 1
      continue
    }
    const [target] = [...reachable.values()]
    pairs.push({
      from: episode,
      to: target!,
      fromNumber: episode.number,
      toNumber: target!.number!,
      evidence: { day: episode.day, slack: episode.day - target!.day! },
    })
  }
  return { pairs, ambiguous }
}

/** A key present more than once on a side carries no identity there, so it is dropped rather than guessed. */
const uniqueKeys = (episodes: readonly SideEpisode[]): Map<string, SideEpisode | null> => {
  const index = new Map<string, SideEpisode | null>()
  for (const episode of [...episodes].sort(byUri)) {
    for (const key of keysOf(episode)) {
      if (index.has(key)) index.set(key, null)
      else index.set(key, episode)
    }
  }
  return index
}

/**
 * The keys of one row, through `stripTitle` again.
 *
 * `EpisodeProfile.titleKeys` is already stripped and already free of generic titles (5.4 P0), so this
 * is idempotent today. It is applied anyway because the equality below IS the strip: reading it off
 * the column would make rule 2 depend on the profile having normalised the same way, which is the
 * kind of agreement that holds until one of the two changes.
 */
const keysOf = (episode: SideEpisode): string[] =>
  [...new Set(episode.keys.map(stripTitle).filter(Boolean))].sort(compare)

/**
 * Rule 2 of 5.4 P4, by TITLE: exact key equality, both sides non-generic, nothing ambiguous.
 *
 * The bar to mint anything is `MIN_EPISODE_TITLE_MATCHES = 3` and coverage `>= 0.6` of the
 * CANDIDATE's non-generic titles (`similar.ts:59-69`), so a fold of two equal cours scores 12/24 and
 * mints nothing while a season with a four episode bonus block scores 12/16 and is admitted. Only the
 * date rule can prove a fold, which is the point of measuring coverage against the candidate.
 *
 * `coverage` is reported whatever the verdict, so a refusal can say which half of the bar it missed.
 */
export const pairsByTitle = (
  reference: readonly SideEpisode[],
  theirs: readonly SideEpisode[]
): { pairs: Pair[], titled: number, coverage: number } => {
  const ours = uniqueKeys(reference)
  const mine = uniqueKeys(theirs)
  const titled = theirs.filter(episode => keysOf(episode).length).length

  const pairs: Pair[] = []
  for (const episode of [...theirs].sort(byUri)) {
    if (episode.number === null) continue
    const matched = new Map<string, { target: SideEpisode, key: string }>()
    for (const key of keysOf(episode)) {
      // a key this side carries twice says nothing about which of its own rows is meant
      if (mine.get(key) !== episode) continue
      const target = ours.get(key)
      if (!target || target.number === null) continue
      if (!matched.has(target.uri)) matched.set(target.uri, { target, key })
    }
    // two different reference rows reached through two keys is an ambiguity, not two matches
    if (matched.size !== 1) continue
    const [match] = [...matched.values()]
    pairs.push({
      from: episode,
      to: match!.target,
      fromNumber: episode.number,
      toNumber: match!.target.number!,
      evidence: { key: match!.key },
    })
  }
  return { pairs, titled, coverage: titled ? pairs.length / titled : 0 }
}

/** One thing to be proven against one run: a season row, a lend, or a member that numbers differently. */
export type Candidate = {
  clusterId: string
  /**
   * `season`: a row attached by an uncertain `PART_OF` (class 1). `lend`: episodes a foreign claimer
   * hung on a member, with no row of their own (class 2, 4.4). `member`: a member of this very
   * cluster whose numbering does not fit `1..runLength` (class 3, the Elusive Samurai shape).
   */
  kind: 'season' | 'lend' | 'member'
  /** The row the `INCLUDES` and the refusal hang off, which only a `season` candidate has. */
  seasonUri: string | null
  /** The member the `INCLUDES` points at: the one the `PART_OF` was claimed from. */
  memberUri: string | null
  /** The `LINK` keys the candidate was reached through, which every edge derived from it names. */
  via: string[]
  /** `coalesce(countDistinct, countStated)` of the candidate, which is `total` on a range (3.4). */
  theirCount: number | null
  retranslates: boolean
  episodes: SideEpisode[]
}

/** What one candidate came to: the pairs and the rule that proved them, or the reason for nothing. */
export type Verdict =
  | { ok: true, rule: 'dates' | 'titles', pairs: Pair[], coverage: number }
  | { ok: false, reason: RangeRefusal }

/**
 * The decision rules of 5.4 P4 in order, each refusing on ambiguity rather than falling through.
 *
 * | outcome | when |
 * | --- | --- |
 * | `dates` | rule 1 left at least `MIN_ALIGNED` pairs inside the window |
 * | `titles` | rule 1 did not, the candidate's origin does not retranslate, and rule 2 cleared both halves of its bar |
 * | `retranslates` | rule 1 proved nothing and rule 2 was refused outright (Netflix, 4 exact of 25, the best wrong pair above the true one, 2026-09-10) |
 * | `ambiguous-day` | rule 1 reached reference days and a day named two reference numbers |
 * | `no-titles` | both sides carry non-generic titles and rule 2 still missed its bar |
 * | `no-dates` | everything else: the date rule could not run or its days met nothing, and the title rule had no material either |
 *
 * THE WINDOW IS APPLIED BEFORE THE BAR. A pair whose `toNumber` falls outside `1..runLength` is
 * dropped rather than counted (`consensus.ts:185-191`): a season containing this run brings episodes
 * on both sides of it, the previous cour lands at zero and below and the next above the length, and
 * counting those toward `MIN_ALIGNED` would let a neighbouring cour carry a fold over the bar.
 */
export const decideCandidate = (options: {
  runLength: number
  reference: readonly SideEpisode[]
  candidate: Pick<Candidate, 'retranslates' | 'episodes'>
}): Verdict => {
  const { runLength, reference, candidate } = options
  const inWindow = (pairs: Pair[]) => pairs.filter(pair => pair.toNumber >= 1 && pair.toNumber <= runLength)

  const dates = pairsByDay(reference, candidate.episodes)
  const dated = inWindow(dates.pairs)
  if (dated.length >= MIN_ALIGNED) return { ok: true, rule: 'dates', pairs: dated, coverage: 1 }

  if (candidate.retranslates) return { ok: false, reason: 'retranslates' }

  const titles = pairsByTitle(reference, candidate.episodes)
  const titled = inWindow(titles.pairs)
  if (titled.length >= MIN_EPISODE_TITLE_MATCHES && titles.coverage >= EPISODE_TITLE_COVERAGE) {
    return { ok: true, rule: 'titles', pairs: titled, coverage: titles.coverage }
  }

  if (dates.ambiguous) return { ok: false, reason: 'ambiguous-day' }
  // `no-titles` says the title rule had material on both sides and missed its bar, which is the more
  // specific of the two; `no-dates` is the fallback, and it covers both "one side carries no day" and
  // "the days met nothing", since neither rule then had anything to be refused ON
  const titledBothSides = reference.some(episode => keysOf(episode).length)
    && candidate.episodes.some(episode => keysOf(episode).length)
  return { ok: false, reason: titledBothSides ? 'no-titles' : 'no-dates' }
}

/** The `INCLUDES` range of 3.4, as literal properties: the hull of the pairs on both sides. */
export type Hull = {
  fromStart: number, fromEnd: number, toStart: number, toEnd: number
  contiguous: boolean, aligned: number, total: number
}

/**
 * The hull of a set of pairs.
 *
 * `contiguous` is a statement about the pairs rather than about the span: a range covering every
 * number between its ends on both sides is contiguous, and the piecewise mapping an inserted special
 * produces (1 to 13 onto 1 to 13, then 15 to 26 onto 14 to 25, 8.3) is one range that is not, which
 * is exactly what the column exists to say.
 */
export const hullOf = (pairs: readonly Pair[], total: number): Hull | null => {
  if (!pairs.length) return null
  const from = pairs.map(pair => pair.fromNumber)
  const to = pairs.map(pair => pair.toNumber)
  const fromStart = Math.min(...from)
  const fromEnd = Math.max(...from)
  const toStart = Math.min(...to)
  const toEnd = Math.max(...to)
  return {
    fromStart,
    fromEnd,
    toStart,
    toEnd,
    contiguous: fromEnd - fromStart + 1 === pairs.length && toEnd - toStart + 1 === pairs.length,
    aligned: pairs.length,
    total,
  }
}

// ---------------------------------------------------------------------------------------------
// The candidate scan of 5.4 P4, one statement per class, joined in JS on the cluster id.

/** The run clusters, and the length every window and every reference set is read against. */
const CLUSTER_SCAN =
  `MATCH (c:Cluster)
   WHERE c.scope = 'RUN' AND c.runLength IS NOT NULL
   RETURN c.id AS id, c.runLength AS runLength, c.runLengthFrom AS runLengthFrom
   ORDER BY id`

/** Who is in each run cluster, so a candidate that is already a member cannot be given a range (3.5). */
const MEMBER_SCAN =
  `MATCH (m:Media)-[:MEMBER_OF]->(c:Cluster)
   WHERE c.scope = 'RUN'
   RETURN c.id AS id, m.uri AS uri
   ORDER BY id, uri`

/** `ours`: the run's own episodes, hung by their own origin. The reference set is chosen in JS. */
const OURS_SCAN =
  `MATCH (c:Cluster)<-[:MEMBER_OF]-(o:Media)-[oh:HAS_EPISODE]->(oe:Episode)<-[:PROFILE_OF]-(poe:EpisodeProfile)
   WHERE c.scope = 'RUN' AND oh.claimer = o.origin AND oe.origin = o.origin
   RETURN c.id AS runCluster, o.uri AS memberUri, oe.uri AS uri, oe.origin AS origin,
     oe.episodeNumber AS number, poe.day AS day, poe.titleKeys AS keys, oh.key AS hung
   ORDER BY runCluster, uri`

/**
 * Class 1: a season attached to a run by an uncertain `PART_OF`.
 *
 * Any origin with a season row, since appletv and tvmaze can answer `containing` as well as the
 * folding three (4.4); `folding` gates the count guards and, here, only the `asserted` reason, which
 * is what a source claim rather than an `ask` leaves behind.
 *
 * UNDIRECTED, where 5.4 P4's own spelling reads the run to season direction only. A `PART_OF` points
 * from the SHORTER side to the longer (`guards.ts`'s `downgradeTo`), so a fold of 24 against a run of
 * 11 lands as run to season while the five Netflix seasons of a 64 episode run land as season to run
 * (8.4, "downgrade to `PART_OF(season, run)` reason `count-mismatch`"), and a directed scan sees one
 * of the two. Nothing about the verdict changes: a range is minted only when the candidate is LONGER
 * than the run, which is the second row of the table, so a season reached the other way is proven
 * episode by episode and labels nothing.
 */
const SEASON_SCAN =
  `MATCH (c:Cluster)<-[:MEMBER_OF]-(r:Media)-[l:LINK]-(s:Media)<-[:PROFILE_OF]-(ps:MediaProfile)
   WHERE c.scope = 'RUN' AND l.kind = 'PART_OF' AND l.status = 'active' AND s.uri <> r.uri
     AND (l.reason IN ['count-mismatch', 'no-length', 'span', 'containing', 'contested', 'cross-scope']
       OR (l.reason = 'asserted' AND ps.folding))
   MATCH (s)-[h:HAS_EPISODE]->(se:Episode)<-[:PROFILE_OF]-(pse:EpisodeProfile)
   WHERE h.claimer = s.origin
   RETURN c.id AS runCluster, r.uri AS memberUri, s.uri AS seasonUri, l.key AS via,
     coalesce(ps.countDistinct, ps.countStated) AS theirCount, ps.retranslates AS retranslates,
     se.uri AS uri, se.origin AS origin, se.episodeNumber AS number,
     pse.day AS day, pse.titleKeys AS keys, h.key AS hung
   ORDER BY runCluster, seasonUri, uri, memberUri, via`

/**
 * Class 2, the transitional lend: episodes a FOREIGN claimer hung on a member (4.4).
 *
 * `cr:` rows on an `anilist:` uri, grouped by claimer, with no season uri and no count. They are in
 * the graph and in no other collection, and they are evidence here and a slot nowhere.
 */
const LEND_SCAN =
  `MATCH (c:Cluster)<-[:MEMBER_OF]-(m:Media)-[h:HAS_EPISODE]->(e:Episode)<-[:PROFILE_OF]-(pe:EpisodeProfile)
   WHERE c.scope = 'RUN' AND h.claimer <> m.origin
   RETURN c.id AS runCluster, m.uri AS memberUri, h.claimer AS claimer, e.uri AS uri, e.origin AS origin,
     e.episodeNumber AS number, pe.day AS day, pe.titleKeys AS keys, h.key AS hung
   ORDER BY runCluster, claimer, uri, hung`

/** The fourth input: every episode `SAME_AS` a source stated, which is the only reader that table has. */
const EPISODE_CLAIM_SCAN =
  `MATCH (a:Episode)-[c:EPISODE_CLAIMS]->(b:Episode)
   WHERE c.kind = 'SAME_AS'
   RETURN a.uri AS fromUri, b.uri AS toUri, c.key AS claimKey,
     a.episodeNumber AS fromNumber, b.episodeNumber AS toNumber
   ORDER BY fromUri, toUri, claimKey`

/**
 * Where a claimed episode SITS: the run clusters whose members hang it, by whatever claimer (4.4).
 *
 * Unlike `OURS_SCAN` this asks nothing about the claimer, because the question here is not whose
 * numbering to trust but whether the two rows of a claim are describing one run at all.
 */
const MEMBER_EPISODE_SCAN =
  `MATCH (c:Cluster)<-[:MEMBER_OF]-(m:Media)-[:HAS_EPISODE]->(e:Episode)
   WHERE c.scope = 'RUN'
   RETURN c.id AS clusterId, e.uri AS uri
   ORDER BY clusterId, uri`

/**
 * The other side of the same question: episodes of a season ATTACHED to a run by an active
 * `PART_OF`, which is the one hop a claim may cross (5.4 P4).
 *
 * Undirected for `SEASON_SCAN`'s reason: a downgrade points from the shorter side to the longer, so a
 * directed scan sees one of the two directions a containment can take. Any reason counts here, where
 * the candidate scan takes only the uncertain ones: a claim is not being PROVEN, it is being placed.
 */
const ATTACHED_EPISODE_SCAN =
  `MATCH (c:Cluster)<-[:MEMBER_OF]-(r:Media)-[l:LINK]-(s:Media)-[h:HAS_EPISODE]->(e:Episode)
   WHERE c.scope = 'RUN' AND l.kind = 'PART_OF' AND l.status = 'active' AND s.uri <> r.uri
     AND h.claimer = s.origin
   RETURN c.id AS clusterId, e.uri AS uri
   ORDER BY clusterId, uri`

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
const asNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null

/** An empty `STRING[]` reads back as NULL on this engine (2026-09-12), so the list is normalised here. */
const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/** `EpisodeProfile.titleKeys` as the keys alone: `[{key, score, language, class}]` read off a JSON column. */
const keyListOf = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(entry => (entry && typeof entry === 'object' ? (entry as { key?: unknown }).key : undefined))
      .filter((key): key is string => typeof key === 'string' && Boolean(key))
  } catch {
    return []
  }
}

const originOf = (uri: string): string => uri.slice(0, uri.indexOf(':'))

const episodeOf = (row: Record<string, unknown>): SideEpisode => ({
  uri: String(row.uri),
  origin: asText(row.origin) ?? originOf(String(row.uri)),
  number: asNumber(row.number),
  day: asNumber(row.day),
  keys: keyListOf(row.keys),
  hung: String(row.hung ?? ''),
})

/** Where one claimed episode sits: the run clusters that hold it, as a member's row or as a season's. */
export type Placement = { members: readonly string[], attached: readonly string[] }

/**
 * Whether an `EPISODE_CLAIMS` row may become an `asserted` pair (5.4 P4).
 *
 * The claim is admitted when both rows hang on members of ONE run cluster, or when one hangs on a
 * member and the other on a season attached to that same cluster by an active `PART_OF`. Two rows
 * that only share an ATTACHMENT are refused: two seasons hanging off one run is exactly the fold
 * this file exists to prove episode by episode, and a source asserting across it is asserting the
 * thing a pair is supposed to demonstrate.
 */
export const placesClaim = (from: Placement, to: Placement): boolean => {
  const shares = (a: readonly string[], b: readonly string[]): boolean => a.some(id => b.includes(id))
  return shares(from.members, to.members) || shares(from.members, to.attached) || shares(from.attached, to.members)
}

/**
 * Class 3, in JS: a member ORIGIN whose own numbering does not fit `1..runLength`.
 *
 * Grouped by origin and never by the row an episode hangs off, for `alignRunEpisodes`' own reason
 * (`consensus.ts:265-273`): the origin is the thing that numbers. A reference origin is never a
 * candidate against itself, and an origin that already starts at 1 and stays inside the length has
 * nothing to renumber, so Crunchyroll's 13 to 20 against a run of 12 is the whole of what this finds.
 */
export const numbersOutsideRun = (episodes: readonly SideEpisode[], runLength: number): boolean => {
  const numbers = episodes.map(episode => episode.number).filter((number): number is number => number !== null)
  if (!numbers.length) return false
  return Math.min(...numbers) !== 1 || Math.max(...numbers) > runLength
}

/**
 * `plugin:range`, P4 of 5.4.
 *
 * Consumes `Cluster`, `MEMBER_OF`, `LINK` (`PART_OF`), `HAS_EPISODE`, `Episode`, `EpisodeProfile` and
 * `MediaProfile`; produces `EPISODE_LINK` `SAME_AS` and `LINK` `INCLUDES`; `after: [plugin:aggregate,
 * plugin:containment]`, because the run length, the membership and the `span` reason it scans for are
 * all written by those two.
 */
export const rangePlugin: Plugin = {
  id: 'plugin:range',
  consumes: {
    nodes: ['Cluster', 'Episode', 'EpisodeProfile', 'MediaProfile'],
    edges: ['MEMBER_OF', 'LINK', 'HAS_EPISODE', 'EPISODE_CLAIMS'],
    kinds: ['PART_OF'],
  },
  produces: { nodes: [], edges: ['LINK', 'EPISODE_LINK'], kinds: ['INCLUDES'] },
  after: ['plugin:aggregate', 'plugin:containment'],
  version: RANGE_VERSION,
  run: async (ctx: PluginContext): Promise<PluginOutput> => {
    type Row = Record<string, unknown>
    const [clusterRows, memberRows, ourRows, seasonRows, lendRows, claimRows, placedRows, attachedRows] = await Promise.all([
      ctx.query<Row>(CLUSTER_SCAN),
      ctx.query<Row>(MEMBER_SCAN),
      ctx.query<Row>(OURS_SCAN),
      ctx.query<Row>(SEASON_SCAN),
      ctx.query<Row>(LEND_SCAN),
      ctx.query<Row>(EPISODE_CLAIM_SCAN),
      ctx.query<Row>(MEMBER_EPISODE_SCAN),
      ctx.query<Row>(ATTACHED_EPISODE_SCAN),
    ])

    const members = new Map<string, Set<string>>()
    for (const row of memberRows) {
      const id = String(row.id)
      members.set(id, (members.get(id) ?? new Set<string>()).add(String(row.uri)))
    }

    const ours = new Map<string, SideEpisode[]>()
    for (const row of ourRows) {
      const id = String(row.runCluster)
      ours.set(id, [...ours.get(id) ?? [], episodeOf(row)])
    }

    // CLASS 1, grouped by (cluster, season): two members of one run claiming the same season is one
    // candidate reached twice, and the `INCLUDES` it may mint is one edge whatever the claims say
    const seasons = new Map<string, Candidate>()
    for (const row of seasonRows) {
      const key = `${String(row.runCluster)}\u0000${String(row.seasonUri)}`
      const candidate = seasons.get(key) ?? {
        clusterId: String(row.runCluster),
        kind: 'season' as const,
        seasonUri: String(row.seasonUri),
        memberUri: String(row.memberUri),
        via: [],
        theirCount: asNumber(row.theirCount),
        retranslates: row.retranslates === true,
        episodes: [],
      }
      const via = asText(row.via)
      if (via && !candidate.via.includes(via)) candidate.via.push(via)
      // the `INCLUDES` points at the member the claim came from, and the lowest uri when several did
      if (compare(String(row.memberUri), candidate.memberUri ?? '') < 0) candidate.memberUri = String(row.memberUri)
      if (!candidate.episodes.some(episode => episode.uri === String(row.uri))) candidate.episodes.push(episodeOf(row))
      seasons.set(key, candidate)
    }
    // SORTED, and this is not a tidy-up. Two `PART_OF` rows can reach one season (`plugin:direct`'s
    // `asserted` and `plugin:containment`'s `span`), the scan returns a row per link per episode, and
    // the engine's order inside one ORDER BY tie is not stable between passes. Unsorted, `supports`
    // then flips between two spellings of the same list and the writer rewrites every edge derived
    // from it on every iteration, which the pass reports as `fixed-point-cap` (measured 2026-09-12:
    // 11 `EPISODE_LINK` rows rewritten per iteration, on about half of the runs)
    for (const candidate of seasons.values()) candidate.via.sort(compare)

    // CLASS 2, grouped by (cluster, claimer): a lend has no row of its own to key on
    const lends = new Map<string, Candidate>()
    for (const row of lendRows) {
      const key = `${String(row.runCluster)}\u0000${String(row.claimer)}`
      const candidate = lends.get(key) ?? {
        clusterId: String(row.runCluster),
        kind: 'lend' as const,
        seasonUri: null,
        memberUri: String(row.memberUri),
        via: [],
        theirCount: null,
        retranslates: RETRANSLATING_ORIGINS.has(String(row.claimer)),
        episodes: [],
      }
      if (!candidate.episodes.some(episode => episode.uri === String(row.uri))) candidate.episodes.push(episodeOf(row))
      lends.set(key, candidate)
    }

    const links: LinkProposal[] = []
    const episodeLinks: EpisodeLinkProposal[] = []
    let dated = 0
    let titled = 0
    let refused = 0

    for (const cluster of clusterRows) {
      const clusterId = String(cluster.id)
      const runLength = asNumber(cluster.runLength)
      if (runLength === null || runLength < 1) continue
      const inside = members.get(clusterId) ?? new Set<string>()
      const episodes = ours.get(clusterId) ?? []
      // the reference is the members whose own count equals the length, which is the set
      // `plugin:aggregate` already wrote as `runLengthFrom` (`consensus.ts:265-273`, 5.4 P5)
      const referenceOrigins = new Set(listOf(cluster.runLengthFrom).map(originOf))
      const reference = episodes.filter(episode => referenceOrigins.has(episode.origin))

      const candidates: Candidate[] = []
      for (const candidate of seasons.values()) {
        if (candidate.clusterId !== clusterId) continue
        // a candidate that is a MEMBER is class 3's business: an `INCLUDES` between two rows of one
        // cluster is the invariant of 3.5 rather than a range
        if (candidate.seasonUri && inside.has(candidate.seasonUri)) continue
        candidates.push(candidate)
      }
      for (const candidate of lends.values()) {
        if (candidate.clusterId === clusterId) candidates.push(candidate)
      }
      // CLASS 3: every member origin that is not a reference and does not number 1 to runLength
      const byOrigin = new Map<string, SideEpisode[]>()
      for (const episode of episodes) {
        if (referenceOrigins.has(episode.origin)) continue
        byOrigin.set(episode.origin, [...byOrigin.get(episode.origin) ?? [], episode])
      }
      for (const origin of [...byOrigin.keys()].sort(compare)) {
        const own = byOrigin.get(origin)!
        if (!numbersOutsideRun(own, runLength)) continue
        candidates.push({
          clusterId,
          kind: 'member',
          seasonUri: null,
          memberUri: null,
          via: [],
          theirCount: own.length,
          retranslates: RETRANSLATING_ORIGINS.has(origin),
          episodes: own,
        })
      }

      for (const candidate of candidates.sort((a, b) =>
        compare(a.kind, b.kind) || compare(a.seasonUri ?? '', b.seasonUri ?? '')
        || compare(a.episodes[0]?.uri ?? '', b.episodes[0]?.uri ?? ''))) {
        const verdict = decideCandidate({ runLength, reference, candidate })
        if (!verdict.ok) {
          refused += 1
          ctx.log({
            level: 'info',
            rule: `range:${verdict.reason}`,
            detail: `${candidate.kind} candidate of ${clusterId} proved nothing`,
            uris: candidate.seasonUri ? [candidate.seasonUri] : candidate.episodes.slice(0, 1).map(episode => episode.uri),
          })
          // the refusal rides the `LINK` that reached the candidate, so "why no Netflix" is a query
          // (5.4 P4). A lend and a member candidate have no such row, and neither gets one: a plugin
          // may not invent an edge to carry its own silence
          if (candidate.kind !== 'season' || !candidate.seasonUri || !candidate.memberUri) continue
          links.push({
            kind: 'INCLUDES',
            fromUri: candidate.seasonUri,
            toUri: candidate.memberUri,
            status: 'refused',
            reason: verdict.reason,
            confidence: 1,
            evidence: { reason: verdict.reason, theirs: candidate.theirCount, ours: runLength },
            supports: candidate.via,
          })
          continue
        }

        if (verdict.rule === 'dates') dated += verdict.pairs.length
        else titled += verdict.pairs.length
        for (const pair of verdict.pairs) {
          episodeLinks.push({
            fromUri: pair.from.uri,
            toUri: pair.to.uri,
            reason: verdict.rule,
            confidence: verdict.rule === 'dates' ? 1 : verdict.coverage,
            evidence: pair.evidence,
            fromNumber: pair.fromNumber,
            toNumber: pair.toNumber,
            supports: [pair.from.hung, pair.to.hung, ...candidate.via].filter(Boolean),
          })
        }

        // THE RANGE, and only when the candidate is a row that is LONGER than the run: a season of
        // eight inside a run of twelve is proven episode by episode and labels nothing (8.2), and a
        // lend has no row to hang a label off at all (4.4)
        const total = candidate.theirCount ?? candidate.episodes.length
        if (candidate.kind !== 'season' || !candidate.seasonUri || !candidate.memberUri) continue
        if (total <= runLength) continue
        const hull = hullOf(verdict.pairs, total)
        if (!hull) continue
        links.push({
          kind: 'INCLUDES',
          fromUri: candidate.seasonUri,
          toUri: candidate.memberUri,
          reason: verdict.rule,
          confidence: verdict.rule === 'dates' ? 1 : verdict.coverage,
          evidence: { rule: verdict.rule, theirs: total, ours: runLength },
          supports: candidate.via,
          range: hull,
        })
      }
    }

    // THE FOURTH INPUT (5.4 P4): a source's own episode `SAME_AS`, PLACED rather than proven. It runs
    // after the rules because a pair the dates or the titles demonstrated is the stronger row and
    // keys identically (`from`, `to`, `by`): an assertion may not overwrite a proof.
    const placementOf = (rows: Row[]): Map<string, string[]> => {
      const places = new Map<string, string[]>()
      for (const row of rows) {
        const uri = String(row.uri)
        const clusterId = String(row.clusterId)
        const held = places.get(uri) ?? []
        if (!held.includes(clusterId)) places.set(uri, [...held, clusterId])
      }
      return places
    }
    const placed = placementOf(placedRows)
    const attached = placementOf(attachedRows)
    const placeOf = (uri: string): Placement => ({ members: placed.get(uri) ?? [], attached: attached.get(uri) ?? [] })

    // grouped by PAIR, because two sources can claim one pair of rows and the edge is one edge; its
    // `supports` then names both claims, sorted for the reason the candidate scan sorts its own
    const claims = new Map<string, { fromUri: string, toUri: string, fromNumber: number | null, toNumber: number | null, keys: string[] }>()
    const proven = new Set(episodeLinks.map(link => `${link.fromUri} ${link.toUri}`))
    for (const row of claimRows) {
      const fromUri = String(row.fromUri)
      const toUri = String(row.toUri)
      // a row is not a pair with itself, which is guard `self` of 5.2 at episode scale (`db.ts:283-286`)
      if (fromUri === toUri) continue
      const key = `${fromUri} ${toUri}`
      if (proven.has(key)) continue
      const claim = claims.get(key) ?? {
        fromUri, toUri, fromNumber: asNumber(row.fromNumber), toNumber: asNumber(row.toNumber), keys: [],
      }
      const claimKey = asText(row.claimKey)
      if (claimKey && !claim.keys.includes(claimKey)) claim.keys.push(claimKey)
      claims.set(key, claim)
    }

    let asserted = 0
    let foreign = 0
    for (const claim of [...claims.values()].sort((a, b) => compare(a.fromUri, b.fromUri) || compare(a.toUri, b.toUri))) {
      const ok = placesClaim(placeOf(claim.fromUri), placeOf(claim.toUri))
      if (ok) asserted += 1
      else foreign += 1
      episodeLinks.push({
        fromUri: claim.fromUri,
        toUri: claim.toUri,
        status: ok ? 'active' : 'refused',
        reason: ok ? 'asserted' : 'foreign-episode',
        confidence: 1,
        fromNumber: claim.fromNumber,
        toNumber: claim.toNumber,
        supports: [...claim.keys].sort(compare),
      })
    }

    if (dated || titled || refused || asserted || foreign) {
      ctx.log({
        level: 'info',
        rule: 'range',
        detail: `${dated} pairs by date, ${titled} by title, ${refused} candidates refused, `
          + `${asserted} claims asserted, ${foreign} refused as foreign`,
      })
    }

    return {
      // THE 2C HOOK: with no `delta` there is no dirty set of run clusters, so the scan is the whole
      // graph and the scope is what it recomputed, which is all of it
      scope: { full: true },
      nodes: [],
      edges: [],
      links,
      episodeLinks,
    }
  },
}
