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
 * IT MINTS NO `SAME_AS` BETWEEN MEDIA. The "every episode paired, therefore the same thing" upgrade
 * was deleted from 5.4 P4, along with the rule that carried it, which is why the sequence rule below
 * is a NEW rule 3 and not the restored one: a season that holds this run is a container whatever
 * share of it pairs, and 8.4 is the case that says so, five Netflix seasons each `PART_OF` one run
 * with no upgrade at any coverage. The `PART_OF` that reached a candidate stays exactly as it was in
 * every branch below, including the one that mints a range.
 *
 * RULE 3 IS ALLOWED WHERE RULE 2 IS REFUSED, `retranslates` INCLUDED, and 3.4a gives the argument:
 * rule 2 is refused for a retranslating origin because it mints on a COVERAGE SCORE, and a score can
 * be wrong while looking strong (Netflix, 4 exact of 25, the best wrong pair outscoring the true one,
 * 2026-09-10). Rule 3 consults titles only for EXACT, UNIQUE, NON-GENERIC equality and places every
 * pair beyond those by ORDER, so a retranslated title cannot produce a pair: it can only fail to
 * become an anchor.
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

import { EPISODE_TITLE_COVERAGE, isGenericEpisodeTitle, MIN_EPISODE_TITLE_MATCHES } from '../../../sources/similar'
import { stripTitle } from '../../../sources/utils'
import { RETRANSLATING_ORIGINS } from './origins'

/** The version of 5.1: bumped when a rule below changes, which retracts and recomputes every row. */
export const RANGE_VERSION = 3

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

/**
 * Why nothing was minted for a candidate, written onto its refused `LINK` row so it is queryable.
 *
 * `no-anchors` and `unequal-gap` are rule 3's own two, and they say which half of the alignment
 * failed: no anchor to bracket from (Netflix's season 1, 24 placeholder titles, 3.4a point 4), or
 * anchors whose bracket counted a different number of rows on each side.
 */
export type RangeRefusal =
  'no-dates' | 'ambiguous-day' | 'retranslates' | 'no-titles' | 'date-skew' | 'no-anchors' | 'unequal-gap'

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

/**
 * HOW one pair was placed, which is the whole of a trace's answer to "why is this button here" (3.2).
 *
 * One shape per rule, and rule 3 carries three of its own because it places a row three different
 * ways: `day` and `slack` are rule 1's, `key` is rule 2's exact title match, `anchor` is rule 3's
 * (the key that anchored it), `between` names the two anchors whose equal-gap bracket forced a row
 * that no title reached, and `closed` names the specials whose location closed the alignment (3.4a),
 * which is empty for nothing, since a closure needs at least one.
 */
export type PairEvidence =
  | { day: number, slack: number }
  | { key: string }
  | { anchor: string }
  | { between: [string, string] }
  | { closed: string[] }

