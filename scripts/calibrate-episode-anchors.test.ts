/**
 * Calibration of `plugin:range` rule 3's ANCHOR test (src/worker/graph/plugins/range.ts,
 * `alignByTitle`; docs/src/content/docs/design/representation.md P4 rule 3 and 3.4a), measured
 * against live Netflix and ani.zip episode lists rather than against one hand-picked show.
 *
 * WHY THIS EXISTS. Rule 3 anchors on EXACT stripped title equality, and the proposal is to loosen
 * that to a SCORED similarity with a MARGIN. The argument is that a retranslated title keeps most of
 * its tokens while an unrelated episode shares almost none, and that placement is still done by
 * ORDER: the anchors only bracket, and a row between two anchors with an equal gap on both sides is
 * forced with no title evidence consulted. This file measures what the loosening costs.
 *
 *   node scripts/fetch-episode-anchor-corpus.mjs
 *   ./node_modules/.bin/vitest run --config vitest.calibration.config.ts \
 *     scripts/calibrate-episode-anchors.test.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no
 * measurement. `npx vitest` fails on this machine with EBADDEVENGINES, so call the binary directly.
 * The config's `setupFiles` seeds sacha, which the two `franchiseTitle` controls below need; they
 * fail loudly when it is missing rather than quietly reporting that sacha declined every title.
 *
 * HOW TRUTH IS ESTABLISHED, AND WHY IT IS NOT CIRCULAR. Nothing the scorer says may reach the ground
 * truth, or the calibration measures its own input. A (Netflix season, canonical run) pairing enters
 * the truth set only when it closes on evidence this repo already ships and already trusts:
 *
 *   1. EXACT anchors, through the shipped `alignByTitle`: at least MIN_EPISODE_TITLE_MATCHES of them,
 *      all naming ONE offset. Two anchors disagreeing about the offset discards the pairing.
 *   2. The COUNT surplus: the canonical numbers are 1..N with no hole, and the rows the offset puts
 *      outside 1..N number exactly `theirs - N`, so nothing is left unexplained at either end.
 *   3. ani.zip's SPECIALS with their air dates: a surplus row is only allowed when the run carries at
 *      least that many specials dated inside the broadcast window (3.4a's insertions).
 *
 * Then UNIQUENESS, in the one direction where it is ambiguity: a SEASON that closes against two runs
 * is discarded whole, because which run it is is the question. A RUN that several seasons close
 * against is NOT ambiguous and is kept while their mapped ranges are pairwise disjoint, since
 * Netflix slices a 220 episode run into nine seasons and refusing that threw away most of the
 * corpus; two seasons claiming one canonical number discards that run's whole family.
 *
 * The set comes out in two TIERS, and they are never mixed: `strong` is three or more exact anchors,
 * `weak` is one or two with the counts closing exactly and no surplus at all. Plus the HARD
 * NEGATIVES, which is the measurement a rate cannot give: one show's season against another of its
 * seasons' runs, both established independently, so every pair minted there is wrong by
 * construction. That is the Blue Exorcist shape (2026-09-10, 13 of 25 episodes on the wrong Netflix
 * video) and the only population where a loosened anchor can do real damage.
 *
 * WHAT THAT BIAS DOES TO THE NUMBERS, stated rather than hidden. Truth comes from the exact anchors,
 * so the exact baseline's precision is 1.0 BY CONSTRUCTION and cannot be evidence of anything, and a
 * season with NO exact anchor can never enter the set however well a score would do on it. The
 * numbers that carry information are therefore the scored anchors' precision (they were never
 * consulted), the recall over the rows no exact anchor reached, and everything measured on the hard
 * negatives and on the whole cross product.
 *
 * WHAT IT ASSUMES ABOUT ITS OWN CORRECTNESS: nothing.
 *
 *   - SCORER CONTROL: an identical pair reaches 1.0, an unrelated pair stays low, and sacha actually
 *     strips a season off a franchise title. A constant or dead scorer fails here.
 *   - ALIGNMENT CONTROL: this file re-implements only the monotone step (patience LIS), because the
 *     shipped one is module-private. It is checked twice: against a hand built pair of lists with one
 *     CROSSING match, where the shipped anchors must come out identical AND the step must actually
 *     have dropped something, and over the whole corpus, where the scored test at an exact cell may
 *     only ever be a SUBSET of the shipped anchors (a tie the key rule resolves through a second key
 *     is refused under any margin, which is stricter, never looser).
 *   - SEPARATION CONTROL: the grid must separate its arms, in both constants. An inert scorer
 *     (constant 0, constant 1) cannot produce that.
 *   - TRUTH CONTROL: the same grid scored against a DELIBERATELY SHIFTED truth (every canonical
 *     number +1) must report near-zero precision. A metric that cannot express a wrong anchor is not
 *     measuring precision, and this is the check that says it can.
 *   - MUSHOKU TENSEI is reported separately, in full, against the hand measurement's own truth: the
 *     case the proposal came from is worth naming rather than averaging away, and its season 3 is
 *     exactly the shape no conservative closure can certify (two real titles in twelve rows).
 *
 * THE CONTROLS ARE CALIBRATED BY MUTATION, not by argument. Each was broken on purpose and the run
 * had to go RED, measured 2026-09-13:
 *
 *   setupFiles removed from the config       2 failed: both franchiseTitle controls
 *   longestMonotone returns its input        1 failed: the alignment control, on the crossing case
 *   score() forced to a constant 1 / 0 / 0.8 1 failed: the separation control, `0 to be less than 0`
 *
 * Note what the first one says about the scorer: the SWEEP does not need sacha at all, because
 * `titleSimilarity` is frizbee and initialises itself, so its numbers were unchanged under that
 * mutation. `setupFiles` is what the two `franchiseTitle` controls need, and those controls exist to
 * establish why the sweep does not use `bestTitleScore`.
 *
 * THE SYNOPSIS AXIS, ADDED 2026-09-13, AND WHY IT IS HERE AT ALL. Rule 3 gained a third anchor
 * source that scores episode SYNOPSES, and it shipped with no negative control: this file and
 * `calibrate-anchor-corpus.test.ts` both hardcoded `synopsis: []` to compile, and no case anywhere
 * carried an episode description, so the sweep, its hard negatives and the 800-row replay all ran
 * the new rule on empty strings and would have passed whatever it did. The only evidence behind
 * `SYNOPSIS_ANCHOR_FLOOR` was three seasons of one show scored against TMDB, which is not even the
 * reference side the app holds.
 *
 * What closes it, and each half is a real source rather than a stand-in:
 *
 *   THEIR SIDE    Netflix's own `contextualSynopsis`, by season id, through the same persisted query
 *                 `src/sources/unogs/netflix.ts` sends. NOT unOGS's `synopsis` field, which is a
 *                 different text in a different language on 55 of Mushoku Tensei's 61 rows.
 *   OUR SIDE      ani.zip's `overview`, which is the description the anizip extractor publishes and
 *                 therefore the reference column `EpisodeProfile.synopsisKeys` is built from.
 *   POPULATION    63 shows, 189 Netflix seasons, 2775 of 3738 Netflix rows and 3666 of 6147 ani.zip
 *                 episodes carrying a synopsis; 65 closed pairings, 1037 true pairs, 68 same-show
 *                 hard negatives and 195 cross-show negatives.
 *
 * And the guard that keeps it closed: `loadCorpus` REFUSES a corpus whose synopsis column is empty,
 * with the command that refills it. Proven by running the harness against a corpus with the column
 * stripped, 2026-09-13: `only 0 of 3738 Netflix rows carry a synopsis key`, no test executed.
 *
 * TWO ARMS, because they answer different questions, and both are reported: MARGINAL is what the
 * plugin does (the synopsis is offered only what the title tests did not take) and STANDALONE asks
 * this source to align the two lists by itself, which is the arm a precision figure means anything
 * in. The grid drives the SHIPPED `synopsisAnchors` and `offsetConsensus` at every cell through
 * their `floor`, `margin` and `gap` options, so no part of the rule is re-implemented here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { franchiseTitle, stripTitle, titleSimilarity } from '../src/sources/utils'
import { isGenericEpisodeTitle, MIN_EPISODE_TITLE_MATCHES } from '../src/sources/similar'
import {
  alignByTitle,
  closeWithSpecials,
  forcedByBracket,
  MIN_ALIGNED,
  MIN_CONSENSUS_ANCHORS,
  MIN_CONSENSUS_GAP,
  pairsBySequence,
  SCORED_ANCHOR_FLOOR,
  SCORED_ANCHOR_MARGIN,
  SYNOPSIS_ANCHOR_FLOOR,
  SYNOPSIS_ANCHOR_MARGIN,
  synopsisAnchors,
  titleDice,
  type Alignment,
  type Anchor,
  type CanonicalEpisode,
  type Pair,
  type SideEpisode,
} from '../src/worker/graph/plugins/range'
import { synopsisKeyOf } from '../src/worker/graph/plugins/profile'
import { MUSHOKU_SYNOPSES } from '../tests/unit/worker/graph/plugins/synopses'

/* ------------------------------------------------------------------------------------------------
 * Corpus
 * ---------------------------------------------------------------------------------------------- */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE = process.env.EPISODE_ANCHOR_CACHE ?? resolve(ROOT, 'node_modules/.cache/episode-anchors')
const CORPUS_PATH = process.env.EPISODE_ANCHOR_CORPUS ?? resolve(CACHE, 'corpus.json')
const OUT_DIR = process.env.EPISODE_ANCHOR_OUT ?? resolve(CACHE, 'report')

/**
 * One ani.zip episode as the corpus keeps it. `key` is numeric for a run episode and `S*` for a special.
 *
 * `overview` is ani.zip's own episode description, which is the text the anizip extractor publishes
 * (`src/sources/anizip/extractor.ts:68`) and therefore the REFERENCE side of rule 3's synopsis
 * anchor as the app holds it. Null where ani.zip carries none, which is 2481 of 6147 episodes.
 */
type CorpusEpisode = { key: string, titles: string[], airDate: string | null, overview?: string | null }
/** One AniList run with its ani.zip episode list. */
type CorpusRun = {
  anilistId: number
  title: string
  romaji: string
  format: string
  declaredEpisodes: number | null
  startDate: string | null
  episodes: CorpusEpisode[]
}
/**
 * One Netflix season as unOGS lists it, rows numbered by POSITION exactly as the source publishes them.
 *
 * `synopsis` is Netflix's OWN `contextualSynopsis`, fetched by season id and attached by position
 * (`scripts/fetch-episode-anchor-corpus.mjs`), never unOGS's `synopsis` field: measured 2026-09-13,
 * 6 of Mushoku Tensei's 61 rows agree between the two and the rest of unOGS's are Japanese, empty or
 * a placeholder string. Empty where the season could not be joined or Netflix says nothing.
 */
type CorpusSeason = {
  seasonNumber: number
  seasonId?: number | null
  rows: { number: number, title: string, synopsis?: string }[]
}
/** One show: a Netflix series and every AniList run the franchise search reached. */
type CorpusShow = {
  franchise: string
  netflixId: number
  netflixTitle: string
  seasons: CorpusSeason[]
  runs: CorpusRun[]
}
type Corpus = { fetched: string, shows: CorpusShow[] }

// The floors the task set. A corpus below them is not a calibration, and a missing corpus must never
// read as "nothing to measure": both throw with the command that produces the file.
const MIN_SHOWS = 12
const MIN_SEASONS = 25

/**
 * The fewest rows per side that must carry a REDUCED synopsis before the synopsis grid means
 * anything: 500. The live corpus carries 2775 of 3738 Netflix rows and 3666 of 6147 ani.zip
 * episodes with SOME text (2026-09-13), of which 2756 and 3613 survive `synopsisKeyOf`'s
 * `MIN_SYNOPSIS_KEY_TOKENS`, which is what this counts. So the bar is a tenth of what is there and
 * it fires only on a corpus fetched before the synopsis axis existed, or on one whose Netflix half
 * never joined.
 */
const MIN_SYNOPSIS_ROWS = 500

const loadCorpus = (): Corpus => {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `no corpus at ${CORPUS_PATH}\n`
      + `Fetch it with:\n`
      + `  node scripts/fetch-episode-anchor-corpus.mjs\n`
      + `or point EPISODE_ANCHOR_CORPUS at an existing copy.`
    )
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus
  if (!Array.isArray(corpus.shows) || !corpus.shows.length) {
    throw new Error(`corpus at ${CORPUS_PATH} holds no shows. A truncated pull must not pass as a corpus.`)
  }

  // A HARNESS THAT CANNOT EXPRESS THE PHENOMENON MUST SAY SO. The synopsis anchor first shipped
  // measured on nothing at all, because both calibration files hardcoded `synopsis: []` to compile
  // and no case anywhere carried an episode description, so the sweep and its hard negatives were
  // scoring empty strings and would have passed whatever the rule did. An empty column is now the
  // loudest failure this file has rather than its quietest pass.
  const theirRows = corpus.shows.flatMap(show => show.seasons.flatMap(season => season.rows))
  const ourRows = corpus.shows.flatMap(show => show.runs.flatMap(run => run.episodes))
  const theirSynopses = theirRows.filter(row => synopsisKeyOf(row.synopsis ?? '')).length
  const ourSynopses = ourRows.filter(row => synopsisKeyOf(row.overview ?? '')).length
  const refetch =
    `\nThe corpus predates the synopsis axis. Refetch it with:\n`
    + `  node scripts/fetch-episode-anchor-corpus.mjs\n`
    + `(every other request is cached, so the pull costs only the Netflix season calls.)`
  if (theirSynopses < MIN_SYNOPSIS_ROWS) {
    throw new Error(`only ${theirSynopses} of ${theirRows.length} Netflix rows carry a synopsis key, expected ${MIN_SYNOPSIS_ROWS} or more.${refetch}`)
  }
  if (ourSynopses < MIN_SYNOPSIS_ROWS) {
    throw new Error(`only ${ourSynopses} of ${ourRows.length} ani.zip episodes carry a synopsis key, expected ${MIN_SYNOPSIS_ROWS} or more.${refetch}`)
  }
  console.log(
    `corpus synopses: ${theirSynopses} of ${theirRows.length} Netflix rows, `
    + `${ourSynopses} of ${ourRows.length} ani.zip episodes, both reduced by synopsisKeyOf`
  )
  return corpus
}

/* ------------------------------------------------------------------------------------------------
 * The two sides, built the way the plugin reads them
 * ---------------------------------------------------------------------------------------------- */

const DAY = 86_400_000

const dayOf = (date: string | null): number | null => {
  if (!date) return null
  const time = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(time) ? null : Math.floor(time / DAY)
}

/**
 * `EpisodeProfile.titleKeys` as profile.ts produces them: stripped, non-generic, deduplicated.
 *
 * Applied here rather than left to `keysOf` so the harness scores exactly the strings the plugin
 * anchors on. Both of the plugin's own filters are idempotent against this.
 */
const keysOf = (titles: readonly string[]): string[] =>
  [...new Set(titles.map(stripTitle).filter(Boolean))].filter(key => !isGenericEpisodeTitle(key))

/**
 * `EpisodeProfile.synopsisKeys` as profile.ts produces them, for one description.
 *
 * The plugin is handed the REDUCED column and reduces again (`range.ts:synopsisKeysOf`, idempotent),
 * so reducing here is what makes the harness score the strings the rule scores rather than a second
 * reading of the same paragraph. An empty answer is `MIN_SYNOPSIS_KEY_TOKENS` refusing a text with
 * nothing in it, and the row then carries no synopsis at all, exactly as the graph row would.
 */
const synopsisOf = (text: string | null | undefined): string[] => {
  const key = synopsisKeyOf(text ?? '')
  return key ? [key] : []
}

const netflixSide = (show: CorpusShow, season: CorpusSeason): SideEpisode[] =>
  season.rows.map(row => ({
    uri: `nf:${show.netflixId}-${season.seasonNumber}-${row.number}`,
    origin: 'nf',
    number: row.number,
    day: null,
    keys: keysOf([row.title]),
    // Netflix's own contextualSynopsis, which is what the nf episode source publishes
    synopsis: synopsisOf(row.synopsis),
    hung: `nf:${show.netflixId}-${season.seasonNumber}`,
  }))

const canonicalSide = (run: CorpusRun): SideEpisode[] =>
  run.episodes.map(episode => ({
    uri: `anizip:${run.anilistId}-${episode.key}`,
    origin: 'anizip',
    number: /^\d+$/.test(episode.key) ? Number(episode.key) : null,
    day: dayOf(episode.airDate),
    keys: keysOf(episode.titles),
    synopsis: synopsisOf(episode.overview),
    hung: `anizip:${run.anilistId}`,
  }))

/** The raw (unstripped) title a row carries, for a failure report that a human can read. */
const rawTitles = new Map<string, string>()

/* ------------------------------------------------------------------------------------------------
 * Truth
 * ---------------------------------------------------------------------------------------------- */

/**
 * One (Netflix season, canonical run) pairing, built the way `plugin:range` reads the two sides.
 *
 * `alignment.anchors` is this file's OWN exact-only rule (`exactAnchors` below), never the shipped
 * `alignByTitle`'s answer, which now returns scored welds where the exact rule cannot bracket.
 * `shipped` keeps that answer beside it, for the bidirectional control and for the one measurement
 * that is ABOUT the shipped rule rather than derived from it.
 */
type Pairing = {
  franchise: string
  netflixId: number
  seasonNumber: number
  anilistId: number
  runTitle: string
  theirs: SideEpisode[]
  reference: SideEpisode[]
  alignment: Alignment
  /** The shipped rule's own alignment over the same two lists, welds included. Never reaches truth. */
  shipped: Alignment
}

/**
 * A pairing the conservative closure accepted, and how it was established.
 *
 * `tier` says on how much evidence. `strong` is the headline set: three or more exact anchors, which
 * is `MIN_EPISODE_TITLE_MATCHES` and the bar rule 2 already uses. `weak` is one or two exact anchors
 * with the counts closing exactly, kept SEPARATE and never mixed into a headline number, because it
 * is the population the loosening exists for and the population a wrong anchor is likeliest in:
 * Mushoku Tensei season 3, the case that defines the margin, carries exactly one exact anchor.
 */
type TruthEntry = Pairing & {
  tier: 'strong' | 'weak'
  /** canonical number = netflix row number + offset. */
  offset: number
  /** Netflix row number to canonical number, for every row the offset places inside the run. */
  pairs: Map<number, number>
  /** Netflix row numbers the offset puts OUTSIDE the run: 3.4a insertions, and a pair target never. */
  insertions: number[]
  exactAnchors: number
  specialsInWindow: number
  how: string
}

type Refusal = { franchise: string, seasonNumber: number, anilistId: number, reason: string }

const SPECIAL_WINDOW = 30

/**
 * Conditions 2 and 3 of the conservative closure at a GIVEN offset, with no anchor test at all.
 *
 * The truth set needs three exact anchors before it will look at an offset, which is why a pairing
 * the exact rule cannot bracket can never enter it. This is the same arithmetic without that
 * requirement: the canonical numbering is a contiguous `1..N`, the rows the offset puts outside it
 * number exactly the surplus, and each surplus row is covered by an ani.zip special dated inside the
 * broadcast window. It consults no title and no score on either side, so it is the one judge a
 * WELDED offset can be put in front of without the measurement eating its own tail. It is weaker
 * than the truth set (an offset off by a constant on a season of the right length still closes), so
 * it corroborates and never certifies.
 */
const countsClose = (pairing: Pairing, offset: number): { ok: true, pairs: number, insertions: number } | { ok: false, reason: string } => {
  const { canonical, specials } = pairing.alignment
  const numbers = canonical.map(entry => entry.number)
  const length = numbers.length
  if (!length || numbers[0] !== 1 || numbers[length - 1] !== length) return { ok: false, reason: 'canonical numbering is not a contiguous 1..N' }
  let pairs = 0
  let insertions = 0
  for (const row of pairing.theirs) {
    const slot = row.number! + offset
    if (slot >= 1 && slot <= length) pairs += 1
    else insertions += 1
  }
  const surplus = Math.max(0, pairing.theirs.length - length)
  if (insertions !== surplus) return { ok: false, reason: `offset ${offset} leaves ${insertions} rows outside the run against a surplus of ${surplus}` }
  const days = canonical.flatMap(entry => entry.rows.map(row => row.day)).filter((day): day is number => day !== null)
  const dated = days.length
    ? specials.filter(special => special.day !== null
      && special.day >= Math.min(...days) - SPECIAL_WINDOW
      && special.day <= Math.max(...days) + SPECIAL_WINDOW).length
    : 0
  if (insertions > dated) return { ok: false, reason: `${insertions} surplus rows, ${dated} dated specials in the window` }
  return { ok: true, pairs, insertions }
}

/**
 * THE EXACT ANCHOR RULE, reimplemented here so no scorer can reach the ground truth.
 *
 * WHY IT IS NOT A CALL. `alignByTitle` returned exact anchors alone until 2026-09-13; it now adds
 * SCORED welds wherever the exact ones cannot bracket, which is exactly the population this file
 * certifies pairings out of. Deriving truth through it would make the calibration measure its own
 * input: the numbers this file printed before the change moved on the same corpus the day the rule
 * landed (65 truth pairings to 69, 1109 pairs to 1197, recall 66.0% to 61.3%), and every one of them
 * was quoted in the code as evidence FOR the change.
 *
 * WHERE THE BOUNDARY IS, deliberately. What must be independent is the ANCHOR DECISION, since that
 * is the only thing the change alters. The two ordered lists and the specials come off the shipped
 * alignment because they are score free by construction (a sort and a group by number) and because
 * the bracket and the closure this file calls are the shipped functions reading those very lists, so
 * rebuilding them here would measure a copy rather than the rule. The control below asserts this
 * rule and the shipped one agree anchor for anchor once the shipped welds are set aside, in BOTH
 * directions, so a divergence in either reddens the run rather than shifting every cell of the grid.
 *
 * The rule itself, from `alignByTitle`: exact `stripTitle` equality, non-generic, unique on each
 * side, a canonical number reached by one of their rows only, then the longest increasing
 * subsequence. `keysOf` above already applies both of the plugin's key filters, so `row.keys` is
 * what `anchorKeysOf` would return.
 */
const exactAnchors = (
  ordered: readonly SideEpisode[],
  canonical: readonly CanonicalEpisode[]
): { anchors: Anchor[], matches: number } => {
  const ourKey = new Map<string, { index: number, row: SideEpisode } | null>()
  canonical.forEach((entry, index) => {
    for (const row of [...entry.rows].sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0))) {
      for (const key of row.keys) {
        const held = ourKey.get(key)
        if (held === undefined) ourKey.set(key, { index, row })
        else if (held && held.index !== index) ourKey.set(key, null)
      }
    }
  })
  const theirKey = new Map<string, SideEpisode | null>()
  for (const row of ordered) {
    for (const key of row.keys) {
      if (theirKey.has(key)) theirKey.set(key, null)
      else theirKey.set(key, row)
    }
  }

  const matches: Anchor[] = []
  ordered.forEach((row, fromIndex) => {
    const reached = new Map<number, { row: SideEpisode, key: string }>()
    for (const key of row.keys) {
      if (theirKey.get(key) !== row) continue
      const ours = ourKey.get(key)
      if (!ours) continue
      if (!reached.has(ours.index)) reached.set(ours.index, { row: ours.row, key })
    }
    // two different numbers of ours through two keys is an ambiguity, not two matches
    if (reached.size !== 1) return
    const entry = [...reached.entries()][0]!
    matches.push({ from: row, to: entry[1].row, fromIndex, toIndex: entry[0], key: entry[1].key })
  })
  const claims = new Map<number, number>()
  for (const match of matches) claims.set(match.toIndex, (claims.get(match.toIndex) ?? 0) + 1)
  const single = matches.filter(match => claims.get(match.toIndex) === 1)
  return { anchors: longestMonotone(single), matches: single.length }
}

/** The two sides, this file's exact-only alignment over them, and the shipped one beside it. */
const makePairing = (show: CorpusShow, season: CorpusSeason, run: CorpusRun): Pairing => {
  const theirs = netflixSide(show, season)
  const reference = canonicalSide(run)
  const shipped = alignByTitle(reference, theirs)
  const exact = exactAnchors(shipped.theirs, shipped.canonical)
  const alignment: Alignment = { ...shipped, anchors: exact.anchors, matches: exact.matches, scored: 0 }
  for (const row of theirs) rawTitles.set(row.uri, season.rows.find(entry => entry.number === row.number)?.title ?? '')
  for (const row of reference) {
    const episode = run.episodes.find(entry => `anizip:${run.anilistId}-${entry.key}` === row.uri)
    rawTitles.set(row.uri, episode?.titles[0] ?? '')
  }
  return {
    franchise: show.franchise,
    netflixId: show.netflixId,
    seasonNumber: season.seasonNumber,
    anilistId: run.anilistId,
    runTitle: run.title || run.romaji,
    theirs: alignment.theirs,
    reference,
    alignment,
    shipped,
  }
}

/**
 * Whether one pairing closes on exact anchors, the count surplus and the specials' dates. Returns
 * the truth entry or the reason it was discarded, never a guess.
 *
 * `minAnchors` is the only thing the two tiers differ in: everything else has to close either way.
 */
const closeExactly = (
  pairing: Pairing,
  run: CorpusRun,
  options: { minAnchors: number, tier: 'strong' | 'weak' }
): { entry: TruthEntry } | { reason: string } => {
  const { alignment } = pairing
  const { anchors, canonical, specials } = alignment
  if (pairing.theirs.filter(row => row.keys.length).length < MIN_EPISODE_TITLE_MATCHES) {
    return { reason: 'netflix season carries too few real titles' }
  }
  if (anchors.length < options.minAnchors) return { reason: `only ${anchors.length} exact anchors` }

  const offsets = new Set(anchors.map(anchor => anchor.to.number! - anchor.from.number!))
  if (offsets.size !== 1) return { reason: `exact anchors disagree on the offset (${[...offsets].sort((a, b) => a - b).join(', ')})` }
  const offset = [...offsets][0]!

  const numbers = canonical.map(entry => entry.number)
  const length = numbers.length
  if (!length || numbers[0] !== 1 || numbers[length - 1] !== length) {
    return { reason: 'canonical numbering is not a contiguous 1..N' }
  }

  const rows = pairing.theirs
  const pairs = new Map<number, number>()
  const insertions: number[] = []
  for (const row of rows) {
    const slot = row.number! + offset
    if (slot >= 1 && slot <= length) pairs.set(row.number!, slot)
    else insertions.push(row.number!)
  }
  const surplus = Math.max(0, rows.length - length)
  if (insertions.length !== surplus) {
    return { reason: `offset ${offset} leaves ${insertions.length} rows outside the run against a surplus of ${surplus}` }
  }
  if (pairs.size < MIN_EPISODE_TITLE_MATCHES) return { reason: 'offset places fewer than three rows' }

  const days = canonical.flatMap(entry => entry.rows.map(row => row.day)).filter((day): day is number => day !== null)
  const specialsInWindow = days.length
    ? specials.filter(special =>
      special.day !== null
      && special.day >= Math.min(...days) - SPECIAL_WINDOW
      && special.day <= Math.max(...days) + SPECIAL_WINDOW
    ).length
    : 0
  if (insertions.length > specialsInWindow) {
    return { reason: `${insertions.length} surplus rows, ${specialsInWindow} dated specials in the window` }
  }

  // The WEAK tier rests on one or two anchors, so it takes one thing the strong tier does not need:
  // every row must land inside the run (no surplus to argue about). A single anchor plus an
  // unexplained end is not evidence, it is an extrapolation, and 5.4 P4 has no rule by count.
  if (options.tier === 'weak' && insertions.length) {
    return { reason: 'weak tier refuses a surplus it cannot check against three anchors' }
  }

  return {
    entry: {
      ...pairing,
      tier: options.tier,
      offset,
      pairs,
      insertions,
      exactAnchors: anchors.length,
      specialsInWindow,
      how: `${anchors.length} exact anchors at offset ${offset}, ${rows.length} rows over ${length} canonical`
        + (insertions.length ? `, ${insertions.length} surplus row(s) covered by ${specialsInWindow} dated special(s)` : ', no surplus'),
    },
  }
}

/**
 * Every pairing that closed, with the ambiguous ones removed whole, plus the HARD NEGATIVES.
 *
 * The negatives are the measurement the rates cannot give: a Netflix season of one show against a
 * canonical run of the SAME show that another season of that show already closed against. Both sides
 * are established by three or more exact anchors each, so the pairing is certainly wrong, and any
 * pair rule 3 mints on it is a wrong video behind a play button. That is the Blue Exorcist shape
 * (2026-09-10, 13 of 25 episodes on the wrong Netflix video), and it is where a loosened anchor test
 * can do real damage rather than merely miss a row.
 */