/** One proven pair: their row, our row, and what proved it. */
export type Pair = {
  from: SideEpisode
  to: SideEpisode
  fromNumber: number
  toNumber: number
  evidence: PairEvidence
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

/**
 * Rule 1's guard: a constant offset the candidate's OWN numbering cannot absorb is a SCHEDULE SKEW.
 *
 * Crunchyroll publishes the streaming schedule and ani.zip the broadcast one, and the two can run a
 * few days apart. When they do, Crunchyroll's episode N+1 lands inside the day of slack around
 * ani.zip's episode N while Crunchyroll's own N lands nowhere near it, so rule 1 pairs the whole list
 * one late and `plugin:aggregate` then fills slot 1 from episode 2: the user opens episode 1 and
 * watches episode 2. Measured on `anilist:208044` in the summer 2026 corpus, eleven pairs
 * `fromNumber N+1 toNumber N`, both lists numbered 1 to 12 with identical titles at the same number.
 *
 * WHAT MAKES IT A SKEW RATHER THAN A RENUMBERING, which is the whole of this function:
 *
 * - every in-window pair shares ONE offset. A per-episode disagreement is real date evidence, and a
 *   specials-shifted list (8.3) is piecewise rather than constant, so neither is touched here.
 * - the candidate numbers from 1 and fits inside the run (`min === 1`, `max <= runLength`), so it is
 *   numbering THIS run from the top rather than a segment of a longer whole. The Elusive Samurai
 *   (8.2) is the case this clause keeps out: rows 13 to 20 against a run of 12 start nowhere near 1,
 *   and their offset of -12 is a genuine renumbering onto 1 to 8.
 * - the offset would carry one of the candidate's own rows OFF the run, so it cannot be read as that
 *   candidate's numbering of this run at all. 8.4 is the case this clause keeps out, and it is the
 *   reason the clause exists: Fullmetal's Crunchyroll season 2 numbers its rows 1 to 13 inside a run
 *   of 64 and its pairs carry a constant +13, which every clause above admits and which IS a
 *   renumbering, because 14 to 26 are rows of that run and nothing is pushed off either end.
 *
 * An offset of ZERO needs no clause of its own: a candidate that reaches the last two is numbered
 * inside the run, so it absorbs zero by construction and the dates are agreeing with the numbering.
 *
 * Returns the offset when the pairing is a skew, so a refusal can print what it saw, and `null` when
 * rule 1 stands.
 */
export const scheduleSkew = (options: {
  runLength: number
  episodes: readonly SideEpisode[]
  pairs: readonly Pair[]
}): number | null => {
  const { runLength, episodes, pairs } = options
  if (!pairs.length) return null
  const offset = pairs[0]!.toNumber - pairs[0]!.fromNumber
  if (pairs.some(pair => pair.toNumber - pair.fromNumber !== offset)) return null

  // no numbers at all makes `Math.min` Infinity, which the clause below refuses on its own
  const numbers = episodes.map(episode => episode.number).filter((number): number is number => number !== null)
  if (Math.min(...numbers) !== 1 || Math.max(...numbers) > runLength) return null
  return numbers.every(number => number + offset >= 1 && number + offset <= runLength) ? null : offset
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

// ---------------------------------------------------------------------------------------------
// Rule 3 of 5.4 P4, by SEQUENCE, and its closure (3.4a). Three pure steps: the anchors, the rows an
// equal-gap bracket forces between two of them, and the specials that close what is left.

/**
 * The keys rule 3 may anchor on: one row's, non-generic, stripped, deduplicated and ordered.
 *
 * The generic filter is applied HERE and not read off `EpisodeProfile.generic`, for `keysOf`'s own
 * reason: 3.4a's anchor is defined as non-generic, so the rule that needs the property is the rule
 * that has to check it. It is idempotent against today's column, which already drops them
 * (`profile.ts`, `similar.ts:104`), and without it Netflix's season 1 of 24 rows titled `Episode N`
 * would anchor all 24 of them onto ours.
 */
const anchorKeysOf = (episode: SideEpisode): string[] =>
  keysOf(episode).filter(key => !isGenericEpisodeTitle(key))

/** One episode of the run as rule 3 counts it: a number, and every reference row that carries it. */
export type CanonicalEpisode = {
  number: number
  /**
   * Every reference row at this number, lowest uri first. Several origins describe one broadcast, so
   * the same title on anizip's row 5 and kitsu's row 5 is ONE episode rather than a duplicated key,
   * which is the difference between rule 3's index and rule 2's (`uniqueKeys` would drop both).
   */
  rows: SideEpisode[]
}

/** One ANCHOR: their row and our number, joined by a key that is exact, unique and non-generic on both sides. */
export type Anchor = {
  from: SideEpisode
  /** The reference row whose title carried the key, which is the row the pair NAMES. */
  to: SideEpisode
  /** Position in the alignment's own two lists. Order, and nothing else, places every other pair. */
  fromIndex: number
  toIndex: number
  key: string
}

/** The two ordered lists rule 3 reads, the anchors it found in them, and the run's specials. */
export type Alignment = {
  /** Their NUMBERED rows, ascending: an unnumbered row of theirs is in no sequence at all. */
  theirs: SideEpisode[]
  /** The run's own numbering, ascending, one entry per distinct number. */
  canonical: CanonicalEpisode[]
  /** The run's rows with NO number: 3.4a's insertions, and never a pair of their own. */
  specials: SideEpisode[]
  anchors: Anchor[]
  /** Exact unique matches before the monotone filter, so a crossing one is countable rather than silent. */
  matches: number
}

const pairOnto = (from: SideEpisode, slot: CanonicalEpisode, evidence: PairEvidence): Pair => ({
  from,
  to: slot.rows[0]!,
  fromNumber: from.number!,
  toNumber: slot.number,
  evidence,
})

/**
 * The longest strictly increasing run of matches, which is the monotone alignment of rule 3.
 *
 * Patience by binary search over the matches in THEIR order, reconstructed through parent pointers,
 * so a crossing match is dropped rather than allowed to bend the alignment around it: two matches
 * that cross leave a run of one, which is below the two-anchor minimum and mints nothing.
 */
const longestMonotone = (matches: readonly Anchor[]): Anchor[] => {
  const tails: number[] = []
  const parent: number[] = []
  matches.forEach((match, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (matches[tails[mid]!]!.toIndex < match.toIndex) low = mid + 1
      else high = mid
    }
    parent[index] = low > 0 ? tails[low - 1]! : -1
    tails[low] = index
  })
  const anchors: Anchor[] = []
  for (let index = tails.length ? tails[tails.length - 1]! : -1; index >= 0; index = parent[index]!) {
    anchors.push(matches[index]!)
  }
  return anchors.reverse()
}

/**
 * Rule 3's first step: the ANCHORS, and the two ordered lists they sit in.
 *
 * An anchor is exact `stripTitle` equality, non-generic, and unique on each side, then MONOTONE: the
 * anchors are the longest increasing subsequence of those matches, so an alignment never crosses
 * itself. Three ways a match is dropped, each of them an identity question order cannot answer:
 *
 * - a key their side carries twice, exactly as rule 2 drops it;
 * - a key naming two different numbers of OURS (a key several rows of one number carry is that
 *   number's, however many origins spell it);
 * - a canonical number two of their rows reach, which is one row too many for one episode.
 *
 * Every list is sorted before it is read (their rows by number then uri, ours by number, the
 * specials by uri), so the alignment is a function of the two lists and not of the scan's order.
 */
export const alignByTitle = (
  reference: readonly SideEpisode[],
  theirs: readonly SideEpisode[]
): Alignment => {
  const ordered = [...theirs]
    .filter(episode => episode.number !== null)
    .sort((a, b) => a.number! - b.number! || compare(a.uri, b.uri))

  const byNumber = new Map<number, SideEpisode[]>()
  for (const row of [...reference].sort(byUri)) {
    if (row.number === null) continue
    byNumber.set(row.number, [...byNumber.get(row.number) ?? [], row])
  }
  const canonical: CanonicalEpisode[] = [...byNumber.keys()]
    .sort((a, b) => a - b)
    .map(number => ({ number, rows: byNumber.get(number)! }))
  const specials = [...reference].filter(episode => episode.number === null).sort(byUri)

  const ourKey = new Map<string, { index: number, row: SideEpisode } | null>()
  canonical.forEach((entry, index) => {
    for (const row of entry.rows) {
      for (const key of anchorKeysOf(row)) {
        const held = ourKey.get(key)
        if (held === undefined) ourKey.set(key, { index, row })
        else if (held && held.index !== index) ourKey.set(key, null)
      }
    }
  })
  const theirKey = new Map<string, SideEpisode | null>()
  for (const row of ordered) {
    for (const key of anchorKeysOf(row)) {
      if (theirKey.has(key)) theirKey.set(key, null)
      else theirKey.set(key, row)
    }
  }

  const matches: Anchor[] = []
  ordered.forEach((row, fromIndex) => {
    const reached = new Map<number, { row: SideEpisode, key: string }>()
    for (const key of anchorKeysOf(row)) {
      if (theirKey.get(key) !== row) continue
      const ours = ourKey.get(key)
      if (!ours) continue
      if (!reached.has(ours.index)) reached.set(ours.index, { row: ours.row, key: key })
    }
    // two different numbers of ours through two keys is an ambiguity, not two matches
    if (reached.size !== 1) return
    const entry = [...reached.entries()][0]!
    matches.push({ from: row, to: entry[1].row, fromIndex, toIndex: entry[0], key: entry[1].key })
  })
  const claims = new Map<number, number>()
  for (const match of matches) claims.set(match.toIndex, (claims.get(match.toIndex) ?? 0) + 1)
  const single = matches.filter(match => claims.get(match.toIndex) === 1)

  return { theirs: ordered, canonical, specials, anchors: longestMonotone(single), matches: single.length }
}

/**
 * Rule 3's second step: the rows an EQUAL-GAP BRACKET forces between two anchors.
 *
 * A row strictly between two anchors is forced when the number of rows between them is the same on
 * both sides, because order then permits exactly one bijection and no title evidence is consulted
 * for it. That is where the three Mushoku pairs no title rule could reach come from (`Unwilling to
 * Die` onto `I Don't Want to Die`, `This Feeling` onto `These Feelings`, and one accent difference,
 * measured 2026-09-12).
 *
 * ROWS ARE COUNTED, NEVER NUMBERS. A pair needs two rows, so a side that skips a number has one row
 * fewer to place and not one gap more; counting the numbers instead would refuse a region over a
 * hole that has no row in it.
 *
 * An unequal gap refuses ITS OWN REGION and keeps its anchors: one side carries a row the other does
 * not, and which row that is is exactly what order cannot say. `unequal` counts those regions so a
 * refusal can name what it saw.
 */
export const forcedByBracket = (alignment: Alignment): { pairs: Pair[], unequal: number } => {
  const { anchors, theirs, canonical } = alignment
  if (anchors.length < 2) return { pairs: [], unequal: 0 }
  const pairs: Pair[] = []
  let unequal = 0
  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1]!
    const upper = anchors[index]!
    const rows = theirs.slice(lower.fromIndex + 1, upper.fromIndex)
    const slots = canonical.slice(lower.toIndex + 1, upper.toIndex)
    if (!rows.length && !slots.length) continue
    if (rows.length !== slots.length) {
      unequal += 1
      continue
    }
    const between: [string, string] = [lower.from.uri, upper.from.uri]
    rows.forEach((row, offset) => pairs.push(pairOnto(row, slots[offset]!, { between })))
  }
  return { pairs, unequal }
}