const buildTruth = (corpus: Corpus): {
  entries: TruthEntry[]
  weak: TruthEntry[]
  negatives: Pairing[]
  /** EVERY (season, run) pairing in the corpus, which is what the plugin would be asked to judge. */
  all: Pairing[]
  refusals: Refusal[]
} => {
  const refusals: Refusal[] = []
  const pairings = new Map<string, { pairing: Pairing, show: CorpusShow, season: CorpusSeason, run: CorpusRun }>()

  for (const show of corpus.shows) {
    for (const season of show.seasons) {
      for (const run of show.runs) {
        const key = `${show.netflixId}-${season.seasonNumber}-${run.anilistId}`
        if (pairings.has(key)) continue
        pairings.set(key, { pairing: makePairing(show, season, run), show, season, run })
      }
    }
  }

  // One tier at a time, strongest first, and a season or a run that is already spoken for at the
  // strong tier never enters the weak one.
  const tiered = (tier: 'strong' | 'weak', minAnchors: number, taken: { seasons: Set<string>, runs: Set<number> }) => {
    const closed: TruthEntry[] = []
    for (const { pairing, run } of pairings.values()) {
      const seasonKey = `${pairing.netflixId}-${pairing.seasonNumber}`
      if (taken.seasons.has(seasonKey) || taken.runs.has(pairing.anilistId)) continue
      const result = closeExactly(pairing, run, { minAnchors, tier })
      if ('entry' in result) closed.push(result.entry)
      else {
        refusals.push({ franchise: pairing.franchise, seasonNumber: pairing.seasonNumber, anilistId: pairing.anilistId, reason: `${tier}: ${result.reason}` })
      }
    }
    const bySeason = new Map<string, number>()
    const byRun = new Map<number, TruthEntry[]>()
    for (const entry of closed) {
      const seasonKey = `${entry.netflixId}-${entry.seasonNumber}`
      bySeason.set(seasonKey, (bySeason.get(seasonKey) ?? 0) + 1)
      byRun.set(entry.anilistId, [...byRun.get(entry.anilistId) ?? [], entry])
    }
    // A RUN CLAIMED BY SEVERAL SEASONS IS NORMAL, and refusing it threw away most of the corpus:
    // Netflix slices a 220 episode run into nine seasons, each closing at its own offset. It is only
    // ambiguous when two of those seasons claim the SAME canonical number, so the test is that the
    // mapped ranges are pairwise disjoint. A SEASON claimed by two runs stays refused outright,
    // since which run it is is exactly the question.
    const overlapping = new Set<number>()
    for (const [anilistId, claimants] of byRun.entries()) {
      const seen = new Set<number>()
      for (const entry of claimants) {
        for (const slot of entry.pairs.values()) {
          if (seen.has(slot)) overlapping.add(anilistId)
          seen.add(slot)
        }
      }
    }
    const kept: TruthEntry[] = []
    for (const entry of closed) {
      const seasonKey = `${entry.netflixId}-${entry.seasonNumber}`
      if (bySeason.get(seasonKey)! > 1) {
        refusals.push({ franchise: entry.franchise, seasonNumber: entry.seasonNumber, anilistId: entry.anilistId, reason: `${tier}: season closed against more than one run` })
        continue
      }
      if (overlapping.has(entry.anilistId)) {
        refusals.push({ franchise: entry.franchise, seasonNumber: entry.seasonNumber, anilistId: entry.anilistId, reason: `${tier}: two seasons claim the same canonical numbers of one run` })
        continue
      }
      kept.push(entry)
    }
    return kept
  }

  const entries = tiered('strong', MIN_EPISODE_TITLE_MATCHES, { seasons: new Set(), runs: new Set() })
  const taken = {
    seasons: new Set(entries.map(entry => `${entry.netflixId}-${entry.seasonNumber}`)),
    runs: new Set(entries.map(entry => entry.anilistId)),
  }
  const weak = tiered('weak', 1, taken)

  const negatives: Pairing[] = []
  for (const left of entries) {
    for (const right of entries) {
      if (left.netflixId !== right.netflixId) continue
      if (left.seasonNumber === right.seasonNumber) continue
      // the same RUN under two seasons is the sliced long run above, which is not a negative at all
      if (left.anilistId === right.anilistId) continue
      const pairing = pairings.get(`${left.netflixId}-${left.seasonNumber}-${right.anilistId}`)
      if (pairing) negatives.push(pairing.pairing)
    }
  }

  return { entries, weak, negatives, all: [...pairings.values()].map(entry => entry.pairing), refusals }
}

/* ------------------------------------------------------------------------------------------------
 * Scoring, and the monotone step
 * ---------------------------------------------------------------------------------------------- */

const scoreCache = new Map<string, number>()
const score = async (a: string, b: string): Promise<number> => {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  const cached = scoreCache.get(key)
  if (cached !== undefined) return cached
  const value = await titleSimilarity(a, b)
  scoreCache.set(key, value)
  return value
}

/** The union of every key at one canonical number: several origins describe one broadcast. */
const slotKeys = (slot: CanonicalEpisode): string[] => [...new Set(slot.rows.flatMap(row => row.keys))]

/** `rows x canonical` best score over every key pair, computed once and swept over. */
const scoreMatrix = async (pairing: Pairing): Promise<number[][]> => {
  const slots = pairing.alignment.canonical.map(slotKeys)
  return await Promise.all(pairing.theirs.map(async row =>
    await Promise.all(slots.map(async keys => {
      let best = 0
      for (const mine of row.keys) {
        for (const theirs of keys) best = Math.max(best, await score(mine, theirs))
      }
      return best
    }))
  ))
}

/**
 * The same matrix on TOKEN DICE, which is the scorer `plugin:range` actually ships.
 *
 * The grid below was swept on frizbee `titleSimilarity`, and the constants were fixed by its
 * negative-side cliff, so the cliff position for the shipping scorer was an inference across two
 * hazard curves rather than a measurement. This closes that: the same populations, the same cells,
 * the scorer that runs in production. Synchronous, so it costs nothing to add.
 */
const diceMatrix = (pairing: Pairing): number[][] => {
  const slots = pairing.alignment.canonical.map(slotKeys)
  return pairing.theirs.map(row => slots.map(keys => {
    let best = 0
    for (const mine of row.keys) {
      for (const theirs of keys) best = Math.max(best, titleDice(mine, theirs))
    }
    return best
  }))
}

/** 1 when the two sides share an identical stripped key, else 0. The control's scorer, never the sweep's. */
const exactMatrix = (pairing: Pairing): number[][] => {
  const slots = pairing.alignment.canonical.map(slot => new Set(slotKeys(slot)))
  return pairing.theirs.map(row => slots.map(keys => row.keys.some(key => keys.has(key)) ? 1 : 0))
}

/**
 * The monotone step of `alignByTitle`, patience by binary search over the matches in THEIR order.
 *
 * Re-implemented here only because the shipped one is module-private. The ALIGNMENT CONTROL asserts
 * this reproduces the shipped anchors exactly when fed an exact score matrix, so a divergence fails
 * the run rather than shifting every cell in the grid.
 */
const longestMonotone = <T extends { toIndex: number }>(matches: readonly T[]): T[] => {
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
  const picked: T[] = []
  for (let index = tails.length ? tails[tails.length - 1]! : -1; index >= 0; index = parent[index]!) {
    picked.push(matches[index]!)
  }
  return picked.reverse()
}

/**
 * The PROPOSED anchor test: each row's best canonical slot, admitted when the score clears `floor`
 * and beats the runner-up slot by `margin`, then the shipped filters (a slot two rows claim is no
 * anchor) and the shipped monotone alignment.
 *
 * The margin is what refuses an ambiguity instead of tie-breaking it, which is the Mushoku season 3
 * case: `Rage, Mad Dog` scores the same against `Burn Bright, Mad Dog` and `Howl, Mad Dog`, and a
 * refused anchor costs nothing because order places the row anyway.
 */
const proposeMatches = (
  theirs: readonly SideEpisode[],
  canonical: readonly CanonicalEpisode[],
  matrix: number[][],
  floor: number,
  margin: number
): Anchor[] => {
  const matches: Anchor[] = []
  theirs.forEach((row, fromIndex) => {
    if (!row.keys.length) return
    const scores = matrix[fromIndex]!
    let bestIndex = -1
    let best = -1
    let second = -1
    scores.forEach((value, index) => {
      if (value > best) {
        second = best
        best = value
        bestIndex = index
      } else if (value > second) second = value
    })
    if (bestIndex < 0 || best < floor) return
    if (best - Math.max(second, 0) < margin) return
    const slot = canonical[bestIndex]!
    matches.push({ from: row, to: slot.rows[0]!, fromIndex, toIndex: bestIndex, key: `scored:${best.toFixed(4)}` })
  })
  // a slot two rows claim is no anchor, exactly as `alignByTitle` drops a number two rows reach
  const claims = new Map<number, number>()
  for (const match of matches) claims.set(match.toIndex, (claims.get(match.toIndex) ?? 0) + 1)
  return matches.filter(match => claims.get(match.toIndex) === 1)
}

/** The proposed test in full: propose, drop the contested slots, then align monotonically. */
const anchorsFrom = (pairing: Pairing, matrix: number[][], floor: number, margin: number): Anchor[] =>
  longestMonotone(proposeMatches(pairing.theirs, pairing.alignment.canonical, matrix, floor, margin))

/* ------------------------------------------------------------------------------------------------
 * What one cell of the grid comes to
 * ---------------------------------------------------------------------------------------------- */

/** One wrong pair, named in full: a rate hides the one case that puts a wrong video behind a play button. */
type Wrong = {
  franchise: string
  seasonNumber: number
  kind: 'anchor' | 'placed'
  netflixNumber: number
  netflixTitle: string
  canonicalNumber: number
  canonicalTitle: string
  truth: number | 'insertion'
}

type Cell = {
  floor: number
  margin: number
  proposed: number
  correct: number
  wrong: number
  /** Anchors on rows no exact anchor reached: the only population the loosening exists to serve. */
  novelProposed: number
  novelCorrect: number
  /**
   * Matches the score admitted BEFORE the two structural filters (a slot two rows claim, and the
   * monotone alignment). The gap between `rawWrong` and `wrong` is what ORDER catches and the score
   * does not, which is the safety argument rule 3 rests on stated as a number.
   */
  rawProposed: number
  rawWrong: number
  /** Rule 3's own gate: two anchors and at least one row placed by ORDER. */
  seasonsSpeaking: number
  placed: number
  placedCorrect: number
  placedWrong: number
  /**
   * What rule 3 actually EMITS, which is nothing at all unless the gate passes: a pairing with
   * anchors and no row for order to place mints zero pairs by design (5.4 P4), so a looser anchor
   * test can lower this number while raising the anchor recall above it.
   */
  mintedCorrect: number
  mintedWrong: number
  seasonsWithWrong: number
  failures: Wrong[]
}

const truthOf = (entry: TruthEntry, netflixNumber: number): number | 'insertion' =>
  entry.pairs.get(netflixNumber) ?? 'insertion'

const asAlignment = (pairing: Pairing, anchors: Anchor[]): Alignment =>
  ({ ...pairing.alignment, anchors, matches: anchors.length })

const titleOf = (uri: string): string => rawTitles.get(uri) ?? uri

/** One truth pairing with its score matrix, and which of its rows an exact anchor already reached. */
type Prepared = { entry: TruthEntry, matrix: number[][], exactRows: Set<number> }
/** One hard negative with its score matrix. There is no truth to attach: every pair on it is wrong. */
type PreparedNegative = { pairing: Pairing, matrix: number[][] }

const sweepCell = (
  entries: readonly Prepared[],
  floor: number,
  margin: number,
  shift = 0
): Cell => {
  const cell: Cell = {
    floor,
    margin,
    proposed: 0,
    correct: 0,
    wrong: 0,
    novelProposed: 0,
    novelCorrect: 0,
    rawProposed: 0,
    rawWrong: 0,
    seasonsSpeaking: 0,
    placed: 0,
    placedCorrect: 0,
    placedWrong: 0,
    mintedCorrect: 0,
    mintedWrong: 0,
    seasonsWithWrong: 0,
    failures: [],
  }
  for (const { entry, matrix, exactRows } of entries) {
    const raw = proposeMatches(entry.theirs, entry.alignment.canonical, matrix, floor, margin)
    const anchors = longestMonotone(raw)
    for (const match of raw) {
      const expected = truthOf(entry, match.from.number!)
      const want = typeof expected === 'number' ? expected + shift : expected
      cell.rawProposed += 1
      if (want !== entry.alignment.canonical[match.toIndex]!.number) cell.rawWrong += 1
    }
    let wrongHere = 0
    let anchorsCorrect = 0
    let anchorsWrong = 0
    for (const anchor of anchors) {
      const expected = truthOf(entry, anchor.from.number!)
      const want = typeof expected === 'number' ? expected + shift : expected
      const got = entry.alignment.canonical[anchor.toIndex]!.number
      cell.proposed += 1
      const novel = !exactRows.has(anchor.from.number!)
      if (novel) cell.novelProposed += 1
      if (want === got) {
        cell.correct += 1
        anchorsCorrect += 1
        if (novel) cell.novelCorrect += 1
      } else {
        cell.wrong += 1
        anchorsWrong += 1
        wrongHere += 1
        cell.failures.push({
          franchise: entry.franchise,
          seasonNumber: entry.seasonNumber,
          kind: 'anchor',
          netflixNumber: anchor.from.number!,
          netflixTitle: titleOf(anchor.from.uri),
          canonicalNumber: got,
          canonicalTitle: titleOf(anchor.to.uri),
          truth: expected,
        })
      }
    }

    // The rows ORDER places, which is the only thing rule 3 adds and the only reason the anchors are
    // allowed out at all: the bracket and the closure are the shipped functions, unmodified.
    const alignment = asAlignment(entry, anchors)
    const bracket = forcedByBracket(alignment)
    const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
    const placed: Pair[] = [...bracket.pairs, ...closure.pairs]
    const speaks = anchors.length >= MIN_ALIGNED && placed.length > 0
    if (speaks) {
      cell.seasonsSpeaking += 1
      // the anchors ride out with the placed rows or not at all, so they only count as MINTED here
      cell.mintedCorrect += anchorsCorrect
      cell.mintedWrong += anchorsWrong
    }
    for (const pair of speaks ? placed : []) {
      const expected = truthOf(entry, pair.fromNumber)
      const want = typeof expected === 'number' ? expected + shift : expected
      cell.placed += 1
      if (want === pair.toNumber) {
        cell.placedCorrect += 1
        cell.mintedCorrect += 1
      } else {
        cell.placedWrong += 1
        cell.mintedWrong += 1
        wrongHere += 1
        cell.failures.push({
          franchise: entry.franchise,
          seasonNumber: entry.seasonNumber,
          kind: 'placed',
          netflixNumber: pair.fromNumber,
          netflixTitle: titleOf(pair.from.uri),
          canonicalNumber: pair.toNumber,
          canonicalTitle: titleOf(pair.to.uri),
          truth: expected,
        })
      }
    }
    if (wrongHere) cell.seasonsWithWrong += 1
  }
  return cell
}