/**
 * The token level match of 3.4a, and the ONE place rule 3 does not demand exact equality.
 *
 * A retranslating origin REORDERS words: Netflix's `Fitz the Guardian` against ani.zip's special
 * `Guardian Fitz` (`S1`, aired 2023-07-03, a week before canonical episode 1). So the smaller token
 * set must be CONTAINED in the larger and carry at least two tokens. A one word title decides
 * nothing and is refused rather than guessed, which is also what keeps `Recap` off every special a
 * run has.
 *
 * It is admitted here and nowhere else because a located insertion places NO pair of its own: it
 * only has to account for a surplus the anchors already measured, and the closure it enables is then
 * checked against those anchors.
 */
const MIN_SPECIAL_TOKENS = 2

const tokenSetsOf = (episode: SideEpisode): Set<string>[] =>
  anchorKeysOf(episode).map(key => new Set(key.split(' ').filter(Boolean)))

const tokensMatch = (a: SideEpisode, b: SideEpisode): boolean =>
  tokenSetsOf(a).some(left => tokenSetsOf(b).some(right => {
    const [small, large] = left.size <= right.size ? [left, right] : [right, left]
    if (small.size < MIN_SPECIAL_TOKENS) return false
    return [...small].every(token => large.has(token))
  }))

/** One insertion LOCATED (3.4a point 2): their unanchored row, and the special that explains it. */
export type LocatedSpecial = { from: SideEpisode, special: SideEpisode }