/** What one cell does on the HARD NEGATIVES, where every pair minted is wrong by construction. */
type NegativeCell = {
  proposed: number
  /** Pairings where rule 3 SPEAKS: two anchors and at least one row order placed. Each one is a weld. */
  speaking: number
  placed: number
  examples: string[]
}

const sweepNegativeCell = (
  prepared: readonly PreparedNegative[],
  floor: number,
  margin: number
): NegativeCell => {
  const cell: NegativeCell = { proposed: 0, speaking: 0, placed: 0, examples: [] }
  for (const { pairing, matrix } of prepared) {
    const anchors = anchorsFrom(pairing, matrix, floor, margin)
    cell.proposed += anchors.length
    const alignment = asAlignment(pairing, anchors)
    const bracket = forcedByBracket(alignment)
    const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
    const placed = [...bracket.pairs, ...closure.pairs]
    if (anchors.length < MIN_ALIGNED || !placed.length) continue
    cell.speaking += 1
    cell.placed += placed.length + anchors.length
    cell.examples.push(
      `${pairing.franchise} S${pairing.seasonNumber} onto anilist ${pairing.anilistId} (${pairing.runTitle}): `
      + `${anchors.length} anchors, ${placed.length} rows placed, e.g. nf ${anchors[0]!.from.number} `
      + `"${titleOf(anchors[0]!.from.uri)}" -> canonical ${alignment.canonical[anchors[0]!.toIndex]!.number} `
      + `"${titleOf(anchors[0]!.to.uri)}"`
    )
  }
  return cell
}

/* ------------------------------------------------------------------------------------------------
 * The SYNOPSIS axis: rule 3's third anchor source, which shipped with no negative control
 * ---------------------------------------------------------------------------------------------- */

/**
 * What one cell of the synopsis grid comes to, on one population.
 *
 * `proposed` is what the floor and the margin admit, `kept` is what survives `offsetConsensus`, and
 * the two are reported separately for the reason `synopsisAnchors` returns both: a case that cannot
 * see both cannot tell a gate that removed an outlier from a scorer that never proposed one.
 *
 * `speaking` counts pairings where the kept anchors reach `MIN_ALIGNED` and order then places at
 * least one row, which is the only state in which rule 3 emits anything at all.
 */
type SynopsisCell = {
  floor: number
  margin: number
  gap: number
  proposed: number
  proposedWrong: number
  kept: number
  correct: number
  wrong: number
  /** Kept anchors on rows NO exact and no scored anchor reached: the population this source exists for. */
  novel: number
  speaking: number
  placed: number
  placedWrong: number
  seasonsWithWrong: number
  failures: Wrong[]
}

/**
 * One truth pairing prepared for the synopsis sweep: the rows a stronger anchor source already holds,
 * which is what `synopsisAnchors` is handed as `taken` inside the shipped `alignByTitle`.
 *
 * `taken` is the SHIPPED alignment's exact and scored anchors, not this file's exact-only set,
 * because that is what the plugin passes: the synopsis is offered only what the two title tests did
 * not take. Truth never reads it.
 */
type PreparedSynopsis = { entry: TruthEntry, taken: Anchor[], exactRows: Set<number> }

const takenBy = (pairing: Pairing): Anchor[] =>
  pairing.shipped.anchors.filter(anchor => !anchor.synopsis)

/**
 * One cell, driven through the SHIPPED `synopsisAnchors` with the cell's floor, margin and gap.
 *
 * Nothing is re-implemented here. A grid swept over a copy of a rule measures the copy, which is
 * exactly how the first version of this anchor source came to ship with a calibration that could not
 * see it: both harnesses hardcoded an empty synopsis column and passed whatever the rule did.
 */
const sweepSynopsisCell = (
  prepared: readonly PreparedSynopsis[],
  floor: number,
  margin: number,
  gap: number,
  shift = 0
): SynopsisCell => {
  const cell: SynopsisCell = {
    floor, margin, gap,
    proposed: 0, proposedWrong: 0, kept: 0, correct: 0, wrong: 0, novel: 0,
    speaking: 0, placed: 0, placedWrong: 0, seasonsWithWrong: 0, failures: [],
  }
  for (const { entry, taken, exactRows } of prepared) {
    const found = synopsisAnchors({
      ordered: entry.theirs,
      canonical: entry.alignment.canonical,
      taken,
      anchors: taken.filter(anchor => !anchor.scored),
      floor,
      margin,
      gap,
    })
    const numberAt = (toIndex: number): number => entry.alignment.canonical[toIndex]!.number
    // the TRUTH CONTROL shifts every canonical number, so a metric that cannot express a wrong
    // anchor reports the same precision either way and says so out loud
    const want = (number: number): number | 'insertion' => {
      const expected = truthOf(entry, number)
      return typeof expected === 'number' ? expected + shift : expected
    }
    for (const match of found.proposed) {
      cell.proposed += 1
      if (want(match.from.number!) !== numberAt(match.toIndex)) cell.proposedWrong += 1
    }
    let wrongHere = 0
    for (const anchor of found.anchors) {
      cell.kept += 1
      if (!exactRows.has(anchor.from.number!)) cell.novel += 1
      const got = numberAt(anchor.toIndex)
      const expected = want(anchor.from.number!)
      if (expected === got) cell.correct += 1
      else {
        cell.wrong += 1
        wrongHere += 1
        cell.failures.push({
          franchise: entry.franchise,
          seasonNumber: entry.seasonNumber,
          kind: 'anchor',
          netflixNumber: anchor.from.number!,
          netflixTitle: titleOf(anchor.from.uri),
          canonicalNumber: got,
          canonicalTitle: titleOf(anchor.to.uri),
          truth: truthOf(entry, anchor.from.number!),
        })
      }
    }
    // What ORDER then does with those anchors, which is the only thing rule 3 emits: the bracket and
    // the closure are the shipped functions over the union of every anchor source, unmodified.
    const union = [...taken, ...found.anchors].sort((a, b) => a.fromIndex - b.fromIndex)
    const alignment = asAlignment(entry, union)
    const bracket = forcedByBracket(alignment)
    const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
    const placed = [...bracket.pairs, ...closure.pairs]
    if (found.anchors.length && union.length >= MIN_ALIGNED && placed.length) {
      cell.speaking += 1
      for (const pair of placed) {
        cell.placed += 1
        if (want(pair.fromNumber) !== pair.toNumber) {
          cell.placedWrong += 1
          wrongHere += 1
          cell.failures.push({
            franchise: entry.franchise,
            seasonNumber: entry.seasonNumber,
            kind: 'placed',
            netflixNumber: pair.fromNumber,
            netflixTitle: titleOf(pair.from.uri),
            canonicalNumber: pair.toNumber,
            canonicalTitle: titleOf(pair.to.uri),
            truth: truthOf(entry, pair.fromNumber),
          })
        }
      }
    }
    if (wrongHere) cell.seasonsWithWrong += 1
  }
  return cell
}

/**
 * The same cell on the HARD NEGATIVES: one show's season against a DIFFERENT season's run.
 *
 * There is no truth to compare against and none is needed. Both sides were established independently
 * and they are not the same broadcast, so a consensus that FIRES here is a wrong offset agreed on by
 * a majority of wrong anchors, which is the exact shape `MIN_CONSENSUS_GAP` is about and the shape
 * that welded 13 of 25 Blue Exorcist episodes onto the wrong Netflix video.
 */
type SynopsisNegativeCell = { fired: number, anchors: number, placed: number, examples: string[] }

const sweepSynopsisNegativeCell = (
  prepared: readonly { pairing: Pairing, taken: Anchor[] }[],
  floor: number,
  margin: number,
  gap: number
): SynopsisNegativeCell => {
  const cell: SynopsisNegativeCell = { fired: 0, anchors: 0, placed: 0, examples: [] }
  for (const { pairing, taken } of prepared) {
    const found = synopsisAnchors({
      ordered: pairing.theirs,
      canonical: pairing.alignment.canonical,
      taken,
      anchors: taken.filter(anchor => !anchor.scored),
      floor,
      margin,
      gap,
    })
    if (!found.anchors.length) continue
    cell.fired += 1
    cell.anchors += found.anchors.length
    const union = [...taken, ...found.anchors].sort((a, b) => a.fromIndex - b.fromIndex)
    const alignment = asAlignment(pairing, union)
    const bracket = forcedByBracket(alignment)
    const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
    const placed = [...bracket.pairs, ...closure.pairs]
    cell.placed += placed.length + found.anchors.length
    cell.examples.push(
      `${pairing.franchise} S${pairing.seasonNumber} onto anilist ${pairing.anilistId} (${pairing.runTitle}): `
      + `consensus ${found.consensus}, ${found.anchors.length} anchors of ${found.proposed.length} proposed, `
      + `${placed.length} rows placed`
    )
  }
  return cell
}

/* ------------------------------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------------------------------- */

const pct = (part: number, whole: number): string => whole ? `${(100 * part / whole).toFixed(1)}%` : '-'

const table = (
  title: string,
  floors: readonly number[],
  margins: readonly number[],
  value: (floor: number, margin: number) => string
) => {
  console.log(`\n${title}`)
  console.log(['floor', ...margins.map(margin => `m${margin.toFixed(2)}`)].map(cell => cell.padStart(8)).join(''))
  for (const floor of floors) {
    console.log([floor.toFixed(2), ...margins.map(margin => value(floor, margin))].map(cell => cell.padStart(8)).join(''))
  }
}

const FLOORS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
const MARGINS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]

/**
 * The SYNOPSIS grid, which sits an order of magnitude below the title grid on purpose.
 *
 * Two independently written paragraphs about one episode share the names and the events and little
 * else, so a title floor of 0.60 accepts none of them: the hand measurement's true pairs land
 * between 0.20 and 0.50. The range runs from 0.10, which is below anything defensible, to 0.45,
 * which is above the median true pair, so the curve has to show its own cliff rather than be
 * asserted to have one.
 */
const SYNOPSIS_FLOORS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45]
const SYNOPSIS_MARGINS = [0, 0.02, 0.05, 0.08, 0.10, 0.15]

/** How far the winning offset must outnumber the runner-up. 0 is a bare majority, the shipped rule before 2a. */
const CONSENSUS_GAPS = [0, 1, 2, 3, 4, 5]

/* ------------------------------------------------------------------------------------------------ */