const dayRank = (episode: SideEpisode): number => episode.day ?? Number.MAX_SAFE_INTEGER

/**
 * Which of their rows are insertions the run's own specials explain.
 *
 * A special carries its own air date, so where two specials could both explain a row the EARLIER
 * DATE decides; two on one day decide nothing and the whole location is refused (`ambiguous`). A
 * special two different rows reach names neither of them, for the same reason a duplicated title is
 * no anchor.
 */
const locateInsertions = (
  rows: readonly SideEpisode[],
  specials: readonly SideEpisode[]
): { located: LocatedSpecial[], ambiguous: boolean } => {
  const reach = rows.map(row => ({ row, matched: specials.filter(special => tokensMatch(row, special)) }))
  const claims = new Map<string, number>()
  for (const entry of reach) {
    for (const special of entry.matched) claims.set(special.uri, (claims.get(special.uri) ?? 0) + 1)
  }
  const located: LocatedSpecial[] = []
  let ambiguous = false
  for (const entry of reach) {
    const reachable = entry.matched.filter(special => claims.get(special.uri) === 1)
    if (reachable.length !== entry.matched.length) ambiguous = true
    if (!reachable.length) continue
    const ordered = [...reachable].sort((a, b) => dayRank(a) - dayRank(b) || compare(a.uri, b.uri))
    if (ordered.length > 1 && dayRank(ordered[0]!) === dayRank(ordered[1]!)) {
      ambiguous = true
      continue
    }
    located.push({ from: entry.row, special: ordered[0]! })
  }
  return { located, ambiguous }
}

/**
 * Rule 3's third step, 3.4a: CLOSING the alignment with the specials list.
 *
 * Nothing outside the outermost anchors is paired unless this closes, and it closes only when the
 * alignment PROVES ITSELF: every region between anchors has an equal gap, the surplus is at least
 * one row, the located insertions account for it EXACTLY, and each of the head and the tail balances
 * once its own insertions are removed. Measured on Mushoku Tensei's Netflix season 2 (2026-09-12):
 * locating one special at row 1 forces rows 2 to 25 onto canonical 1 to 24, and the four anchors
 * then sit where the closure predicts.
 *
 * A SURPLUS OF ZERO CLOSES NOTHING, and that is the load bearing refusal rather than a shortcut.
 * With no surplus there is no insertion to locate, so the only thing left saying the tail lines up is
 * that the two counts agree, and "there is no rule by COUNT" (5.4 P4): a count-exact season with no
 * other evidence is the Demon Slayer shape, two runs of eleven under `nf:81091393-3` which no count
 * axis can separate (2026-09-04). So the anchors keep whatever their brackets forced and the ends
 * stay unpaired.
 *
 * `unequal` is `forcedByBracket`'s count, passed in rather than recomputed: a region the bracket
 * refused is a row one side carries and the other does not, which is the same surplus the closure is
 * trying to account for, and accounting for it twice is how an extrapolation gets in.
 */