describe('rule 3 anchor calibration', () => {
  const corpus = loadCorpus()
  const truth = buildTruth(corpus)
  const entries = truth.entries

  it('control: the scorer is live and sacha strips a season', async () => {
    expect(await titleSimilarity('the brokenhearted mage', 'the brokenhearted mage')).toBe(1)
    expect(await titleSimilarity('the brokenhearted mage', 'a man of many talents')).toBeLessThan(0.5)
    // franchiseTitle returns its input unchanged when sacha was never seeded, which is what the
    // config's setupFiles is for. This is the assertion that fails when it is missing.
    expect(await franchiseTitle('Mushoku Tensei: Jobless Reincarnation Season 2')).toBe('Mushoku Tensei: Jobless Reincarnation')
  })

  /**
   * WHY THE SCORER HERE IS `titleSimilarity` AND NOT `bestTitleScore`.
   *
   * `bestTitleScore` is the repo's franchise-level scorer and runs both sides through
   * `franchiseTitle`, which is sacha parsing a media NAME: it strips what looks like a season or a
   * part marker. On a show title that is the whole point ("Season 2" is not identity). On an EPISODE
   * title it deletes the only thing separating two episodes, so a scorer built on it cannot be
   * asked which of them a row means. This measures that rather than asserting it: the count of
   * titles it rewrites, and the pairs of DISTINCT episode titles it collapses onto one string.
   *
   * The scorer used by the sweep is `titleSimilarity`, which is the same frizbee path
   * `bestTitleScore` calls underneath, minus the franchise stripping, and `stripTitle` is the same
   * normalisation rule 3 already anchors on.
   */
  it('control: franchiseTitle is the wrong scorer for EPISODE titles, with the evidence', async () => {
    const titles = [...new Set(entries.flatMap(entry => entry.theirs.map(row => titleOf(row.uri))).filter(Boolean))]
    const rewritten: string[] = []
    const byFranchiseTitle = new Map<string, string>()
    const collisions: string[] = []
    for (const title of titles.slice(0, 400)) {
      const parsed = await franchiseTitle(title)
      if (stripTitle(parsed) !== stripTitle(title)) rewritten.push(`${title} -> ${parsed}`)
      const key = stripTitle(parsed)
      const held = byFranchiseTitle.get(key)
      if (held && held !== title) collisions.push(`${held} == ${title} (both become "${parsed}")`)
      else byFranchiseTitle.set(key, title)
    }
    console.log(`\nfranchiseTitle over ${Math.min(400, titles.length)} distinct Netflix episode titles: ${rewritten.length} rewritten, ${collisions.length} collapsed onto another title`)
    for (const line of rewritten.slice(0, 8)) console.log(`  rewritten ${line}`)
    for (const line of collisions.slice(0, 8)) console.log(`  COLLAPSED ${line}`)
    // The claim is not about a rate: it is that this scorer cannot tell two real episodes apart, and
    // one surviving collision is enough to establish it. A run with no collisions would have to
    // explain why the sweep does not use franchiseTitle, so the assertion is the honest place for it.
    expect(collisions.length).toBeGreaterThan(0)
  })

  it('the truth set closes, and says how', () => {
    const shows = new Set(entries.map(entry => entry.franchise))
    const seasons = new Set(entries.map(entry => `${entry.netflixId}-${entry.seasonNumber}`))
    const pairs = entries.reduce((total, entry) => total + entry.pairs.size, 0)
    console.log(`\nTRUTH SET (strong): ${seasons.size} seasons over ${shows.size} shows, ${pairs} pairs, ${entries.length} pairings`)
    for (const entry of entries) {
      console.log(`  ${entry.franchise} S${entry.seasonNumber} x anilist ${entry.anilistId} (${entry.runTitle}): ${entry.how}`)
    }
    const weakPairs = truth.weak.reduce((total, entry) => total + entry.pairs.size, 0)
    console.log(`\nWEAK TIER, reported separately and never mixed in: ${truth.weak.length} pairings, ${weakPairs} pairs`)
    for (const entry of truth.weak) {
      console.log(`  ${entry.franchise} S${entry.seasonNumber} x anilist ${entry.anilistId} (${entry.runTitle}): ${entry.how}`)
    }
    console.log(`\nHARD NEGATIVES: ${truth.negatives.length} pairings, every one of them certainly wrong`)
    const reasons = new Map<string, number>()
    for (const refusal of truth.refusals) {
      const bucket = refusal.reason.replace(/\d+/g, 'N')
      reasons.set(bucket, (reasons.get(bucket) ?? 0) + 1)
    }
    console.log(`\nDISCARDED ${truth.refusals.length} pairings:`)
    for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(5)}  ${reason}`)
    }
    expect(shows.size).toBeGreaterThanOrEqual(MIN_SHOWS)
    expect(seasons.size).toBeGreaterThanOrEqual(MIN_SEASONS)
  })

  it('control: the re-implemented monotone step reproduces the shipped one, and is load bearing', () => {
    // A hand built pair of lists with one CROSSING match, which is the only thing the monotone step
    // exists to drop. Titles are distinct on both sides so no uniqueness rule can fire instead.
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
    const reference: SideEpisode[] = words.map((word, index) => ({
      uri: `ours:${index + 1}`, origin: 'anizip', number: index + 1, day: null, keys: [word], synopsis: [], hung: 'ours',
    }))
    // their rows 2 and 4 carry our rows 4 and 2, so those two matches CROSS: every title is still
    // unique on both sides, which leaves the monotone step as the only thing that can drop one
    const theirs: SideEpisode[] = ['alpha', 'delta', 'charlie', 'bravo', 'echo'].map((word, index) => ({
      uri: `theirs:${index + 1}`, origin: 'nf', number: index + 1, day: null, keys: [word], synopsis: [], hung: 'theirs',
    }))

    const shipped = alignByTitle(reference, theirs)
    const matrix = theirs.map(row => shipped.canonical.map(slot =>
      slot.rows.some(entry => entry.keys.some(key => row.keys.includes(key))) ? 1 : 0))
    const proposed = proposeMatches(shipped.theirs, shipped.canonical, matrix, 1, 0.5)
    const mine = longestMonotone(proposed)

    expect(mine.map(anchor => `${anchor.from.number}->${shipped.canonical[anchor.toIndex]!.number}`))
      .toEqual(shipped.anchors.map(anchor => `${anchor.from.number}->${anchor.to.number}`))
    // and the step DID something: without it the crossing match would still be in the set, so this
    // control cannot pass against a monotone step that returns its input
    expect(proposed.length).toBeGreaterThan(mine.length)
    console.log(`\nALIGNMENT CONTROL: ${proposed.length} matches, ${mine.length} after the monotone step, shipped agrees`)

    // Over the real corpus the scored test at an exact cell can only be STRICTER than the shipped
    // key rule: where our side spells one title at two numbers, the key rule drops that key and may
    // match the row through another, while a tie refuses under any margin. So the relation asserted
    // is containment, and the divergences are counted rather than hidden.
    let shippedTotal = 0
    let reproduced = 0
    let extra = 0
    for (const entry of entries) {
      const mineHere = new Set(anchorsFrom(entry, exactMatrix(entry), 1, 0.5)
        .map(anchor => `${anchor.from.number}->${entry.alignment.canonical[anchor.toIndex]!.number}`))
      const shippedHere = new Set(entry.alignment.anchors.map(anchor => `${anchor.from.number}->${anchor.to.number}`))
      shippedTotal += shippedHere.size
      for (const key of mineHere) {
        if (shippedHere.has(key)) reproduced += 1
        else extra += 1
      }
    }
    console.log(`  corpus: ${reproduced} of ${shippedTotal} shipped anchors reproduced, ${extra} the shipped rule does not hold`)
    expect(extra).toBe(0)
    expect(reproduced).toBeGreaterThan(0.9 * shippedTotal)
  })

  /**
   * THE ANTI-CIRCULARITY CONTROL, and the reason the rest of this file can be believed.
   *
   * Two assertions, and the second is what the previous version of this file lacked:
   *
   *   - `exactAnchors` agrees with the shipped rule's EXACT anchors on every pairing in the corpus,
   *     in BOTH directions (an anchor the harness holds and the shipped rule does not is a bug in
   *     this file; one the shipped rule holds and the harness does not shifts every truth pairing).
   *     The old control asserted containment plus `reproduced > 0.9 * shipped`, which passed while
   *     silently absorbing 41 welds into the truth set.
   *   - No anchor that reaches the truth derivation carries `scored`. That is the property, stated
   *     as a property rather than as an argument about where the call sites are.
   *
   * The second assertion needs its own control, or it is vacuous: if the shipped rule welded nothing
   * anywhere in this corpus, "the truth set contains no weld" would be true of a rig that could not
   * see one. So the run also counts the pairings the shipped rule DOES weld on, and fails if that is
   * zero. Both halves have to be able to produce a positive.
   */
  it('control: truth is derived by the exact rule alone, and no weld can reach it', () => {
    const missing: string[] = []
    const extra: string[] = []
    let exactTotal = 0
    let weldedPairings = 0
    let welds = 0
    let synopses = 0
    for (const pairing of truth.all) {
      const mine = new Set(pairing.alignment.anchors.map(anchor => `${anchor.from.number}->${anchor.to.number}`))
      // BOTH inexact sources are excluded, not just the weld. This read `!anchor.scored` alone until
      // the corpus carried synopses, at which point it reported 368 anchors the harness was
      // "missing": a synopsis anchor is not scored either, so the control silently counted one as an
      // equality and would have let the truth set be built off the source it is meant to judge
      const shippedExact = new Set(pairing.shipped.anchors
        .filter(anchor => !anchor.scored && !anchor.synopsis)
        .map(anchor => `${anchor.from.number}->${anchor.to.number}`))
      const scored = pairing.shipped.anchors.filter(anchor => anchor.scored).length
      synopses += pairing.shipped.anchors.filter(anchor => anchor.synopsis).length
      if (scored) {
        weldedPairings += 1
        welds += scored
      }
      exactTotal += shippedExact.size
      const where = `${pairing.franchise} S${pairing.seasonNumber} x ${pairing.anilistId}`
      for (const key of shippedExact) if (!mine.has(key)) missing.push(`${where} ${key}`)
      for (const key of mine) if (!shippedExact.has(key)) extra.push(`${where} ${key}`)
    }
    console.log(
      `\nANTI-CIRCULARITY CONTROL: ${exactTotal} shipped EXACT anchors over ${truth.all.length} pairings, `
      + `${missing.length} the harness misses, ${extra.length} the harness invents; `
      + `the shipped rule welds on ${weldedPairings} pairings (${welds} welds) and anchors `
      + `${synopses} rows on a SYNOPSIS, none of which reach truth`
    )
    if (missing.length) console.log(`  missing: ${missing.slice(0, 8).join(' | ')}`)
    if (extra.length) console.log(`  extra:   ${extra.slice(0, 8).join(' | ')}`)
    expect(missing).toEqual([])
    expect(extra).toEqual([])
    // the check can produce a positive: there ARE welds AND synopsis anchors in this corpus for it
    // to have excluded. A corpus carrying neither would pass this control while proving nothing
    expect(weldedPairings).toBeGreaterThan(0)
    expect(synopses).toBeGreaterThan(0)
    // and none of them is in the truth set, the negatives, or any swept alignment
    const swept = [...truth.entries, ...truth.weak, ...truth.negatives, ...truth.all]
    expect(swept.flatMap(pairing => pairing.alignment.anchors.filter(anchor => anchor.scored || anchor.synopsis))).toEqual([])
    expect(truth.entries.every(entry => entry.exactAnchors === entry.alignment.anchors.length)).toBe(true)
  })

  /**
   * The case the proposal was hand measured on, printed in full rather than summarised.
   *
   * Mushoku Tensei's Netflix seasons against every ani.zip run the franchise search reached: what the
   * exact rule anchors, what the conservative closure makes of it, and what the scored test proposes
   * at each candidate cell with its scores. The hand measurement's own truth (season 2: Netflix N is
   * canonical N-1; season 3: N is N) came from the owner rather than from any scorer, so it is quoted
   * here as the yardstick and never mixed into the swept set.
   */
  it('reports the Mushoku Tensei seasons the hand measurement used', async () => {
    /**
     * The hand measurement's truth, per (Netflix season x AniList run), from the OWNER rather than
     * from any scorer: season 2's rows run one behind the canonical numbering because row 1 is the
     * `Guardian Fitz` special, and AniList splits that season into two 12 episode parts, so rows 2
     * to 13 are part one's 1 to 12 and rows 14 to 25 are part two's. Season 3 is N to N. A row this
     * returns `'insertion'` for belongs to no slot of that run, so any anchor on it is wrong.
     */
    const HAND_TRUTH: Record<string, (row: number) => number | 'insertion'> = {
      '2x146065': row => row >= 2 && row <= 13 ? row - 1 : 'insertion',
      '2x166873': row => row >= 14 && row <= 25 ? row - 13 : 'insertion',
      '3x178789': row => row >= 1 && row <= 12 ? row : 'insertion',
    }
    const show = corpus.shows.find(entry => entry.franchise === 'Mushoku Tensei')
    // a missing show must not read as a passing case
    expect(show, 'the corpus carries no Mushoku Tensei; refetch it').toBeTruthy()
    console.log(`\nMUSHOKU TENSEI, nf ${show!.netflixId} "${show!.netflixTitle}"`)
    for (const run of show!.runs) {
      const numbered = run.episodes.filter(episode => /^\d+$/.test(episode.key)).length
      console.log(`  run anilist ${run.anilistId} (${run.title || run.romaji}): ${numbered} numbered, ${run.episodes.length - numbered} specials, started ${run.startDate}`)
    }
    for (const season of show!.seasons) {
      console.log(`  season ${season.seasonNumber}: ${season.rows.length} rows`)
      for (const run of show!.runs) {
        const pairing = makePairing(show!, season, run)
        const closure = closeExactly(pairing, run, { minAnchors: MIN_EPISODE_TITLE_MATCHES, tier: 'strong' })
        const anchors = pairing.alignment.anchors
          .map(anchor => `${anchor.from.number}->${anchor.to.number}`)
          .join(' ')
        console.log(
          `    x ${run.anilistId}: ${pairing.alignment.anchors.length} exact anchors [${anchors}], `
          + `closure ${'entry' in closure ? `ACCEPTED offset ${closure.entry.offset}` : `refused (${closure.reason})`}`
        )
        const expected = HAND_TRUTH[`${season.seasonNumber}x${run.anilistId}`]
        const matrix = await scoreMatrix(pairing)
        for (const [floor, margin] of [[0.34, 0], [0.50, 0], [0.50, 0.15], [0.60, 0.15], [0.70, 0.15]] as const) {
          const scored = anchorsFrom(pairing, matrix, floor, margin)
          // printed even when it is empty: an ambiguity the claims filter eats takes the GOOD anchor
          // with it, and a skipped line reads as a cell that was never measured
          if (!scored.length) {
            console.log(`      scored ${floor.toFixed(2)}/${margin.toFixed(2)}: no anchors`)
            continue
          }
          const alignment = asAlignment(pairing, scored)
          const bracket = forcedByBracket(alignment)
          const closed = closeWithSpecials({ alignment, unequal: bracket.unequal })
          const verdicts = scored.map(anchor => {
            const got = alignment.canonical[anchor.toIndex]!.number
            const want = expected?.(anchor.from.number!)
            const mark = want === undefined ? '' : want === got ? ' ok' : ` WRONG(want ${want})`
            return `${anchor.from.number}->${got} (${anchor.key.replace('scored:', '')})${mark}`
          })
          console.log(
            `      scored ${floor.toFixed(2)}/${margin.toFixed(2)}: ${scored.length} anchors, `
            + `${bracket.pairs.length} bracketed, ${closed.pairs.length} closed; ${verdicts.join(' ')}`
          )
          // The recommendation must not put a wrong anchor on the case that motivated the change.
          if (expected && floor === 0.60 && margin === 0.15) {
            const wrong = scored.filter(anchor => expected(anchor.from.number!) !== alignment.canonical[anchor.toIndex]!.number)
            expect(wrong.map(anchor => `${anchor.from.number}->${alignment.canonical[anchor.toIndex]!.number}`)).toEqual([])
          }
        }
      }
    }
  })

  /**
   * WHAT THE SHIPPED FALLBACK ADDS OVER THE EXACT RULE, measured on the shipped code itself.
   *
   * Not an emulation and not a grid: `alignByTitle` as it ships (token Dice, `SCORED_ANCHOR_FLOOR`,
   * `SCORED_ANCHOR_MARGIN`, the taken-number and crossing filters) against this file's exact-only
   * alignment over the same two lists, both put through the same gate. Three populations: the truth
   * set, the hard negatives where every minted pair is wrong by construction, and the whole cross
   * product, which is what the plugin is actually asked to judge.
   *
   * The three numbers a decision needs are PAIRINGS UNLOCKED (the exact rule cannot bracket there at
   * all, so rule 3 is silent today), ROWS PLACED BY ORDER, and PAIRS MINTED. A fallback that moves
   * none of them buys nothing, whatever its anchor recall says: an anchor that mints no pair changes
   * no button.
   *
   * The window is a no-op on this corpus and is not applied: every canonical number comes off the
   * run itself, so `1..runLength` contains every anchor and every bracketed row by construction.
   */
  it('measures what the shipped fallback adds over the exact rule alone', () => {
    /** `pairsBySequence`'s gate, applied to a given alignment: the anchors ride out with the placed rows or not at all. */
    const mint = (alignment: Alignment) => {
      const anchored = alignment.anchors.length < MIN_ALIGNED
        ? []
        : alignment.anchors.map(anchor => ({
          from: anchor.from,
          to: anchor.to,
          fromNumber: anchor.from.number!,
          toNumber: anchor.to.number!,
        }))
      const bracket = forcedByBracket(alignment)
      const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
      const placed = [...bracket.pairs, ...closure.pairs]
      const speaks = anchored.length > 0 && placed.length > 0
      return {
        anchors: alignment.anchors.length,
        scored: alignment.anchors.filter(anchor => anchor.scored).length,
        placed: placed.length,
        pairs: speaks ? [...anchored, ...placed.map(pair => ({ ...pair }))] : [],
        speaks,
      }
    }

    // CONTROL: the gate above is the shipped one. Same pairs, same count, on every pairing that has
    // any, or the whole comparison is against an emulation that drifted.
    let checked = 0
    for (const pairing of truth.all) {
      const shipped = pairsBySequence(pairing.reference, pairing.theirs)
      const mine = mint(pairing.shipped)
      expect(mine.pairs.map(pair => `${pair.fromNumber}->${pair.toNumber}`).sort())
        .toEqual(shipped.pairs.map(pair => `${pair.fromNumber}->${pair.toNumber}`).sort())
      if (shipped.pairs.length) checked += 1
    }
    console.log(`\nGATE CONTROL: the local gate reproduces pairsBySequence on all ${truth.all.length} pairings, ${checked} of them minting`)
    expect(checked).toBeGreaterThan(0)

    const arm = (pick: (pairing: Pairing) => Alignment, label: string) => {
      let speaking = 0
      let placed = 0
      let minted = 0
      let wrong = 0
      let welds = 0
      let unlocked = 0
      const unlockedWhere: string[] = []
      for (const entry of truth.entries) {
        const result = mint(pick(entry))
        if (!result.speaks) continue
        speaking += 1
        placed += result.placed
        minted += result.pairs.length
        welds += result.scored
        if (entry.alignment.anchors.length < MIN_ALIGNED) {
          unlocked += 1
          unlockedWhere.push(`${entry.franchise} S${entry.seasonNumber} x ${entry.anilistId} (${entry.alignment.anchors.length} exact, ${result.anchors} anchors, ${result.placed} placed)`)
        }
        for (const pair of result.pairs) if (truthOf(entry, pair.fromNumber) !== pair.toNumber) wrong += 1
      }
      let negativeSpeaking = 0
      let negativePairs = 0
      for (const pairing of truth.negatives) {
        const result = mint(pick(pairing))
        if (!result.speaks) continue
        negativeSpeaking += 1
        negativePairs += result.pairs.length
      }
      let allSpeaking = 0
      let allUnlocked = 0
      const allUnlockedWhere: string[] = []
      const unlockedPairings: Pairing[] = []
      for (const pairing of truth.all) {
        const result = mint(pick(pairing))
        if (!result.speaks) continue
        allSpeaking += 1
        if (pairing.alignment.anchors.length < MIN_ALIGNED) {
          allUnlocked += 1
          unlockedPairings.push(pairing)
          allUnlockedWhere.push(`${pairing.franchise} S${pairing.seasonNumber} x ${pairing.anilistId} (${pairing.alignment.anchors.length} exact, ${result.anchors} anchors, ${result.placed} placed, ${result.pairs.length} minted)`)
        }
      }
      console.log(
        `\n${label}\n`
        + `  truth set (${truth.entries.length} pairings): speaks on ${speaking}, ${placed} rows placed by order, `
        + `${minted} pairs minted, ${wrong} WRONG, ${welds} welds, ${unlocked} pairings unlocked\n`
        + `  hard negatives (${truth.negatives.length}): speaks on ${negativeSpeaking}, ${negativePairs} wrong pairs minted\n`
        + `  whole cross product (${truth.all.length}): speaks on ${allSpeaking}, ${allUnlocked} of them the exact rule cannot bracket at all`
      )
      for (const line of unlockedWhere.slice(0, 10)) console.log(`      truth unlocked ${line}`)
      for (const line of allUnlockedWhere.slice(0, 10)) console.log(`      cross-product unlocked ${line}`)
      return { speaking, placed, minted, wrong, negativeSpeaking, negativePairs, allSpeaking, allUnlocked, unlockedPairings }
    }

    const exact = arm(pairing => pairing.alignment, 'EXACT ONLY (what runs at b7c021d)')
    const shipped = arm(pairing => pairing.shipped, `SHIPPED FALLBACK (Dice, floor ${SCORED_ANCHOR_FLOOR}, margin ${SCORED_ANCHOR_MARGIN})`)
    console.log(
      `\nDELTA, shipped fallback minus exact only: `
      + `${shipped.speaking - exact.speaking} truth pairings speaking, `
      + `${shipped.placed - exact.placed} rows placed, ${shipped.minted - exact.minted} pairs minted, `
      + `${shipped.wrong - exact.wrong} wrong pairs, `
      + `${shipped.allSpeaking - exact.allSpeaking} cross-product pairings speaking, `
      + `${shipped.negativePairs - exact.negativePairs} wrong pairs on the negatives`
    )
    // EVERY UNLOCKED PAIRING, IN FULL, IN FRONT OF THE ONE INDEPENDENT JUDGE IT CAN HAVE. These are
    // the whole of what the change buys, and the conservative closure refuses them all by
    // construction (it needs three exact anchors and they have 0 or 1), so no rate can speak for
    // them. `countsClose` is title-free and score-free arithmetic over the offset the welds produce,
    // which is the strongest thing available that the change cannot have caused.
    console.log(`\nEVERY PAIRING THE FALLBACK UNLOCKS (${shipped.unlockedPairings.length}), against the count-and-specials closure`)
    for (const pairing of shipped.unlockedPairings) {
      const result = mint(pairing.shipped)
      const offsets = [...new Set(pairing.shipped.anchors.map(anchor => anchor.to.number! - anchor.from.number!))]
      const closes = offsets.length === 1 ? countsClose(pairing, offsets[0]!) : { ok: false as const, reason: `welds disagree on the offset (${offsets.join(', ')})` }
      const klass = truth.negatives.some(negative => negative.netflixId === pairing.netflixId && negative.seasonNumber === pairing.seasonNumber && negative.anilistId === pairing.anilistId)
        ? 'CERTAINLY WRONG'
        : truth.entries.some(entry => entry.netflixId === pairing.netflixId && entry.seasonNumber === pairing.seasonNumber && entry.anilistId === pairing.anilistId)
          ? 'truth'
          : 'unjudged'
      console.log(
        `  ${klass} ${pairing.franchise} S${pairing.seasonNumber} (${pairing.theirs.length} rows) onto anilist ${pairing.anilistId} `
        + `"${pairing.runTitle}" (${pairing.shipped.canonical.length} numbered): ${result.anchors} anchors (${result.scored} welds) `
        + `at offset ${offsets.join('/')}, ${result.placed} placed, ${result.pairs.length} minted; `
        + `counts ${closes.ok ? `CLOSE (${closes.pairs} pairs, ${closes.insertions} insertions covered)` : `refuse: ${closes.reason}`}`
      )
      for (const pair of result.pairs.slice(0, 3)) {
        console.log(`      nf ${pair.fromNumber} "${titleOf(pair.from.uri)}" -> canonical ${pair.toNumber} "${titleOf(pair.to.uri)}"`)
      }
    }

    // the fallback is a FALLBACK: it may never take a pairing away from the exact rule
    expect(shipped.speaking).toBeGreaterThanOrEqual(exact.speaking)
    expect(shipped.minted).toBeGreaterThanOrEqual(exact.minted)
    // and the scorer is live rather than constant, or this whole test measures a dead function
    expect(titleDice('the black swordsman', 'the black swordsman')).toBe(1)
    expect(titleDice('the black swordsman', 'a man of many talents')).toBe(0)
  })

  /**
   * THE SAME GRID ON THE SCORER THAT SHIPS, which is the one measurement both calibrations skipped.
   *
   * The floor and the margin were fixed by the negative-side cliff, and that cliff was measured on
   * frizbee `titleSimilarity` while `plugin:range` ships token Dice. The bridge was the one table
   * computed on both scorers (the neighbour-collision hazard, whose curves coincide at 0.60), which
   * is an inference. Here the cliff itself is located on Dice: same truth set, same 68 hard
   * negatives, same 98 cells.
   */
  it('locates the cliff on token Dice, the scorer plugin:range ships', () => {
    const prepared: Prepared[] = entries.map(entry => ({
      entry,
      matrix: diceMatrix(entry),
      exactRows: new Set(entry.alignment.anchors.map(anchor => anchor.from.number!)),
    }))
    const negatives: PreparedNegative[] = truth.negatives.map(pairing => ({ pairing, matrix: diceMatrix(pairing) }))
    const truthPairs = entries.reduce((total, entry) => total + entry.pairs.size, 0)
    const novelPairs = entries.reduce((total, entry) => {
      const exact = new Set(entry.alignment.anchors.map(anchor => anchor.from.number!))
      return total + [...entry.pairs.keys()].filter(number => !exact.has(number)).length
    }, 0)

    const cells = new Map<string, Cell>()
    const negativeCells = new Map<string, NegativeCell>()
    for (const floor of FLOORS) {
      for (const margin of MARGINS) {
        cells.set(`${floor}|${margin}`, sweepCell(prepared, floor, margin))
        negativeCells.set(`${floor}|${margin}`, sweepNegativeCell(negatives, floor, margin))
      }
    }
    const cell = (floor: number, margin: number) => cells.get(`${floor}|${margin}`)!
    const negativeCell = (floor: number, margin: number) => negativeCells.get(`${floor}|${margin}`)!

    console.log('\nDICE: the scorer plugin:range ships, over the same populations')
    table('DICE, WRONG ANCHORS on the strong truth set', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).wrong))
    table('DICE, NOVEL ANCHOR RECALL of the truth pairs with no exact anchor', FLOORS, MARGINS,
      (floor, margin) => pct(cell(floor, margin).novelCorrect, novelPairs))
    table('DICE, HARD NEGATIVES: wrong pairings where rule 3 SPEAKS', FLOORS, MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).speaking))
    table('DICE, HARD NEGATIVES: wrong pairs minted', FLOORS, MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).placed))
    console.log(
      `\nDICE at the shipped cell ${SCORED_ANCHOR_FLOOR}/${SCORED_ANCHOR_MARGIN}: `
      + `${cell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).proposed} anchors proposed, `
      + `${cell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).wrong} wrong, `
      + `novel recall ${pct(cell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).novelCorrect, novelPairs)} of ${novelPairs}, `
      + `${negativeCell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).speaking} of ${truth.negatives.length} negatives speaking, `
      + `${negativeCell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).placed} wrong pairs`
    )
    for (const example of negativeCell(0.35, 0).examples.slice(0, 6)) console.log(`  dice 0.35/0.00 negative ${example}`)
    console.log(`  truth pairs ${truthPairs}, of which ${novelPairs} reached by no exact anchor`)

    // SEPARATION CONTROL, the same one the frizbee grid carries: a grid that does not separate its
    // arms is an inert scorer reporting success
    expect(cell(0.95, 0).proposed).toBeLessThan(cell(0.35, 0).proposed)
    expect(cell(0.40, 0.30).proposed).toBeLessThan(cell(0.40, 0).proposed)
    // and the negatives arm can express a weld, or "0 at the shipped cell" says nothing
    expect(negativeCell(0.35, 0).speaking).toBeGreaterThan(0)
    // the shipped cell is clean on the scorer that ships
    expect(cell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).wrong).toBe(0)
    expect(negativeCell(SCORED_ANCHOR_FLOOR, SCORED_ANCHOR_MARGIN).speaking).toBe(0)
  })

  it('sweeps the floor and the margin, and reports every failure at the recommendation', async () => {
    const prepare = async (pairings: readonly TruthEntry[]): Promise<Prepared[]> => {
      const prepared: Prepared[] = []
      for (const entry of pairings) {
        prepared.push({
          entry,
          matrix: await scoreMatrix(entry),
          exactRows: new Set(entry.alignment.anchors.map(anchor => anchor.from.number!)),
        })
      }
      return prepared
    }
    const prepared = await prepare(entries)
    const preparedWeak = await prepare(truth.weak)
    const preparedNegative: PreparedNegative[] = []
    for (const pairing of truth.negatives) preparedNegative.push({ pairing, matrix: await scoreMatrix(pairing) })

    const cells = new Map<string, Cell>()
    const weakCells = new Map<string, Cell>()
    const negativeCells = new Map<string, NegativeCell>()
    for (const floor of FLOORS) {
      for (const margin of MARGINS) {
        cells.set(`${floor}|${margin}`, sweepCell(prepared, floor, margin))
        weakCells.set(`${floor}|${margin}`, sweepCell(preparedWeak, floor, margin))
        negativeCells.set(`${floor}|${margin}`, sweepNegativeCell(preparedNegative, floor, margin))
      }
    }
    const cell = (floor: number, margin: number): Cell => cells.get(`${floor}|${margin}`)!
    const weakCell = (floor: number, margin: number): Cell => weakCells.get(`${floor}|${margin}`)!
    const negativeCell = (floor: number, margin: number): NegativeCell => negativeCells.get(`${floor}|${margin}`)!

    const truthPairs = entries.reduce((total, entry) => total + entry.pairs.size, 0)
    const exactAnchors = entries.reduce((total, entry) => total + entry.alignment.anchors.length, 0)
    const novelPairs = entries.reduce((total, entry) => {
      const exact = new Set(entry.alignment.anchors.map(anchor => anchor.from.number!))
      return total + [...entry.pairs.keys()].filter(number => !exact.has(number)).length
    }, 0)
    const weakPairs = truth.weak.reduce((total, entry) => total + entry.pairs.size, 0)

    // The EXACT-only baseline, which the change has to beat rather than merely differ from. Scored
    // through the same pipeline so the comparison is like for like: floor 1, margin 0.5 admits only
    // a pair that scores 1.0 against one slot and nothing close to it, which is exact equality.
    const baseline = sweepCell(prepared, 1, 0.5)
    const weakBaseline = sweepCell(preparedWeak, 1, 0.5)
    const negativeBaseline = sweepNegativeCell(preparedNegative, 1, 0.5)
    console.log(
      `\nEXACT BASELINE, strong tier: ${exactAnchors} anchors, ${baseline.proposed} proposed, ${baseline.wrong} wrong, `
      + `anchor recall ${pct(baseline.correct, truthPairs)}, ${baseline.seasonsSpeaking} of ${entries.length} pairings where rule 3 speaks, `
      + `${baseline.placed} rows placed by order (${baseline.placedWrong} wrong), `
      + `MINTED ${baseline.mintedCorrect} correct and ${baseline.mintedWrong} wrong`
    )
    console.log(
      `EXACT BASELINE, weak tier: ${weakBaseline.proposed} proposed, ${weakBaseline.wrong} wrong, `
      + `anchor recall ${pct(weakBaseline.correct, weakPairs)}, ${weakBaseline.seasonsSpeaking} of ${truth.weak.length} pairings speak, `
      + `${weakBaseline.placed} rows placed (${weakBaseline.placedWrong} wrong), `
      + `MINTED ${weakBaseline.mintedCorrect} correct and ${weakBaseline.mintedWrong} wrong`
    )
    console.log(
      `EXACT BASELINE, hard negatives: ${negativeBaseline.proposed} anchors proposed, `
      + `${negativeBaseline.speaking} of ${truth.negatives.length} wrong pairings where rule 3 speaks, `
      + `${negativeBaseline.placed} wrong pairs minted`
    )
    console.log(`TRUTH PAIRS: ${truthPairs} strong (of which ${novelPairs} have no exact anchor), ${weakPairs} weak`)

    // WHERE THE CURVE ACTUALLY SEPARATES, which is what a floor and a margin are chosen against.
    // Three populations, each scored with the same scorer: a TRUE pair that no exact anchor reached
    // (the retranslations the loosening is for), the best WRONG slot the same row reaches inside its
    // own run, and the best slot a row reaches on a pairing that is certainly wrong.
    const quantiles = (values: number[]): string => {
      if (!values.length) return 'none'
      const sorted = [...values].sort((a, b) => a - b)
      const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!.toFixed(3)
      return `n=${sorted.length} p05 ${at(0.05)} p25 ${at(0.25)} p50 ${at(0.5)} p75 ${at(0.75)} p95 ${at(0.95)}`
    }
    const trueScores: number[] = []
    const trueGaps: number[] = []
    const wrongSlotScores: number[] = []
    for (const { entry, matrix, exactRows } of prepared) {
      entry.theirs.forEach((row, index) => {
        if (!row.keys.length || exactRows.has(row.number!)) return
        const slot = entry.pairs.get(row.number!)
        const scores = matrix[index]!
        const trueIndex = entry.alignment.canonical.findIndex(candidate => candidate.number === slot)
        if (trueIndex >= 0) {
          trueScores.push(scores[trueIndex]!)
          const others = scores.filter((_, other) => other !== trueIndex)
          trueGaps.push(scores[trueIndex]! - (others.length ? Math.max(...others) : 0))
        }
        const wrong = scores.filter((_, other) => other !== trueIndex)
        if (wrong.length) wrongSlotScores.push(Math.max(...wrong))
      })
    }
    const negativeScores = preparedNegative.flatMap(({ matrix }) =>
      matrix.filter(scores => scores.length).map(scores => Math.max(...scores)))
    console.log('\nSEPARATION, the same scorer over three populations')
    console.log(`  true pair, no exact anchor:        ${quantiles(trueScores)}`)
    console.log(`  true pair minus its runner-up:     ${quantiles(trueGaps)}`)
    console.log(`  best WRONG slot in the right run:  ${quantiles(wrongSlotScores)}`)
    console.log(`  best slot on a wrong pairing:      ${quantiles(negativeScores)}`)

    table('ANCHOR RECALL, share of the strong truth pairs anchored', FLOORS, MARGINS,
      (floor, margin) => pct(cell(floor, margin).correct, truthPairs))
    table('WRONG ANCHORS, strong tier, after the claims and monotone filters', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).wrong))
    table('WRONG MATCHES the SCORE admitted, before those two filters', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).rawWrong))
    table('ANCHOR PRECISION, strong tier', FLOORS, MARGINS,
      (floor, margin) => pct(cell(floor, margin).correct, cell(floor, margin).proposed))
    table('NOVEL ANCHOR RECALL, of the strong truth pairs with no exact anchor', FLOORS, MARGINS,
      (floor, margin) => pct(cell(floor, margin).novelCorrect, novelPairs))
    table('NOVEL ANCHOR PRECISION, rows no exact anchor reached', FLOORS, MARGINS,
      (floor, margin) => pct(cell(floor, margin).novelCorrect, cell(floor, margin).novelProposed))
    table('WRONG PAIRS MINTED, strong tier, anchors plus the rows order placed', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).wrong + cell(floor, margin).placedWrong))
    table('PAIRS RULE 3 MINTS, strong tier, correct (gated: nothing unless order placed a row)', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).mintedCorrect))
    table('PAIRS RULE 3 MINTS, strong tier, WRONG', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).mintedWrong))
    table('PAIRINGS WHERE RULE 3 SPEAKS, strong tier', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).seasonsSpeaking))
    table('ROWS ORDER PLACED, strong tier, correct (rule 3\'s own contribution)', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).placedCorrect))
    table('ROWS ORDER PLACED, strong tier, WRONG', FLOORS, MARGINS,
      (floor, margin) => String(cell(floor, margin).placedWrong))

    table('WEAK TIER: wrong pairs minted', FLOORS, MARGINS,
      (floor, margin) => String(weakCell(floor, margin).mintedWrong))
    table('WEAK TIER: correct pairs minted', FLOORS, MARGINS,
      (floor, margin) => String(weakCell(floor, margin).mintedCorrect))
    table('WEAK TIER: wrong anchors proposed', FLOORS, MARGINS,
      (floor, margin) => String(weakCell(floor, margin).wrong))
    table('WEAK TIER: pairings where rule 3 speaks', FLOORS, MARGINS,
      (floor, margin) => String(weakCell(floor, margin).seasonsSpeaking))

    table('HARD NEGATIVES: wrong pairings where rule 3 SPEAKS', FLOORS, MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).speaking))
    table('HARD NEGATIVES: wrong pairs minted', FLOORS, MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).placed))
    table('HARD NEGATIVES: anchors proposed on a wrong pairing', FLOORS, MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).proposed))

    // Every wrong pair at a handful of candidate cells, named in full rather than rated. A rate
    // hides the one case that would put a wrong video behind a play button.
    const CANDIDATES = [
      [0.35, 0], [0.40, 0.05], [0.40, 0.15], [0.50, 0.05], [0.50, 0.15],
      [0.60, 0.10], [0.60, 0.15], [0.70, 0.15],
    ] as const
    for (const [floor, margin] of CANDIDATES) {
      const here = cell(floor, margin)
      const weakHere = weakCell(floor, margin)
      const negativeHere = negativeCell(floor, margin)
      console.log(
        `\nFAILURES at floor ${floor.toFixed(2)} margin ${margin.toFixed(2)}: `
        + `${here.failures.length} strong, ${weakHere.failures.length} weak, ${negativeHere.speaking} negative pairings speaking`
      )
      for (const failure of [...here.failures, ...weakHere.failures].slice(0, 40)) {
        console.log(
          `  ${failure.kind} ${failure.franchise} S${failure.seasonNumber}: nf ${failure.netflixNumber} `
          + `"${failure.netflixTitle}" -> canonical ${failure.canonicalNumber} "${failure.canonicalTitle}" `
          + `(truth ${failure.truth})`
        )
      }
      for (const example of negativeHere.examples.slice(0, 10)) console.log(`  negative ${example}`)
    }

    // SEPARATION CONTROL: a grid that does not separate its arms is an inert scorer reporting
    // success, so the tight cell must admit strictly fewer anchors than the loose one.
    expect(cell(0.95, 0).proposed).toBeLessThan(cell(0.35, 0).proposed)
    // and the margin has to bite as well, or the second constant is decoration
    expect(cell(0.40, 0.30).proposed).toBeLessThan(cell(0.40, 0).proposed)

    // TRUTH CONTROL: the same sweep against a shifted truth must collapse. A precision that cannot
    // go down is not measuring precision.
    const shifted = sweepCell(prepared, 0.50, 0.15, 1)
    console.log(
      `\nTRUTH CONTROL at 0.50/0.15 with truth shifted by +1: precision ${pct(shifted.correct, shifted.proposed)}, `
      + `${shifted.wrong} wrong anchors (the unshifted cell reports ${cell(0.50, 0.15).wrong})`
    )
    expect(shifted.correct / Math.max(1, shifted.proposed)).toBeLessThan(0.1)

    // WHERE A WELD WOULD ACTUALLY COME FROM: the plugin is asked about every candidate pairing, not
    // only the right one. At most one run per season is the season's own, so a pairing rule 3 speaks
    // on beyond that is a wrong pair minted on a wrong candidate.
    const truthKeys = new Set([...entries, ...truth.weak].map(entry => `${entry.netflixId}-${entry.seasonNumber}-${entry.anilistId}`))
    const negativeKeys = new Set(truth.negatives.map(pairing => `${pairing.netflixId}-${pairing.seasonNumber}-${pairing.anilistId}`))
    const preparedAll: { pairing: Pairing, matrix: number[][], klass: 'truth' | 'negative' | 'unknown' }[] = []
    for (const pairing of truth.all) {
      const key = `${pairing.netflixId}-${pairing.seasonNumber}-${pairing.anilistId}`
      preparedAll.push({
        pairing,
        matrix: await scoreMatrix(pairing),
        klass: truthKeys.has(key) ? 'truth' : negativeKeys.has(key) ? 'negative' : 'unknown',
      })
    }
    console.log(`\nWHOLE CROSS PRODUCT: ${preparedAll.length} pairings (${truthKeys.size} truth, ${negativeKeys.size} certainly wrong, the rest unjudged)`)
    for (const [floor, margin, fallback] of [
      // the baseline row reads the SHIPPED anchors rather than the score at an exact cell, so the
      // comparison is against what runs today and not against an emulation of it
      [1, 0.5, true] as const,
      ...CANDIDATES.map(([floor, margin]) => [floor, margin, false] as const),
      // THE FALLBACK VARIANT: the exact anchors when there are enough of them to bracket with, and
      // the scored ones only where the exact rule cannot speak at all. It cannot change any pairing
      // the exact rule already handles, so it keeps the baseline's yield by construction.
      [0.60, 0.15, true] as const,
      [0.50, 0.15, true] as const,
    ]) {
      const speaking = { truth: 0, negative: 0, unknown: 0 }
      const examples: string[] = []
      const unlocked: string[] = []
      for (const { pairing, matrix, klass } of preparedAll) {
        const exact = pairing.alignment.anchors
        const anchors = fallback && exact.length >= MIN_ALIGNED ? exact : anchorsFrom(pairing, matrix, floor, margin)
        if (anchors.length < MIN_ALIGNED) continue
        const alignment = asAlignment(pairing, anchors)
        const bracket = forcedByBracket(alignment)
        const closure = closeWithSpecials({ alignment, unequal: bracket.unequal })
        if (!bracket.pairs.length && !closure.pairs.length) continue
        speaking[klass] += 1
        // the pairings the change UNLOCKS: the exact rule cannot bracket at all there, so rule 3 is
        // silent today whatever the titles say
        if (exact.length < MIN_ALIGNED) {
          unlocked.push(`${klass} ${pairing.franchise} S${pairing.seasonNumber} onto anilist ${pairing.anilistId} (${pairing.runTitle}): ${exact.length} exact, ${anchors.length} scored anchors, ${bracket.pairs.length + closure.pairs.length} placed`)
        }
        if (klass !== 'truth' && examples.length < 6) {
          examples.push(`${klass} ${pairing.franchise} S${pairing.seasonNumber} onto anilist ${pairing.anilistId} (${pairing.runTitle}): ${anchors.length} anchors, ${bracket.pairs.length + closure.pairs.length} placed`)
        }
      }
      const label = floor === 1
        ? 'exact baseline'
        : `${fallback ? 'FALLBACK at ' : ''}floor ${floor.toFixed(2)} margin ${margin.toFixed(2)}`
      console.log(
        `  ${label}: speaks on ${speaking.truth} truth, ${speaking.negative} certainly wrong, `
        + `${speaking.unknown} unjudged; ${unlocked.length} of them the exact rule cannot bracket at all`
      )
      for (const line of unlocked.slice(0, 8)) console.log(`      unlocked ${line}`)
      for (const example of examples.slice(0, 4)) console.log(`      ${example}`)
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(
      resolve(OUT_DIR, 'episode-anchor-grid.json'),
      JSON.stringify({
        corpus: corpus.fetched,
        truth: [...entries, ...truth.weak].map(entry => ({
          tier: entry.tier,
          franchise: entry.franchise,
          seasonNumber: entry.seasonNumber,
          anilistId: entry.anilistId,
          offset: entry.offset,
          rows: entry.theirs.length,
          pairs: entry.pairs.size,
          insertions: entry.insertions,
          exactAnchors: entry.exactAnchors,
          how: entry.how,
        })),
        negatives: truth.negatives.map(pairing => `${pairing.franchise} S${pairing.seasonNumber} x ${pairing.anilistId}`),
        truthPairs,
        novelPairs,
        weakPairs,
        baseline,
        weakBaseline,
        negativeBaseline,
        cells: [...cells.entries()].map(([key, value]) => ({ key, ...value })),
        weakCells: [...weakCells.entries()].map(([key, value]) => ({ key, ...value })),
        negativeCells: [...negativeCells.entries()].map(([key, value]) => ({ key, ...value })),
      }, null, 2)
    )
    console.log(`\ngrid -> ${resolve(OUT_DIR, 'episode-anchor-grid.json')}`)
  })

  /* ---------------------------------------------------------------------------------------------
   * The SYNOPSIS axis
   * ------------------------------------------------------------------------------------------- */

  /**
   * TWO ARMS, and they answer two different questions.
   *
   * MARGINAL is the shipped shape: the synopsis is offered only the rows and numbers the exact and
   * scored title tests did not take, which is what `alignByTitle` hands it. It measures what this
   * source ADDS, and on a truth set built from exact title anchors that is a thin population by
   * construction, since a season whose titles match is a season the synopsis is not needed on.
   *
   * STANDALONE hands it nothing and asks it to align the two lists by itself. It measures whether
   * the rule LANDS ON THE RIGHT EPISODE, over every truth pair rather than the leftovers, and it is
   * the arm a precision figure should be read off. It is also the arm the hard negatives are run in,
   * because a negative's title anchors are what a wrong pairing does not have.
   */
  const preparedSynopsis = (standalone: boolean): PreparedSynopsis[] => entries.map(entry => ({
    entry,
    taken: standalone ? [] : takenBy(entry),
    exactRows: new Set(entry.alignment.anchors.map(anchor => anchor.from.number!)),
  }))

  const preparedSynopsisNegatives = (standalone: boolean): { pairing: Pairing, taken: Anchor[] }[] =>
    truth.negatives.map(pairing => ({ pairing, taken: standalone ? [] : takenBy(pairing) }))

  /**
   * A THIRD negative population: one show's Netflix season against another SHOW's run entirely.
   *
   * Easier than the same-show negative and much larger, which is the point of having both: the
   * same-show one is the shape that welds, and this one is the volume that makes "0 fired" mean
   * something. Runs are picked by three fixed strides through the show list, so which pairings enter
   * depends on the corpus order and never on how any of them scored.
   */
  const crossShowNegatives = (): Pairing[] => {
    const shows = corpus.shows.filter(show => show.runs.length)
    const built: Pairing[] = []
    for (const entry of entries) {
      const home = shows.findIndex(show => show.netflixId === entry.netflixId)
      const season = shows[home]?.seasons.find(item => item.seasonNumber === entry.seasonNumber)
      if (home < 0 || !season) continue
      for (const stride of [1, 7, 13]) {
        const other = shows[(home + stride) % shows.length]!
        if (other.netflixId === entry.netflixId) continue
        const run = other.runs[0]
        if (run) built.push(makePairing(shows[home]!, season, run))
      }
    }
    return built
  }

  it('control: the synopsis column is real on both sides, and reproduces the shipped nf source', () => {
    const theirs = entries.flatMap(entry => entry.theirs).filter(row => row.synopsis.length).length
    const theirRows = entries.reduce((total, entry) => total + entry.theirs.length, 0)
    const ours = entries.flatMap(entry => entry.alignment.canonical.flatMap(slot => slot.rows))
      .filter(row => row.synopsis.length).length
    const ourRows = entries.reduce((total, entry) => total + entry.alignment.canonical.reduce((sum, slot) => sum + slot.rows.length, 0), 0)
    console.log(
      `\nSYNOPSIS COLUMN on the truth set: ${theirs} of ${theirRows} Netflix rows, `
      + `${ours} of ${ourRows} reference rows`
    )
    // A rate over an empty column is the failure this whole section exists to close, so it is an
    // assertion rather than a line in a log
    expect(theirs).toBeGreaterThan(200)
    expect(ours).toBeGreaterThan(200)

    // AND THE TEXT IS THE ONE THE APP READS. `MUSHOKU_SYNOPSES.theirs` was recorded through the
    // shipped `fetchNetflixSeasonEpisodes` (`src/sources/unogs/netflix.ts`); the corpus fetches the
    // same query itself, so this is the corpus producer checked against the source it restates. It
    // is also why the corpus does not use unOGS's own `synopsis` field, which disagrees on 55 of
    // these 61 rows.
    const mushoku = corpus.shows.find(show => show.franchise === 'Mushoku Tensei')
    expect(mushoku, 'the corpus carries Mushoku Tensei').toBeTruthy()
    const recorded = [MUSHOKU_SYNOPSES.s1.theirs, MUSHOKU_SYNOPSES.s2.theirs, MUSHOKU_SYNOPSES.s3.theirs]
    recorded.forEach((season, index) => {
      const rows = mushoku!.seasons.find(entry => entry.seasonNumber === index + 1)?.rows ?? []
      expect(rows.map(row => synopsisKeyOf(row.synopsis ?? ''))).toEqual(season.map(key => synopsisKeyOf(key)))
    })
  })

  it('control: the synopsis sweep separates, and can express a wrong anchor', () => {
    const prepared = preparedSynopsis(true)
    // SEPARATION. A dead scorer, an empty column or a gate that admits nothing produces one number
    // at every cell, and a grid like that reports whatever it is asked to report.
    const loose = sweepSynopsisCell(prepared, 0.10, 0, MIN_CONSENSUS_GAP)
    const tight = sweepSynopsisCell(prepared, 0.90, 0.30, MIN_CONSENSUS_GAP)
    console.log(`\nSEPARATION: floor 0.10 margin 0 proposes ${loose.proposed}, floor 0.90 margin 0.30 proposes ${tight.proposed}`)
    expect(loose.proposed).toBeGreaterThan(tight.proposed)
    expect(tight.proposed).toBeLessThan(loose.proposed / 2)

    // TRUTH CONTROL. The same cell against a truth shifted by one must be almost entirely wrong. A
    // metric that reports the same precision under a deliberately wrong truth is not measuring
    // precision, and every figure in the grid below would be decoration.
    const shipped = sweepSynopsisCell(prepared, SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN, MIN_CONSENSUS_GAP)
    const shifted = sweepSynopsisCell(prepared, SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN, MIN_CONSENSUS_GAP, 1)
    console.log(
      `TRUTH CONTROL: the shipped cell keeps ${shipped.kept} anchors, ${shipped.correct} correct; `
      + `against a truth shifted by one, ${shifted.correct} correct of the same ${shifted.kept}`
    )
    expect(shipped.kept).toBeGreaterThan(200)
    expect(shipped.correct).toBeGreaterThan(shifted.correct * 10)

    // THE KNOBS ARE WIRED. The cell at the shipped constants must be what the shipped call with no
    // options answers, or the grid is measuring a function nobody runs.
    for (const { entry, taken } of prepared.slice(0, 40)) {
      const options = { ordered: entry.theirs, canonical: entry.alignment.canonical, taken, anchors: taken.filter(anchor => !anchor.scored) }
      const byDefault = synopsisAnchors(options)
      const byKnob = synopsisAnchors({ ...options, floor: SYNOPSIS_ANCHOR_FLOOR, margin: SYNOPSIS_ANCHOR_MARGIN, gap: MIN_CONSENSUS_GAP })
      expect(byKnob.anchors.map(anchor => `${anchor.fromIndex}->${anchor.toIndex}`))
        .toEqual(byDefault.anchors.map(anchor => `${anchor.fromIndex}->${anchor.toIndex}`))
    }
  })

  it('sweeps the synopsis floor, the margin and the consensus gap, with hard negatives', () => {
    const prepared = preparedSynopsis(true)
    const marginal = preparedSynopsis(false)
    const negatives = preparedSynopsisNegatives(true)
    const cross = crossShowNegatives().map(pairing => ({ pairing, taken: [] as Anchor[] }))

    // The recall denominator, in the arm it is read in. STANDALONE: every row with a synopsis whose
    // truth is a real pair, since the source is being asked to align the lists by itself. MARGINAL:
    // the same, less the rows an exact anchor already reached, because a row the exact rule anchors
    // is not something this source needs to find.
    const reachableIn = (population: readonly PreparedSynopsis[], skipExact: boolean): number =>
      population.reduce((total, { entry, exactRows }) => total + entry.theirs.filter(row =>
        row.synopsis.length
        && typeof truthOf(entry, row.number!) === 'number'
        && !(skipExact && exactRows.has(row.number!))
      ).length, 0)
    const reachable = reachableIn(prepared, false)
    const reachableMarginal = reachableIn(marginal, true)

    const cells = new Map<string, SynopsisCell>()
    const marginalCells = new Map<string, SynopsisCell>()
    const negativeCells = new Map<string, SynopsisNegativeCell>()
    const crossCells = new Map<string, SynopsisNegativeCell>()
    for (const floor of SYNOPSIS_FLOORS) {
      for (const margin of SYNOPSIS_MARGINS) {
        cells.set(`${floor}|${margin}`, sweepSynopsisCell(prepared, floor, margin, MIN_CONSENSUS_GAP))
        marginalCells.set(`${floor}|${margin}`, sweepSynopsisCell(marginal, floor, margin, MIN_CONSENSUS_GAP))
        negativeCells.set(`${floor}|${margin}`, sweepSynopsisNegativeCell(negatives, floor, margin, MIN_CONSENSUS_GAP))
        crossCells.set(`${floor}|${margin}`, sweepSynopsisNegativeCell(cross, floor, margin, MIN_CONSENSUS_GAP))
      }
    }
    const cell = (floor: number, margin: number): SynopsisCell => cells.get(`${floor}|${margin}`)!
    const marginalCell = (floor: number, margin: number): SynopsisCell => marginalCells.get(`${floor}|${margin}`)!
    const negativeCell = (floor: number, margin: number): SynopsisNegativeCell => negativeCells.get(`${floor}|${margin}`)!
    const crossCell = (floor: number, margin: number): SynopsisNegativeCell => crossCells.get(`${floor}|${margin}`)!

    console.log(
      `\nSYNOPSIS POPULATION: ${prepared.length} truth pairings, `
      + `${negatives.length} same-show hard negatives, ${cross.length} cross-show negatives, `
      + `${reachable} true pairs a synopsis anchor could reach standalone (${reachableMarginal} that no exact anchor reaches)`
    )
    table('STANDALONE: anchors KEPT after the consensus gate', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => String(cell(floor, margin).kept))
    table('STANDALONE: anchor PRECISION (correct of kept)', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => pct(cell(floor, margin).correct, cell(floor, margin).kept))
    table('STANDALONE: anchor RECALL (correct of reachable)', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => pct(cell(floor, margin).correct, reachable))
    table('STANDALONE: anchors WRONG after the gate', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => String(cell(floor, margin).wrong))
    table('STANDALONE: anchors WRONG before the gate', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => String(cell(floor, margin).proposedWrong))
    table('STANDALONE: rows placed by ORDER, wrong ones', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => `${cell(floor, margin).placed}/${cell(floor, margin).placedWrong}`)
    table('MARGINAL (the shipped shape): kept, wrong', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => `${marginalCell(floor, margin).kept}/${marginalCell(floor, margin).wrong}`)
    table('MARGINAL: recall over rows no exact anchor reaches', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => pct(marginalCell(floor, margin).correct, reachableMarginal))
    table('SAME-SHOW NEGATIVES where the consensus FIRES', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => `${negativeCell(floor, margin).fired}/${negatives.length}`)
    table('SAME-SHOW NEGATIVE pairs minted', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => String(negativeCell(floor, margin).placed))
    table('CROSS-SHOW NEGATIVES where the consensus FIRES', SYNOPSIS_FLOORS, SYNOPSIS_MARGINS,
      (floor, margin) => `${crossCell(floor, margin).fired}/${cross.length}`)

    // THE GAP, which is the 2a fix: the winning offset must outnumber the runner-up by this much.
    // Gap 0 is the shipped rule before this change, a bare majority and nothing else.
    console.log(`\nCONSENSUS GAP at floor ${SYNOPSIS_ANCHOR_FLOOR} margin ${SYNOPSIS_ANCHOR_MARGIN}, STANDALONE arm:`)
    console.log('  gap  speaking     kept  correct    wrong  same-show fired  cross-show fired')
    const gapCells = new Map<number, SynopsisCell>()
    for (const gap of CONSENSUS_GAPS) {
      const at = sweepSynopsisCell(prepared, SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN, gap)
      const against = sweepSynopsisNegativeCell(negatives, SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN, gap)
      const far = sweepSynopsisNegativeCell(cross, SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN, gap)
      gapCells.set(gap, at)
      console.log(
        `  ${String(gap).padStart(3)}${String(at.speaking).padStart(10)}${String(at.kept).padStart(9)}`
        + `${String(at.correct).padStart(9)}${String(at.wrong).padStart(9)}`
        + `  ${String(`${against.fired} of ${negatives.length}`).padStart(14)}`
        + `  ${String(`${far.fired} of ${cross.length}`).padStart(15)}`
      )
    }

    // AND THE GAP AT THE LOOSEST CELL, which is where a wrong anchor survives the gate at all. If a
    // larger gap cannot remove those either, then the gap is insurance against a shape this corpus
    // does not contain rather than a fix for one it does, and saying so is the point of the table.
    console.log(`\nCONSENSUS GAP at floor 0.10 margin 0.00, the loosest cell, STANDALONE arm:`)
    console.log('  gap  speaking     kept  correct    wrong')
    for (const gap of CONSENSUS_GAPS) {
      const at = sweepSynopsisCell(prepared, 0.10, 0, gap)
      console.log(
        `  ${String(gap).padStart(3)}${String(at.speaking).padStart(10)}${String(at.kept).padStart(9)}`
        + `${String(at.correct).padStart(9)}${String(at.wrong).padStart(9)}`
      )
    }

    // HOW CONTESTED THE MAJORITIES ACTUALLY ARE. The gap is a claim about the vote's shape, so the
    // shape is counted rather than argued: every pairing where a consensus was taken, by how far the
    // winning offset beat the runner-up. A distribution whose minimum is already above the constant
    // says the constant is free on this corpus, which is a different claim from it being useless.
    const gaps = new Map<number, number>()
    for (const { entry, taken } of prepared) {
      const found = synopsisAnchors({
        ordered: entry.theirs,
        canonical: entry.alignment.canonical,
        taken,
        anchors: [],
        floor: SYNOPSIS_ANCHOR_FLOOR,
        margin: SYNOPSIS_ANCHOR_MARGIN,
        gap: 0,
      })
      if (!found.anchors.length) continue
      const votes = new Map<number, number>()
      for (const anchor of found.proposed) {
        const offset = anchor.to.number! - anchor.from.number!
        votes.set(offset, (votes.get(offset) ?? 0) + 1)
      }
      const ranked = [...votes.values()].sort((a, b) => b - a)
      const distance = ranked[0]! - (ranked[1] ?? 0)
      gaps.set(distance, (gaps.get(distance) ?? 0) + 1)
    }
    console.log(
      `\nVOTE SHAPE at the shipped cell: ${[...gaps.entries()].sort((a, b) => a[0] - b[0])
        .map(([distance, count]) => `${count} pairings win by ${distance}`).join(', ')}`
    )

    const shipped = cell(SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN)
    const shippedMarginal = marginalCell(SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN)
    const shippedNegative = negativeCell(SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN)
    const shippedCross = crossCell(SYNOPSIS_ANCHOR_FLOOR, SYNOPSIS_ANCHOR_MARGIN)
    console.log(
      `\nAT THE SHIPPED CELL (floor ${SYNOPSIS_ANCHOR_FLOOR}, margin ${SYNOPSIS_ANCHOR_MARGIN}, gap ${MIN_CONSENSUS_GAP}, `
      + `min ${MIN_CONSENSUS_ANCHORS}), STANDALONE: ${shipped.proposed} proposed of which ${shipped.proposedWrong} wrong, `
      + `${shipped.kept} kept of which ${shipped.wrong} wrong, precision ${pct(shipped.correct, shipped.kept)}, `
      + `recall ${pct(shipped.correct, reachable)}, ${shipped.speaking} of ${prepared.length} pairings speak, `
      + `${shipped.placed} rows placed by order (${shipped.placedWrong} wrong), `
      + `${shippedNegative.fired} of ${negatives.length} same-show and ${shippedCross.fired} of ${cross.length} cross-show negatives fire`
    )
    console.log(
      `AT THE SHIPPED CELL, MARGINAL: ${shippedMarginal.kept} kept of which ${shippedMarginal.wrong} wrong, `
      + `precision ${pct(shippedMarginal.correct, shippedMarginal.kept)}, recall ${pct(shippedMarginal.correct, reachableMarginal)}, `
      + `${shippedMarginal.speaking} of ${marginal.length} pairings speak, `
      + `${shippedMarginal.placed} rows placed by order (${shippedMarginal.placedWrong} wrong)`
    )
    for (const failure of shipped.failures.slice(0, 12)) {
      console.log(
        `  WRONG (${failure.kind}) ${failure.franchise} S${failure.seasonNumber} nf ${failure.netflixNumber} `
        + `"${failure.netflixTitle}" -> canonical ${failure.canonicalNumber} "${failure.canonicalTitle}", truth ${failure.truth}`
      )
    }
    for (const example of shippedNegative.examples.slice(0, 6)) console.log(`  NEGATIVE FIRED ${example}`)

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(
      resolve(OUT_DIR, 'synopsis-anchor-grid.json'),
      JSON.stringify({
        corpus: corpus.fetched,
        pairings: prepared.length,
        negatives: negatives.length,
        crossNegatives: cross.length,
        reachable,
        reachableMarginal,
        shipped: { floor: SYNOPSIS_ANCHOR_FLOOR, margin: SYNOPSIS_ANCHOR_MARGIN, gap: MIN_CONSENSUS_GAP, min: MIN_CONSENSUS_ANCHORS },
        cells: [...cells.entries()].map(([key, value]) => ({ key, ...value })),
        marginalCells: [...marginalCells.entries()].map(([key, value]) => ({ key, ...value })),
        negativeCells: [...negativeCells.entries()].map(([key, value]) => ({ key, ...value })),
        crossCells: [...crossCells.entries()].map(([key, value]) => ({ key, ...value })),
        gapCells: [...gapCells.entries()].map(([gap, value]) => ({ ...value, gap })),
      }, null, 2)
    )
    console.log(`\nsynopsis grid -> ${resolve(OUT_DIR, 'synopsis-anchor-grid.json')}`)
  })
})