export const closeWithSpecials = (options: {
  alignment: Alignment
  unequal: number
}): { pairs: Pair[], located: LocatedSpecial[], closed: boolean } => {
  const { alignment, unequal } = options
  const { anchors, theirs, canonical, specials } = alignment
  const refused = { pairs: [], located: [], closed: false }
  if (anchors.length < 2 || unequal) return refused
  const surplus = theirs.length - canonical.length
  if (surplus < 1) return refused

  const first = anchors[0]!
  const last = anchors[anchors.length - 1]!
  const regions = [
    { rows: theirs.slice(0, first.fromIndex), slots: canonical.slice(0, first.toIndex) },
    { rows: theirs.slice(last.fromIndex + 1), slots: canonical.slice(last.toIndex + 1) },
  ]

  const located: LocatedSpecial[] = []
  const forced: { row: SideEpisode, slot: CanonicalEpisode }[] = []
  for (const region of regions) {
    const extra = region.rows.length - region.slots.length
    if (extra < 0) return refused
    const spent = new Set(located.map(entry => entry.special.uri))
    const found = locateInsertions(region.rows, specials.filter(special => !spent.has(special.uri)))
    if (found.ambiguous || found.located.length !== extra) return refused
    located.push(...found.located)
    const inserted = new Set(found.located.map(entry => entry.from.uri))
    const remaining = region.rows.filter(row => !inserted.has(row.uri))
    remaining.forEach((row, offset) => forced.push({ row, slot: region.slots[offset]! }))
  }
  // the surplus of 3.4a point 1, stated again over the whole alignment rather than region by region:
  // the two are equal while every inner gap is equal, and this is the sentence the rule promises
  if (located.length !== surplus) return refused

  const closed = located.map(entry => entry.special.uri).sort(compare)
  return { pairs: forced.map(entry => pairOnto(entry.row, entry.slot, { closed })), located, closed: true }
}

/** What rule 3 came to: the pairs, and every count a refusal or a trace needs to explain them. */
export type SequencePairing = {
  alignment: Alignment
  /** One pair per anchor, in their own order. Empty below the two anchor minimum, since one brackets nothing. */
  anchored: Pair[]
  /** The rows an equal-gap bracket forced between two anchors. */
  forced: Pair[]
  /** The rows 3.4a's closure forced outside the outermost anchors. */
  closure: Pair[]
  /** Regions between two anchors whose row counts disagreed: each keeps its anchors and pairs nothing. */
  unequal: number
  located: LocatedSpecial[]
  closed: boolean
  /** `anchored`, `forced` and `closure` together, ordered, or NOTHING when order placed no row. */
  pairs: Pair[]
}

/**
 * Rule 3 of 5.4 P4, by SEQUENCE: anchors, the rows their brackets force, and 3.4a's closure.
 *
 * RULE 3 SPEAKS ONLY WHEN ORDER PLACES A ROW. With two or more anchors and nothing forced, every
 * pair it could write is an exact title match and nothing else, which is rule 2's evidence and is
 * governed by rule 2's bar (three matches and 0.6 coverage of the candidate, `similar.ts:59-69`).
 * That bar is what makes "a fold of two equal cours at 12/24 mints no title pairs and only the date
 * rule can prove a fold" true, and a rule 3 that minted its anchors alone would repeal it for every
 * fold whose titles happen to be shared. So the anchors ride out with the forced rows or not at all:
 * what rule 3 adds, and the only thing it adds, is the rows no title reaches.
 *
 * The three steps are separate exported functions because each is a different kind of claim: the
 * anchors are a title measurement, the brackets are arithmetic over one order, and the closure is an
 * argument about a surplus. `reference` is the run's own rows, exactly as rules 1 and 2 read them,
 * and the specials come out of it: a row of the run with no number is an insertion candidate and a
 * pair target never, since there is no slot for it inside `1..runLength` (5.4 P5).
 */
export const pairsBySequence = (
  reference: readonly SideEpisode[],
  theirs: readonly SideEpisode[]
): SequencePairing => {
  const alignment = alignByTitle(reference, theirs)
  const anchored = alignment.anchors.length < 2
    ? []
    : alignment.anchors.map(anchor => ({
      from: anchor.from,
      to: anchor.to,
      fromNumber: anchor.from.number!,
      toNumber: anchor.to.number!,
      evidence: { anchor: anchor.key },
    } satisfies Pair))
  const bracket = forcedByBracket(alignment)
  const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
  const placed = [...bracket.pairs, ...closure.pairs]
  const pairs = anchored.length && placed.length
    ? [...anchored, ...placed].sort((a, b) => a.fromNumber - b.fromNumber || compare(a.from.uri, b.from.uri))
    : []
  return {
    alignment,
    anchored,
    forced: bracket.pairs,
    closure: closure.pairs,
    unequal: bracket.unequal,
    located: closure.located,
    closed: closure.closed,
    pairs,
  }
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
  | {
    ok: true
    rule: 'dates' | 'titles' | 'sequence'
    pairs: Pair[]
    coverage: number
    /**
     * The shape of rule 3's alignment, for the `INCLUDES` evidence, and absent for the other rules.
     *
     * Counted BEFORE the window, where `pairs` is counted after it: the numbers describe what the
     * alignment found, and `Hull.aligned` is what was minted out of it.
     */
    sequence?: { anchors: number, forced: number, closure: number, unequal: number, closed: boolean }
  }
  | { ok: false, reason: RangeRefusal }

/**
 * The decision rules of 5.4 P4 in order, each refusing on ambiguity rather than falling through.
 *
 * | outcome | when |
 * | --- | --- |
 * | `dates` | rule 1 left at least `MIN_ALIGNED` pairs inside the window and they are not a skew |
 * | `titles` | rule 1 did not, the candidate's origin does not retranslate, and rule 2 cleared both halves of its bar |
 * | `sequence` | neither did, and rule 3's alignment placed a row by ORDER: two or more anchors, at least one row forced by a bracket or by 3.4a's closure, `MIN_ALIGNED` pairs inside the window, and not the same offset rule 1 refused as a skew |
 * | `retranslates` | nothing was proven and rule 2 was refused outright (Netflix, 4 exact of 25, the best wrong pair above the true one, 2026-09-10) |
 * | `date-skew` | rule 1's pairs were a constant offset the candidate's own numbering cannot absorb (`scheduleSkew`) and neither rule 2 nor rule 3 minted |
 * | `ambiguous-day` | rule 1 reached reference days and a day named two reference numbers |
 * | `unequal-gap` | rule 3 anchored and a bracket counted a different number of rows on each side, so order placed nothing |
 * | `no-anchors` | both sides carry non-generic titles and rule 3 found fewer than two anchors (Netflix's season 1, 3.4a point 4) |
 * | `no-titles` | both sides carry non-generic titles, rule 2 missed its bar, and rule 3 anchored with nothing to force |
 * | `no-dates` | everything else: the date rule could not run or its days met nothing, and the title rules had no material either |
 *
 * RULE 3 RUNS THIRD, and where rule 2 is REFUSED rather than merely short of its bar. Two things fix
 * that position. It is the weakest evidence of the three, since a bracket consults no evidence at all
 * for the row it forces, and the rules are ordered by what they measure. And it is the only one that
 * may read a retranslating origin's titles, because it reads them for exact equality rather than for
 * a score (see the header), so putting it before rule 2 would let an alignment answer where a
 * coverage that cleared both halves of its bar was available.
 *
 * A PAIRING RULE 1 REFUSED AS A SKEW IS NOT RESURRECTED BY RULE 3. `scheduleSkew` is asked again
 * about rule 3's own pairs: an alignment that reproduces the offset the dates were refused for is
 * refused for the same reason, and one that disagrees with it (the usual case, since the anchors are
 * exact titles) stands. A candidate longer than the run reaches that guard's last clause and is never
 * a skew, which is why the Netflix season of 25 against a run of 24 is admitted.
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
  // rule 1 stands unless the pairing it found is a schedule skew, in which case it is evidence that
  // the two lists are the same sequence and NOT evidence of a renumbering, so rule 2 decides
  const skew = dated.length >= MIN_ALIGNED
    ? scheduleSkew({ runLength, episodes: candidate.episodes, pairs: dated })
    : null
  if (skew === null && dated.length >= MIN_ALIGNED) return { ok: true, rule: 'dates', pairs: dated, coverage: 1 }

  // rule 2, refused OUTRIGHT for a retranslating origin, where rule 3 below is not (3.4a)
  const titles = candidate.retranslates ? null : pairsByTitle(reference, candidate.episodes)
  if (titles) {
    const titled = inWindow(titles.pairs)
    if (titled.length >= MIN_EPISODE_TITLE_MATCHES && titles.coverage >= EPISODE_TITLE_COVERAGE) {
      return { ok: true, rule: 'titles', pairs: titled, coverage: titles.coverage }
    }
  }

  const sequence = pairsBySequence(reference, candidate.episodes)
  const sequenced = inWindow(sequence.pairs)
  const sequenceSkew = sequenced.length >= MIN_ALIGNED
    ? scheduleSkew({ runLength, episodes: candidate.episodes, pairs: sequenced })
    : null
  if (sequenceSkew === null && sequenced.length >= MIN_ALIGNED) {
    return {
      ok: true,
      rule: 'sequence',
      pairs: sequenced,
      // NOT A SCORE, deliberately: every anchor is exact unique non-generic equality and every other
      // pair is placed by order, so there is no ratio to report and a coverage here would be the one
      // thing 3.4a says not to trust
      coverage: 1,
      sequence: {
        anchors: sequence.anchored.length,
        forced: sequence.forced.length,
        closure: sequence.closure.length,
        unequal: sequence.unequal,
        closed: sequence.closed,
      },
    }
  }

  // `retranslates` stays the most specific refusal for the origin it names, above the skew it
  // outranked before rule 3 existed: rule 2 was refused before it was weighed, which is a fact about
  // the source rather than about this candidate's dates
  if (candidate.retranslates) return { ok: false, reason: 'retranslates' }
  // the skew is the most specific thing that happened to the DATES, and the only refusal that says
  // they did meet: nothing rather than a guess, with what was seen written down (`consensus.ts:105-110`)
  if (skew !== null) return { ok: false, reason: 'date-skew' }
  if (dates.ambiguous) return { ok: false, reason: 'ambiguous-day' }
  // rule 3's own two, in the same most-specific-first order: a bracket that counted two different
  // numbers of rows is a measurement, where a missing anchor is an absence
  if (sequence.unequal) return { ok: false, reason: 'unequal-gap' }
  // `no-titles` says the title rule had material on both sides and missed its bar, which is the more
  // specific of the two; `no-dates` is the fallback, and it covers both "one side carries no day" and
  // "the days met nothing", since neither rule then had anything to be refused ON
  const titledBothSides = reference.some(episode => keysOf(episode).length)
    && candidate.episodes.some(episode => keysOf(episode).length)
  if (!titledBothSides) return { ok: false, reason: 'no-dates' }
  return { ok: false, reason: sequence.alignment.anchors.length < 2 ? 'no-anchors' : 'no-titles' }
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
    let sequenced = 0
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
        else if (verdict.rule === 'titles') titled += verdict.pairs.length
        else sequenced += verdict.pairs.length
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
          // a sequence range carries the SHAPE of its alignment, since "why these rows" is a
          // different question from "how many", and the two counts behind it are what answer it
          evidence: { rule: verdict.rule, theirs: total, ours: runLength, ...verdict.sequence ?? {} },
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

    if (dated || titled || sequenced || refused || asserted || foreign) {
      ctx.log({
        level: 'info',
        rule: 'range',
        detail: `${dated} pairs by date, ${titled} by title, ${sequenced} by sequence, `
          + `${refused} candidates refused, ${asserted} claims asserted, ${foreign} refused as foreign`,
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
