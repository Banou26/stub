/**
 * The CORPUS axis of the rule 3 anchor proposal: does loosening the anchor test from exact stripped
 * equality to a SCORED similarity with a margin INVENT anchors between sources that already work?
 *
 * WHAT IS BEING CALIBRATED. `plugin:range` rule 3 (`src/worker/graph/plugins/range.ts`,
 * `docs/.../representation.md` P4 rule 3 and 3.4a) pairs episodes across two sources by SEQUENCE:
 * exact stripped title equality gives ANCHORS, a monotone alignment keeps them order preserving, and
 * a row between two anchors with an equal gap on both sides is then FORCED by order with no title
 * evidence consulted for it. The proposal is to admit an anchor on a score with a margin instead.
 * The placement stays order-driven either way, which is the safety argument; this file measures the
 * one thing that argument does not cover, which is whether the looser ANCHOR test lands on the wrong
 * row on sources that never retranslated anything.
 *
 * WHY THE CORPUS IS THE GROUND TRUTH HERE. `tests/corpus/cases/*.json` carry hand decided
 * `expect.episodePairs` and `expect.episodeApart`: two episode uris that are one broadcast episode,
 * and two that are not. They were decided from real recorded answers by a person or a labelling pass
 * that was then refuted and reviewed, never by running an implementation (`tests/corpus/README.md`),
 * so they are the only episode level truth in the repo. This file never writes them and never reads
 * an expectation out of the plugin.
 *
 * HOW TO RUN IT, and the three traps the sibling harness already recorded:
 *
 *   ./node_modules/.bin/vitest run --config vitest.calibration.config.ts \
 *     scripts/calibrate-anchor-corpus.test.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: without it vitest swallows console output, the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no
 * measurement. `npx vitest` fails on this machine with EBADDEVENGINES, so call the binary directly.
 * `setupFiles` in that config seeds sacha's wasm, which this file needs because it imports
 * `src/sources/utils.ts` for `titleSimilarity`.
 *
 * WHAT CONTROLS IT, because a false anchor count of zero is first a claim about the counter:
 *
 *   1. the EXACT arm here reproduces the shipped `alignByTitle` anchors, anchor for anchor, on every
 *      list pair measured. The two arms then differ only in the admit function, so a difference in
 *      the numbers is the scored test and not a reimplementation drifting.
 *   2. the contradiction detector is driven with a DELIBERATELY WRONG anchor set (every anchor
 *      shifted by one row) and must report contradictions. A detector that cannot express a
 *      contradiction reports zero of them unconditionally.
 *   3. the scorers are live: an identical key pair reaches 1.0, an unrelated pair stays low, and the
 *      sweep SEPARATES (the loosest cell proposes strictly more anchors than exact equality). A
 *      scorer stuck at a constant fails all three.
 *   4. the adjacent hazard scan is paired with a synthetic list whose neighbours are near duplicates,
 *      which must report a hit at every floor, so a hazard of zero on the real page is readable.
 *
 * THE CONTROLS ARE CALIBRATED BY MUTATION, not by argument. Eight mutations, each applied alone and
 * restored byte for byte, and the control each one reddens:
 *
 *   M1 the ambiguity refusal removed (`reached.size !== 1` to `< 1`)   the synthetic rule control
 *   M2 `judge` can never contradict                                    the contradiction detector
 *   M3 `tokenDice` stuck at a constant 1.0                             three: live scorer, collapse, separation
 *   M4 `bestBetween` blind across two rows                             the near duplicate hazard control
 *   M5 the one-claim-per-slot rule removed (`=== 1` to `>= 1`)         the synthetic rule control
 *   M6 `judge` always agrees                                           the contradiction detector
 *   M7 the measured population emptied                                 four, including the exact baseline
 *   M8 the comparison against `alignByTitle` deleted                   NOTHING, and it cannot: that
 *      assertion is itself the control, so it has no second line of defence. Stated rather than hidden.
 *
 * M1 and M5 REDDENED NOTHING in the first battery, which is what the synthetic control above exists
 * for: the exact arm never hits either rule on the corpus population, so a comparison against the
 * shipped function could not see them being broken while both are load bearing in the scored arm.
 *
 * AND THE FIRST BATTERY WAS ITSELF INVALID, which is worth more than the battery. It ran with
 * `--reporter=basic`, which this vitest cannot load (`Failed to load custom Reporter from basic`), so
 * every run exited 1 before a test executed and all five mutations read as RED. A battery that
 * reports red unconditionally is the same failure as a check that reports green unconditionally: the
 * unmutated file must be run through the same command first, and it must be GREEN.
 *
 * WHAT IT DOES NOT COVER, stated because a gap nobody writes down reads as coverage:
 *
 *   - the labels span NO retranslating origin on the pairing side. Every `episodePairs` entry is
 *     among anizip, cr, jw and kitsu; Netflix appears only in `episodeApart`, in the one case whose
 *     episode rows carry no titles at all (8.3, placeholder uris), so the Netflix unit here proposes
 *     nothing under any anchor test. This file therefore cannot say whether a scored anchor finds the
 *     truth on Netflix, which is the live sweep's axis, and the live sweep cannot say what this one
 *     says. The two halves are separate measurements and neither substitutes for the other.
 *   - the reference side here is ONE media's episode list, where the plugin hands rule 3 the whole
 *     run cluster's rows grouped by number. Unioning a cluster both adds keys and can drop a key that
 *     then reaches two numbers, so this is not a bound in either direction; it is the unit the labels
 *     are written in, and the cluster variant is a separate measurement.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { alignByTitle, MIN_ALIGNED, pairsBySequence } from '../src/worker/graph/plugins/range'
import type { Anchor, SideEpisode } from '../src/worker/graph/plugins/range'
import { isGenericEpisodeTitle } from '../src/sources/similar'
import { stripTitle, titleSimilarity } from '../src/sources/utils'
import { titleKeysOf } from '../src/worker/graph/plugins/profile'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CASES_DIR = process.env.ANCHOR_CASES ?? resolve(ROOT, 'tests/corpus/cases')
const ANSWERS_PATH = process.env.ANCHOR_ANSWERS ?? resolve(ROOT, 'corpus/season/summer-2026/answers.jsonl')
const OUT_DIR = process.env.ANCHOR_OUT ?? resolve(ROOT, 'node_modules/.cache/anchor-corpus')

/* ------------------------------------------------------------------------------------------------
 * The grid
 * ---------------------------------------------------------------------------------------------- */

/**
 * Score floors swept. 0.34 is the floor the owner's hand measurement used on Mushoku Tensei and 1.0
 * is the degenerate top of the range, where a scored test admits exactly the token sets that are
 * equal and the arm should collapse onto exact equality plus word reorderings.
 */
export const FLOORS = [0.2, 0.25, 0.3, 0.34, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1] as const

/**
 * Margins swept: how far the best scoring reference slot must beat the runner up slot before the row
 * may anchor. 0 is no margin, which is the arm the hand measurement found put a Mushoku season 3 row
 * on the wrong neighbour, and 0.15 is the value it found refused that row.
 */
export const MARGINS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] as const

/* ------------------------------------------------------------------------------------------------
 * Corpus
 * ---------------------------------------------------------------------------------------------- */

type CaseTitle = { language: string, title: string, score?: number | null }
type CaseEpisode = {
  uri: string
  origin: string
  mediaUri: string
  episodeNumber: number
  releaseDate?: string | null
  titles: CaseTitle[]
}
type CaseFile = {
  name: string
  rows: { uri: string, origin: string, scope?: 'RUN' | 'CONTAINER' }[]
  episodes?: CaseEpisode[]
  expect: {
    episodePairs?: { a: string, b: string }[]
    episodeApart?: { a: string, b: string }[]
    includes?: { container: string, run: string, range?: { fromStart: number, fromEnd: number, toStart: number, toEnd: number } }[]
  }
}

/** One case file, with its slug, exactly as it sits on disk. */
type LoadedCase = { slug: string, file: CaseFile }

// A missing or truncated corpus must never read as "nothing to measure": that is the exact shape of a
// rig that reports success unconditionally.
const loadCases = (): LoadedCase[] => {
  if (!existsSync(CASES_DIR)) throw new Error(`no corpus cases at ${CASES_DIR}`)
  const cases = readdirSync(CASES_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => ({ slug: name.replace(/\.json$/, ''), file: JSON.parse(readFileSync(resolve(CASES_DIR, name), 'utf8')) as CaseFile }))
  if (cases.length < 200) throw new Error(`${CASES_DIR} holds ${cases.length} cases, expected 200 or more`)
  const labelled = cases.filter(entry => (entry.file.expect.episodePairs ?? []).length > 0)
  if (labelled.length < 20) {
    throw new Error(`only ${labelled.length} cases carry a non-empty episodePairs, expected 20 or more`)
  }
  return cases
}

/* ------------------------------------------------------------------------------------------------
 * The two sides rule 3 reads, built the way plugin:profile builds them
 * ---------------------------------------------------------------------------------------------- */

const DAY_MS = 86_400_000

/**
 * One corpus episode as a `SideEpisode`.
 *
 * `keys` is `titleKeysOf` with the generic titles dropped, which is `episodeProfileRow`'s own line
 * (`profile.ts:536`), so the keys rule 3 sees here are the keys it sees in the graph. `day` is not
 * read by rule 3 at all (rule 1 owns the date axis) and is filled only so the shape is honest.
 */
const sideOf = (episode: CaseEpisode): SideEpisode => ({
  uri: episode.uri,
  origin: episode.origin,
  number: Number.isFinite(episode.episodeNumber) ? episode.episodeNumber : null,
  day: episode.releaseDate ? Math.floor(Date.parse(episode.releaseDate) / DAY_MS) : null,
  keys: titleKeysOf(episode.titles).map(entry => entry.key).filter(key => !isGenericEpisodeTitle(key)),
  hung: episode.mediaUri,
})

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byUri = (a: SideEpisode, b: SideEpisode): number => compare(a.uri, b.uri)

/** The anchor keys of one row: stripped, deduplicated, non generic, ordered. `anchorKeysOf`'s mirror. */
const anchorKeys = (episode: SideEpisode): string[] =>
  [...new Set(episode.keys.map(stripTitle).filter(Boolean))].sort(compare).filter(key => !isGenericEpisodeTitle(key))

/** One episode of the reference side as rule 3 counts it: a number and every reference row carrying it. */
type Slot = { number: number, rows: SideEpisode[] }

/** The two ordered lists rule 3 reads, built the way `alignByTitle` builds them. */
type Sides = { theirs: SideEpisode[], canonical: Slot[] }

const sidesOf = (reference: readonly SideEpisode[], theirs: readonly SideEpisode[]): Sides => {
  const ordered = [...theirs]
    .filter(episode => episode.number !== null)
    .sort((a, b) => a.number! - b.number! || compare(a.uri, b.uri))
  const byNumber = new Map<number, SideEpisode[]>()
  for (const row of [...reference].sort(byUri)) {
    if (row.number === null) continue
    byNumber.set(row.number, [...byNumber.get(row.number) ?? [], row])
  }
  const canonical: Slot[] = [...byNumber.keys()].sort((a, b) => a - b).map(number => ({ number, rows: byNumber.get(number)! }))
  return { theirs: ordered, canonical }
}

/* ------------------------------------------------------------------------------------------------
 * The anchor engine: one skeleton, two admit functions
 * ---------------------------------------------------------------------------------------------- */

/** What an admit function answers for one of their rows: the reference slot it anchors onto, or null. */
type Admitted = { toIndex: number, to: SideEpisode, key: string, best: number, second: number }

/** Decides whether one of their rows anchors, and onto which reference slot. */
type Admit = (row: SideEpisode, fromIndex: number) => Admitted | null

/** One anchor, plus the two scores the scored arm decided it on (both 1 and 0 for the exact arm). */
type ScoredAnchor = Anchor & { best: number, second: number }

// mirror of longestMonotone, range.ts:376. Patience by binary search over the matches in THEIR order,
// reconstructed through parent pointers, so a crossing match is dropped rather than allowed to bend
// the alignment around it.
const longestMonotone = (matches: readonly ScoredAnchor[]): ScoredAnchor[] => {
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
  const anchors: ScoredAnchor[] = []
  for (let index = tails.length ? tails[tails.length - 1]! : -1; index >= 0; index = parent[index]!) {
    anchors.push(matches[index]!)
  }
  return anchors.reverse()
}

/**
 * The part of rule 3 that is the same under either anchor test: one candidate per row, a canonical
 * number two of their rows reach kills both, then the monotone alignment.
 *
 * Kept in one function so the exact and the scored arm cannot diverge anywhere except in `admit`.
 */
const anchorsWith = (sides: Sides, admit: Admit): ScoredAnchor[] => {
  const matches: ScoredAnchor[] = []
  sides.theirs.forEach((row, fromIndex) => {
    const hit = admit(row, fromIndex)
    if (!hit) return
    matches.push({ from: row, to: hit.to, fromIndex, toIndex: hit.toIndex, key: hit.key, best: hit.best, second: hit.second })
  })
  const claims = new Map<number, number>()
  for (const match of matches) claims.set(match.toIndex, (claims.get(match.toIndex) ?? 0) + 1)
  return longestMonotone(matches.filter(match => claims.get(match.toIndex) === 1))
}

/**
 * The shipped anchor test: exact stripped key equality, non generic, unique on each side.
 *
 * A transcription of `alignByTitle`'s three drops (a key their side carries twice, a key naming two
 * numbers of ours, a row whose keys reach two numbers of ours), and asserted against the real
 * function in the controls below rather than trusted.
 */
const exactAdmit = (sides: Sides): Admit => {
  const ourKey = new Map<string, { index: number, row: SideEpisode } | null>()
  sides.canonical.forEach((entry, index) => {
    for (const row of entry.rows) {
      for (const key of anchorKeys(row)) {
        const held = ourKey.get(key)
        if (held === undefined) ourKey.set(key, { index, row })
        else if (held && held.index !== index) ourKey.set(key, null)
      }
    }
  })
  const theirKey = new Map<string, SideEpisode | null>()
  for (const row of sides.theirs) {
    for (const key of anchorKeys(row)) {
      if (theirKey.has(key)) theirKey.set(key, null)
      else theirKey.set(key, row)
    }
  }
  return row => {
    const reached = new Map<number, { row: SideEpisode, key: string }>()
    for (const key of anchorKeys(row)) {
      if (theirKey.get(key) !== row) continue
      const ours = ourKey.get(key)
      if (!ours) continue
      if (!reached.has(ours.index)) reached.set(ours.index, { row: ours.row, key })
    }
    if (reached.size !== 1) return null
    const entry = [...reached.entries()][0]!
    return { toIndex: entry[0], to: entry[1].row, key: entry[1].key, best: 1, second: 0 }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Scorers
 * ---------------------------------------------------------------------------------------------- */

/**
 * Token Dice over two stripped keys: `2|A and B| / (|A| + |B|)`.
 *
 * The scorer the owner's hand measurement used, and the one the proposal's argument is about: a
 * retranslated title keeps most of its tokens while an unrelated episode shares almost none.
 */
export const tokenDice = (a: string, b: string): number => {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

/** One scorer under test, by name, so the report can put the two side by side. */
type Scorer = { name: string, score: (a: string, b: string) => Promise<number> }

const SCORERS: Scorer[] = [
  { name: 'dice', score: async (a, b) => tokenDice(a, b) },
  // the repo's own symmetric 0..1 similarity, frizbee behind it. Included because the decision may
  // well be taken on the scorer that already ships rather than on a new one.
  { name: 'frizbee', score: (a, b) => titleSimilarity(a, b) },
]

/* ------------------------------------------------------------------------------------------------
 * The population: every list pair the labels speak about
 * ---------------------------------------------------------------------------------------------- */

/** One measured alignment: a case, a reference list, a candidate list, and the labels that straddle them. */
type Unit = {
  slug: string
  name: string
  reference: { mediaUri: string, origin: string, rows: SideEpisode[] }
  candidate: { mediaUri: string, origin: string, rows: SideEpisode[] }
  sides: Sides
  /** Every uri the labels pair with this one, symmetric, restricted to nothing: the whole case's. */
  partners: Map<string, Set<string>>
  /** Every uri the labels hold apart from this one, symmetric. */
  aparts: Map<string, Set<string>>
  /** Labels with one endpoint in each of the two lists: what makes this unit measurable at all. */
  straddling: number
  /** Offsets an `includes` range in this case licenses between the two lists, as `candidate - reference`. */
  rangeOffsets: number[]
}

const addPair = (index: Map<string, Set<string>>, a: string, b: string) => {
  index.set(a, (index.get(a) ?? new Set()).add(b))
  index.set(b, (index.get(b) ?? new Set()).add(a))
}

const unitsOf = (cases: readonly LoadedCase[]): Unit[] => {
  const units: Unit[] = []
  for (const { slug, file } of cases) {
    const episodes = file.episodes ?? []
    if (!episodes.length) continue
    const labelPairs = file.expect.episodePairs ?? []
    const labelAparts = file.expect.episodeApart ?? []
    if (!labelPairs.length && !labelAparts.length) continue

    const byUriIndex = new Map(episodes.map(episode => [episode.uri, episode]))
    const partners = new Map<string, Set<string>>()
    for (const pair of labelPairs) addPair(partners, pair.a, pair.b)
    const aparts = new Map<string, Set<string>>()
    for (const pair of labelAparts) addPair(aparts, pair.a, pair.b)

    const lists = new Map<string, CaseEpisode[]>()
    for (const episode of episodes) lists.set(episode.mediaUri, [...lists.get(episode.mediaUri) ?? [], episode])

    // the list pairs the labels speak about: at least one label with one endpoint in each list
    const straddles = new Map<string, number>()
    for (const pair of [...labelPairs, ...labelAparts]) {
      const a = byUriIndex.get(pair.a)
      const b = byUriIndex.get(pair.b)
      if (!a || !b || a.mediaUri === b.mediaUri) continue
      const key = [a.mediaUri, b.mediaUri].sort(compare).join('|')
      straddles.set(key, (straddles.get(key) ?? 0) + 1)
    }

    for (const [key, straddling] of straddles) {
      const [left, right] = key.split('|') as [string, string]
      const ranges = (file.expect.includes ?? []).filter(entry =>
        (entry.container === left && entry.run === right) || (entry.container === right && entry.run === left))
      // both orientations, because rule 3's two sides are not interchangeable: the reference side
      // groups by number and admits several rows per number, their side demands a unique key
      for (const [referenceUri, candidateUri] of [[left, right], [right, left]] as const) {
        const reference = (lists.get(referenceUri) ?? []).map(sideOf)
        const candidate = (lists.get(candidateUri) ?? []).map(sideOf)
        if (!reference.length || !candidate.length) continue
        const rangeOffsets = ranges.map(entry => {
          if (!entry.range) return 0
          const containerIsCandidate = entry.container === candidateUri
          return containerIsCandidate
            ? entry.range.fromStart - entry.range.toStart
            : entry.range.toStart - entry.range.fromStart
        })
        units.push({
          slug,
          name: file.name,
          reference: { mediaUri: referenceUri, origin: (lists.get(referenceUri)![0]!).origin, rows: reference },
          candidate: { mediaUri: candidateUri, origin: (lists.get(candidateUri)![0]!).origin, rows: candidate },
          sides: sidesOf(reference, candidate),
          partners,
          aparts,
          straddling,
          rangeOffsets: [...new Set(rangeOffsets)],
        })
      }
    }
  }
  return units
}

/* ------------------------------------------------------------------------------------------------
 * The verdict on one anchor, against the labels
 * ---------------------------------------------------------------------------------------------- */

/**
 * What the labels say about one proposed anchor.
 *
 * `agree`  the labels pair their row with a reference row carrying the anchored number.
 * `contradict` the labels refuse it: they hold the two rows apart, or they pair one of the two with a
 *   DIFFERENT row of the other list, which is the same statement about this anchor.
 * `unlabelled` the labels say nothing about either row against the other list.
 */
export type AnchorVerdict = 'agree' | 'contradict' | 'unlabelled'

type Judged = {
  verdict: AnchorVerdict
  /** Why a contradiction is one, so the report can print the reason beside the anchor. */
  reason: string
  /** Whether the anchor put their number on the same number of ours, which is what a working pair looks like. */
  diagonal: boolean
  /** Whether an `includes` range in the case licenses this offset, so a folded season is not read as a miss. */
  inRange: boolean
}

const judge = (unit: Unit, anchor: ScoredAnchor): Judged => {
  const slot = unit.sides.canonical[anchor.toIndex]!
  const theirUris = new Set(unit.sides.theirs.map(row => row.uri))
  const ourUris = new Set(unit.sides.canonical.flatMap(entry => entry.rows.map(row => row.uri)))
  const offset = anchor.from.number! - slot.number
  const diagonal = offset === 0
  const inRange = unit.rangeOffsets.includes(offset)

  const theirPartners = unit.partners.get(anchor.from.uri) ?? new Set<string>()
  const slotUris = slot.rows.map(row => row.uri)
  if (slotUris.some(uri => theirPartners.has(uri))) return { verdict: 'agree', reason: '', diagonal, inRange }

  const theirAparts = unit.aparts.get(anchor.from.uri) ?? new Set<string>()
  const hitApart = slotUris.find(uri => theirAparts.has(uri))
  if (hitApart) return { verdict: 'contradict', reason: `labelled apart from ${hitApart}`, diagonal, inRange }

  const elsewhere = [...theirPartners].filter(uri => ourUris.has(uri))
  if (elsewhere.length) {
    return { verdict: 'contradict', reason: `their row is labelled paired with ${elsewhere.join(', ')}`, diagonal, inRange }
  }
  for (const uri of slotUris) {
    const ourPartners = [...(unit.partners.get(uri) ?? new Set<string>())].filter(other => theirUris.has(other))
    if (ourPartners.length) {
      return { verdict: 'contradict', reason: `our row ${uri} is labelled paired with ${ourPartners.join(', ')}`, diagonal, inRange }
    }
  }
  return { verdict: 'unlabelled', reason: '', diagonal, inRange }
}

/* ------------------------------------------------------------------------------------------------
 * Measured state, filled once in beforeAll
 * ---------------------------------------------------------------------------------------------- */

type Cell = {
  scorer: string
  floor: number
  margin: number
  anchors: number
  agree: number
  contradict: number
  unlabelled: number
  offDiagonal: number
  /** How many of the exact arm's AGREEING anchors this cell still proposes with the same target. */
  retained: number
}

type Contradiction = {
  slug: string
  reference: string
  candidate: string
  fromUri: string
  fromNumber: number
  fromTitle: string
  toUri: string
  toNumber: number
  toTitle: string
  reason: string
  best: number
  second: number
  cells: string[]
}

/** One anchor the labels do not speak about, printed so a reader can judge it themselves. */
type Suspicion = {
  slug: string
  what: string
  best: number
  second: number
  cells: string[]
}

/** One score matrix: `[their row index][canonical slot index]` best score and the key pair that scored it. */
type Matrix = { score: number, theirKey: string, ourKey: string, to: SideEpisode }[][]

const state: {
  cases: LoadedCase[]
  units: Unit[]
  exact: Map<Unit, ScoredAnchor[]>
  exactAgree: Set<string>
  cells: Cell[]
  contradictions: Contradiction[]
  suspicions: Suspicion[]
  gained: Map<string, Suspicion[]>
  perOrigin: Map<string, Map<string, { anchors: number, agree: number, contradict: number }>>
  labelSpan: Map<string, number>
  apartSpan: Map<string, number>
} = {
  cases: [],
  units: [],
  exact: new Map(),
  exactAgree: new Set(),
  cells: [],
  contradictions: [],
  suspicions: [],
  gained: new Map(),
  perOrigin: new Map(),
  labelSpan: new Map(),
  apartSpan: new Map(),
}

const titleOf = (row: SideEpisode): string => anchorKeys(row)[0] ?? '(no usable title)'

/**
 * One anchor's identity for the retention count: their ROW placed on our NUMBER.
 *
 * Keyed on the number and never on `anchor.to.uri`, because a canonical slot can hold several
 * reference rows (anizip 5 and kitsu 5 are one episode, `CanonicalEpisode.rows`) and the two arms
 * pick a different one of them: the exact arm names the row whose key matched, the scored arm the row
 * that scored highest. Keying on the row would then read one placement as two and undercount
 * retention, which is the number the whole safety question turns on.
 */
const anchorId = (unit: Unit, anchor: ScoredAnchor): string =>
  `${unit.slug}|${unit.reference.mediaUri}|${anchor.from.uri}|${unit.sides.canonical[anchor.toIndex]!.number}`

const matrixOf = async (unit: Unit, scorer: Scorer): Promise<Matrix> => {
  const matrix: Matrix = []
  for (const row of unit.sides.theirs) {
    const theirKeys = anchorKeys(row)
    const line: Matrix[number] = []
    for (const slot of unit.sides.canonical) {
      let best = { score: 0, theirKey: '', ourKey: '', to: slot.rows[0]! }
      for (const theirKey of theirKeys) {
        for (const ours of slot.rows) {
          for (const ourKey of anchorKeys(ours)) {
            const score = await scorer.score(theirKey, ourKey)
            if (score > best.score) best = { score, theirKey, ourKey, to: ours }
          }
        }
      }
      line.push(best)
    }
    matrix.push(line)
  }
  return matrix
}

const scoredAdmit = (matrix: Matrix, floor: number, margin: number): Admit => (row, fromIndex) => {
  const line = matrix[fromIndex]
  if (!line) return null
  let bestIndex = -1
  let best = 0
  let second = 0
  line.forEach((cell, index) => {
    if (cell.score > best) {
      second = best
      best = cell.score
      bestIndex = index
    } else if (cell.score > second) {
      second = cell.score
    }
  })
  if (bestIndex < 0 || best <= 0 || best < floor || best - second < margin) return null
  const hit = line[bestIndex]!
  return { toIndex: bestIndex, to: hit.to, key: `${hit.theirKey} ~ ${hit.ourKey}`, best, second }
}

/* ------------------------------------------------------------------------------------------------
 * The adjacent episode hazard, over the whole recorded page
 * ---------------------------------------------------------------------------------------------- */

type DumpEpisode = { uri: string, origin: string, mediaUri: string, number: number | null, keys: string[] }

const loadDumpEpisodes = (): DumpEpisode[] => {
  if (!existsSync(ANSWERS_PATH)) {
    throw new Error(
      `no recorded answers at ${ANSWERS_PATH}\n`
      + `corpus/ is gitignored, so a fresh checkout has none of it. Regenerate with:\n`
      + `  node scripts/walk-season-answers.mjs\n`
      + `or point ANCHOR_ANSWERS at an existing dump.`
    )
  }
  const rows = new Map<string, DumpEpisode>()
  for (const line of readFileSync(ANSWERS_PATH, 'utf8').split('\n')) {
    if (!line) continue
    const answer = JSON.parse(line) as { kind?: string, origin?: string, raw?: unknown }
    if (answer.kind !== 'episode') continue
    const raw = typeof answer.raw === 'string' ? JSON.parse(answer.raw) : answer.raw
    for (const entry of (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[]) {
      if (!entry || typeof entry.uri !== 'string' || typeof entry.mediaUri !== 'string') continue
      const keys = titleKeysOf(entry.titles).map(key => key.key).filter(key => !isGenericEpisodeTitle(key))
      rows.set(entry.uri, {
        uri: entry.uri,
        origin: typeof entry.origin === 'string' ? entry.origin : String(answer.origin ?? ''),
        mediaUri: entry.mediaUri,
        number: typeof entry.episodeNumber === 'number' ? entry.episodeNumber : null,
        keys,
      })
    }
  }
  if (rows.size < 1000) throw new Error(`${ANSWERS_PATH} yielded ${rows.size} episode rows, expected 1000 or more`)
  return [...rows.values()]
}

const bestBetween = async (a: readonly string[], b: readonly string[], scorer: Scorer): Promise<number> => {
  let best = 0
  for (const left of a) for (const right of b) best = Math.max(best, await scorer.score(left, right))
  return best
}

/* ------------------------------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------------------------------- */

beforeAll(async () => {
  state.cases = loadCases()
  state.units = unitsOf(state.cases)

  for (const { file } of state.cases) {
    const index = new Map((file.episodes ?? []).map(episode => [episode.uri, episode]))
    for (const [field, span] of [['episodePairs', state.labelSpan], ['episodeApart', state.apartSpan]] as const) {
      for (const pair of (file.expect[field] ?? [])) {
        const a = index.get(pair.a)
        const b = index.get(pair.b)
        const key = [a?.origin ?? '?', b?.origin ?? '?'].sort(compare).join(' x ')
        span.set(key, (span.get(key) ?? 0) + 1)
      }
    }
  }

  const found = new Map<string, Contradiction>()
  const suspected = new Map<string, Suspicion>()
  const suspicionOf = (unit: Unit, anchor: ScoredAnchor, label: string) => {
    const id = `${anchorId(unit, anchor)}|suspicion`
    const held = suspected.get(id)
    if (held) {
      held.cells.push(label)
      return
    }
    suspected.set(id, {
      slug: unit.slug,
      what: `${unit.candidate.mediaUri} row ${anchor.from.number} "${titleOf(anchor.from)}" `
        + `onto ${unit.reference.mediaUri} number ${unit.sides.canonical[anchor.toIndex]!.number} `
        + `"${titleOf(anchor.to)}"`,
      best: anchor.best,
      second: anchor.second,
      cells: [label],
    })
  }

  for (const unit of state.units) {
    const anchors = anchorsWith(unit.sides, exactAdmit(unit.sides))
    state.exact.set(unit, anchors)
    for (const anchor of anchors) {
      const verdict = judge(unit, anchor)
      if (verdict.verdict === 'agree') state.exactAgree.add(anchorId(unit, anchor))
      // the SHIPPED test's own off diagonal anchors, listed first so the report cannot read one of
      // them as something the loosening introduced
      if (verdict.verdict === 'unlabelled' && !verdict.diagonal && !verdict.inRange) {
        suspicionOf(unit, anchor, 'exact')
      }
    }
  }
  // the cells whose per origin breakdown and whose gained agreements the report prints: the exact
  // baseline, the owner's hand measured cell, and the loosest cell of each scorer that contradicts
  // nothing while retaining every exact agreement (filled in after the sweep for the second of those)
  const HEADLINES = new Set(['dice f0.34 m0.15', 'dice f0.70 m0.05', 'frizbee f0.34 m0.15', 'frizbee f1.00 m0.00'])
  for (const scorer of SCORERS) {
    const matrices = new Map<Unit, Matrix>()
    for (const unit of state.units) matrices.set(unit, await matrixOf(unit, scorer))
    for (const floor of FLOORS) {
      for (const margin of MARGINS) {
        const cell: Cell = {
          scorer: scorer.name, floor, margin,
          anchors: 0, agree: 0, contradict: 0, unlabelled: 0, offDiagonal: 0, retained: 0,
        }
        const label = `${scorer.name} f${floor.toFixed(2)} m${margin.toFixed(2)}`
        for (const unit of state.units) {
          const anchors = anchorsWith(unit.sides, scoredAdmit(matrices.get(unit)!, floor, margin))
          for (const anchor of anchors) {
            const verdict = judge(unit, anchor)
            cell.anchors += 1
            if (verdict.verdict === 'agree') {
              cell.agree += 1
              if (state.exactAgree.has(anchorId(unit, anchor))) cell.retained += 1
            } else if (verdict.verdict === 'contradict') {
              cell.contradict += 1
              const id = anchorId(unit, anchor)
              const held = found.get(id)
              if (held) held.cells.push(label)
              else {
                found.set(id, {
                  slug: unit.slug,
                  reference: `${unit.reference.mediaUri} (${unit.reference.origin})`,
                  candidate: `${unit.candidate.mediaUri} (${unit.candidate.origin})`,
                  fromUri: anchor.from.uri,
                  fromNumber: anchor.from.number!,
                  fromTitle: titleOf(anchor.from),
                  toUri: anchor.to.uri,
                  toNumber: unit.sides.canonical[anchor.toIndex]!.number,
                  toTitle: titleOf(anchor.to),
                  reason: verdict.reason,
                  best: anchor.best,
                  second: anchor.second,
                  cells: [label],
                })
              }
            } else {
              cell.unlabelled += 1
              if (!verdict.diagonal && !verdict.inRange) {
                cell.offDiagonal += 1
                suspicionOf(unit, anchor, label)
              }
            }
            if (HEADLINES.has(label)) {
              const key = `${unit.candidate.origin} onto ${unit.reference.origin}`
              const table = state.perOrigin.get(label) ?? new Map()
              const row = table.get(key) ?? { anchors: 0, agree: 0, contradict: 0 }
              row.anchors += 1
              if (verdict.verdict === 'agree') row.agree += 1
              if (verdict.verdict === 'contradict') row.contradict += 1
              table.set(key, row)
              state.perOrigin.set(label, table)
              if (verdict.verdict === 'agree' && !state.exactAgree.has(anchorId(unit, anchor))) {
                state.gained.set(label, [...state.gained.get(label) ?? [], {
                  slug: unit.slug,
                  what: `${unit.candidate.mediaUri} row ${anchor.from.number} "${titleOf(anchor.from)}" `
                    + `onto ${unit.reference.mediaUri} number ${unit.sides.canonical[anchor.toIndex]!.number} `
                    + `"${titleOf(anchor.to)}"`,
                  best: anchor.best,
                  second: anchor.second,
                  cells: [label],
                }])
              }
            }
          }
        }
        state.cells.push(cell)
      }
    }
  }
  state.contradictions = [...found.values()]
  state.suspicions = [...suspected.values()]
}, 900_000)

const cellOf = (scorer: string, floor: number, margin: number): Cell =>
  state.cells.find(cell => cell.scorer === scorer && cell.floor === floor && cell.margin === margin)!

const report: string[] = []
const say = (line: string) => {
  report.push(line)
  console.log(line)
}

describe('control: the anchor corpus rig can measure', () => {
  it('reproduces the shipped alignByTitle anchors on every measured list pair', () => {
    const shape = (anchors: readonly Anchor[]) =>
      anchors.map(a => `${a.from.uri}->${a.to.uri}@${a.fromIndex}:${a.toIndex}:${a.key}`).join(' | ')
    let checked = 0
    let welded = 0
    let welds = 0
    for (const unit of state.units) {
      expect(unit.sides.canonical.length).toBeGreaterThan(0)
      const mine = state.exact.get(unit)!
      // The comparison is against the shipped rule's EXACT anchors. `alignByTitle` gained a scored
      // fallback on 2026-09-13 (`scoredAnchors`, below `MIN_ALIGNED` exact anchors), so the raw
      // answer now carries welds on the list pairs this arm finds nothing on: kitsu prefixes every
      // title with `EPISODE 01:`, so `anilist-177699` matches nothing exactly and welds 10 times.
      // This arm measures the EXACT rule, which is the baseline every cell of the grid is read
      // against, so the welds are set aside here and counted rather than absorbed.
      const shipped = alignByTitle(unit.reference.rows, unit.candidate.rows).anchors
      const scored = shipped.filter(anchor => anchor.scored)
      if (scored.length) {
        welded += 1
        welds += scored.length
      }
      expect(shape(mine), `${unit.slug} ${unit.reference.mediaUri} <- ${unit.candidate.mediaUri}`)
        .toBe(shape(shipped.filter(anchor => !anchor.scored)))
      checked += 1
    }
    expect(checked).toBeGreaterThan(50)
    // and the filter above can produce a positive: the shipped rule DOES weld on this corpus, so a
    // comparison that passed because there was nothing to set aside would fail here
    expect(welds).toBeGreaterThan(0)
    say(`control: the exact arm reproduces alignByTitle's exact anchors on all ${checked} measured list pairs`)
    say(`control: the shipped fallback welds ${welds} anchors over ${welded} of those pairs, set aside here`)
  })

  /**
   * WHAT THE SCORED FALLBACK CHANGES ABOUT THE PAIRS RULE 3 MINTS on the labelled corpus: nothing.
   *
   * The fallback runs only below `MIN_ALIGNED` exact anchors, and there the rule that shipped before
   * it minted NOTHING at all (two anchors is the bracket minimum, so one anchor brackets nothing).
   * So "no minted pair changed" reduces to one assertion: on every list pair whose exact arm holds
   * fewer than two anchors, the shipped rule still mints nothing, which is `MIN_SCORED_ANCHORS` and
   * the window refusing every weld-bearing alignment in this corpus. Above the minimum the fallback
   * is never consulted, so those pairs are unchanged by construction rather than by measurement.
   *
   * This is the measurement no suite made before 2026-09-13: `tests/corpus/run.ts` is executed only
   * by the 700 second `graph-store` file, so the 901 human episode labels never judged rule 3's
   * anchors at all.
   */
  it('the scored fallback mints no pair the exact rule did not, on every labelled list pair', () => {
    let belowMinimum = 0
    let weldsBelow = 0
    const minted: string[] = []
    for (const unit of state.units) {
      if (state.exact.get(unit)!.length >= MIN_ALIGNED) continue
      belowMinimum += 1
      const sequence = pairsBySequence(unit.reference.rows, unit.candidate.rows)
      weldsBelow += sequence.alignment.scored
      if (sequence.pairs.length) {
        minted.push(`${unit.slug} ${unit.reference.mediaUri} <- ${unit.candidate.mediaUri}: `
          + `${sequence.alignment.anchors.length} anchors (${sequence.alignment.scored} welds), ${sequence.pairs.length} pairs`)
      }
    }
    expect(belowMinimum).toBeGreaterThan(0)
    // and the rig can see a weld: the fallback did propose on this population, it simply minted nothing
    expect(weldsBelow).toBeGreaterThan(0)
    say(`control: ${belowMinimum} list pairs sit below the bracket minimum, ${weldsBelow} welds proposed there, ${minted.length} minting`)
    for (const line of minted) say(`  MINTED ${line}`)
    expect(minted).toEqual([])
  })

  it('has a contradiction detector that can express a contradiction', () => {
    // every anchor of the exact arm shifted one canonical slot along. The labels pair their row with
    // the slot it came off, so a shifted anchor must read as a contradiction wherever a label reaches.
    let shifted = 0
    let caught = 0
    for (const unit of state.units) {
      for (const anchor of state.exact.get(unit)!) {
        const next = anchor.toIndex + 1
        if (next >= unit.sides.canonical.length) continue
        shifted += 1
        const moved: ScoredAnchor = { ...anchor, toIndex: next, to: unit.sides.canonical[next]!.rows[0]! }
        if (judge(unit, moved).verdict === 'contradict') caught += 1
      }
    }
    expect(shifted).toBeGreaterThan(50)
    expect(caught).toBeGreaterThan(0)
    say(`control: ${caught} of ${shifted} deliberately shifted anchors are reported as contradictions`)
  })

  it('has live scorers: an identical key reaches 1.0 and an unrelated pair stays low', async () => {
    for (const scorer of SCORERS) {
      expect(await scorer.score('burn bright mad dog', 'burn bright mad dog'), scorer.name).toBeCloseTo(1, 3)
      const unrelated = await scorer.score('burn bright mad dog', 'the sword god of the north')
      expect(unrelated, `${scorer.name} unrelated`).toBeLessThan(0.34)
      say(`control: ${scorer.name} self 1.000, unrelated ${unrelated.toFixed(3)}`)
    }
    expect(stripTitle('Rage, Mad Dog!')).toBe('rage mad dog')
    expect(isGenericEpisodeTitle('Episode 12')).toBe(true)
  })

  it('agrees with alignByTitle on the two rules the corpus never exercises', () => {
    // MEASURED, not assumed: mutating the ambiguity refusal and the one-claim-per-slot rule in the
    // arm above reddens NOTHING on the corpus population, because the exact arm never hits either
    // rule on these 190 list pairs. Both are load bearing in the scored arm (15 of the exact
    // agreements lost at dice f0.34 m0.00 are claimed-away slots), so they are exercised here on two
    // synthetic list pairs instead, against the shipped function and against an absolute answer.
    const side = (uri: string, number: number, keys: string[]): SideEpisode =>
      ({ uri, origin: 'probe', number, day: null, keys, hung: 'probe:0' })

    // a row of theirs whose two keys reach two different numbers of ours is an ambiguity and never
    // two matches, so only the third row anchors
    const ambiguousReference = [side('r:1', 1, ['alpha']), side('r:2', 2, ['beta']), side('r:3', 3, ['gamma'])]
    const ambiguousTheirs = [side('t:1', 1, ['alpha', 'beta']), side('t:2', 2, ['gamma'])]
    const ambiguous = anchorsWith(sidesOf(ambiguousReference, ambiguousTheirs), exactAdmit(sidesOf(ambiguousReference, ambiguousTheirs)))
    expect(ambiguous.map(anchor => anchor.key)).toEqual(['gamma'])
    expect(ambiguous.map(anchor => `${anchor.from.uri}->${anchor.to.uri}`))
      .toEqual(alignByTitle(ambiguousReference, ambiguousTheirs).anchors.map(anchor => `${anchor.from.uri}->${anchor.to.uri}`))

    // two of their rows reaching ONE number of ours through two of its keys is one row too many for
    // one episode, so both are dropped and only the third anchors
    const claimedReference = [side('r:1', 1, ['kone', 'ktwo']), side('r:2', 2, ['kthree'])]
    const claimedTheirs = [side('t:1', 1, ['kone']), side('t:2', 2, ['ktwo']), side('t:3', 3, ['kthree'])]
    const claimed = anchorsWith(sidesOf(claimedReference, claimedTheirs), exactAdmit(sidesOf(claimedReference, claimedTheirs)))
    expect(claimed.map(anchor => anchor.key)).toEqual(['kthree'])
    expect(claimed.map(anchor => `${anchor.from.uri}->${anchor.to.uri}`))
      .toEqual(alignByTitle(claimedReference, claimedTheirs).anchors.map(anchor => `${anchor.from.uri}->${anchor.to.uri}`))
    say('control: the ambiguity refusal and the one-claim-per-slot rule match alignByTitle on the two '
      + 'synthetic pairs the corpus population never produces')
  })

  it('collapses onto exact equality at the top of the range, and names what is left over', async () => {
    // dice reaches 1.0 exactly when the two token SETS are equal, which is string equality plus word
    // reorderings, so this cell is the closest a scored test comes to the shipped one. It is not a
    // superset in either direction and the two reasons are worth having in the report: a key their
    // side carries twice is refused by exact (`theirKey` uniqueness) and has no scored analogue, and
    // a key reaching two of our numbers is refused by exact where the scored arm sees 1.0 at both
    // slots, takes the first and is stopped only by a margin.
    let reproduced = 0
    let total = 0
    let extra = 0
    for (const unit of state.units) {
      const matrix = await matrixOf(unit, SCORERS[0]!)
      const scored = anchorsWith(unit.sides, scoredAdmit(matrix, 1, 0))
      const ids = new Set(scored.map(anchor => anchorId(unit, anchor)))
      for (const anchor of state.exact.get(unit)!) {
        total += 1
        if (ids.has(anchorId(unit, anchor))) reproduced += 1
      }
      extra += [...ids].filter(id => !state.exact.get(unit)!.some(anchor => anchorId(unit, anchor) === id)).length
    }
    expect(total).toBeGreaterThan(0)
    expect(reproduced / total).toBeGreaterThan(0.95)
    say(`control: dice at floor 1.00 margin 0 reproduces ${reproduced} of ${total} exact anchors `
      + `and adds ${extra} the exact test refused`)
  })

  it('separates: the loosest cell proposes strictly more anchors than exact equality', () => {
    const exactTotal = [...state.exact.values()].reduce((sum, anchors) => sum + anchors.length, 0)
    expect(exactTotal).toBeGreaterThan(0)
    for (const scorer of SCORERS) {
      const loosest = cellOf(scorer.name, FLOORS[0], MARGINS[0])
      expect(loosest.anchors, `${scorer.name} loosest`).toBeGreaterThan(exactTotal)
    }
    say(`control: exact proposes ${exactTotal} anchors, so the sweep has something to loosen`)
  })
})

describe('anchor corpus: what the labels span', () => {
  it('names the origin pairs the episode labels actually cover', () => {
    say('')
    say('## What the labels span')
    say('')
    const pairs = [...state.labelSpan.entries()].sort((a, b) => b[1] - a[1])
    const aparts = [...state.apartSpan.entries()].sort((a, b) => b[1] - a[1])
    say(`episodePairs, ${pairs.reduce((sum, entry) => sum + entry[1], 0)} labels: `
      + pairs.map(([key, count]) => `${key} ${count}`).join(', '))
    say(`episodeApart, ${aparts.reduce((sum, entry) => sum + entry[1], 0)} labels: `
      + aparts.map(([key, count]) => `${key} ${count}`).join(', '))
    const withPairs = state.cases.filter(entry => (entry.file.expect.episodePairs ?? []).length).length
    const emptyPairs = state.cases.filter(entry =>
      Array.isArray(entry.file.expect.episodePairs) && !entry.file.expect.episodePairs.length).length
    say(`${state.cases.length} cases: ${withPairs} carry at least one episodePair, ${emptyPairs} carry an EMPTY `
      + `episodePairs (the labeller looked and established none, which is not a claim that the rows are apart)`)
    say(`measured population: ${state.units.length} oriented list pairs over `
      + `${new Set(state.units.map(unit => unit.slug)).size} cases`)
    const origins = new Map<string, number>()
    for (const unit of state.units) {
      const key = `${unit.candidate.origin} onto ${unit.reference.origin}`
      origins.set(key, (origins.get(key) ?? 0) + 1)
    }
    say(`oriented list pairs by origin: `
      + [...origins.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(', '))
    expect(pairs.length).toBeGreaterThan(0)
  })
})

describe('anchor corpus: the exact baseline', () => {
  it('counts what exact equality proposes and how the labels judge it', () => {
    let anchors = 0
    let agree = 0
    let contradict = 0
    let unlabelled = 0
    let offDiagonal = 0
    for (const unit of state.units) {
      for (const anchor of state.exact.get(unit)!) {
        const verdict = judge(unit, anchor)
        anchors += 1
        if (verdict.verdict === 'agree') agree += 1
        else if (verdict.verdict === 'contradict') contradict += 1
        else {
          unlabelled += 1
          if (!verdict.diagonal && !verdict.inRange) offDiagonal += 1
        }
      }
    }
    say('')
    say('## The exact baseline')
    say('')
    say(`exact anchors ${anchors}: agree ${agree}, contradict ${contradict}, unlabelled ${unlabelled} `
      + `(of which off diagonal and outside any labelled range: ${offDiagonal})`)
    expect(anchors).toBeGreaterThan(0)
  })
})

describe('anchor corpus: the grid', () => {
  it('sweeps floor against margin for every scorer', () => {
    say('')
    say('## The grid, per scorer')
    say('')
    for (const scorer of SCORERS) {
      say(`### ${scorer.name}`)
      say('')
      say('| floor | ' + MARGINS.map(margin => `m${margin.toFixed(2)}`).join(' | ') + ' |')
      say('| --- | ' + MARGINS.map(() => '---').join(' | ') + ' |')
      for (const floor of FLOORS) {
        const cells = MARGINS.map(margin => {
          const cell = cellOf(scorer.name, floor, margin)
          return `${cell.anchors}a ${cell.agree}y ${cell.contradict}x ${cell.offDiagonal}?`
        })
        say(`| ${floor.toFixed(2)} | ${cells.join(' | ')} |`)
      }
      say('')
      say('a = anchors proposed, y = agree with a label, x = CONTRADICT a label, ? = unlabelled and '
        + 'off diagonal outside any labelled range')
      say('')
      say(`Exact agreements LOST, out of the ${state.exactAgree.size} the shipped test reaches. This is `
        + 'the margin\'s own cost: an exact match scores 1.0, so a runner up within the margin refuses '
        + 'a pair the shipped test takes.')
      say('')
      say('| floor | ' + MARGINS.map(margin => `m${margin.toFixed(2)}`).join(' | ') + ' |')
      say('| --- | ' + MARGINS.map(() => '---').join(' | ') + ' |')
      for (const floor of FLOORS) {
        const cells = MARGINS.map(margin => `${state.exactAgree.size - cellOf(scorer.name, floor, margin).retained}`)
        say(`| ${floor.toFixed(2)} | ${cells.join(' | ')} |`)
      }
      say('')
    }
    expect(state.cells.length).toBe(SCORERS.length * FLOORS.length * MARGINS.length)
  })

  it('reports every contradicting anchor individually', () => {
    say('')
    say('## Every contradicting anchor')
    say('')
    if (!state.contradictions.length) {
      say('none, at any cell of the grid, for either scorer')
    }
    for (const entry of state.contradictions.sort((a, b) => b.cells.length - a.cells.length)) {
      say(`- ${entry.slug}: ${entry.candidate} row ${entry.fromNumber} "${entry.fromTitle}" (${entry.fromUri}) `
        + `anchored onto ${entry.reference} number ${entry.toNumber} "${entry.toTitle}" (${entry.toUri}); `
        + `${entry.reason}; best ${entry.best.toFixed(3)} second ${entry.second.toFixed(3)}; `
        + `admitted in ${entry.cells.length} cells, loosest ${entry.cells[0]}`)
    }
    expect(Array.isArray(state.contradictions)).toBe(true)
  })

  it('reports every unlabelled anchor that landed off the diagonal', () => {
    say('')
    say('## Unlabelled anchors that landed off the diagonal')
    say('')
    say('Not contradictions: the labels say nothing about these two rows against each other. They are '
      + 'printed because an off diagonal placement between two sources of one run is where a false '
      + 'anchor would show up if the labels had reached it. An offset a labelled `includes` range '
      + 'licenses is excluded already.')
    say('')
    if (!state.suspicions.length) say('none, at any cell of the grid, for either scorer')
    for (const entry of state.suspicions.sort((a, b) => b.cells.length - a.cells.length)) {
      say(`- ${entry.slug}: ${entry.what}; best ${entry.best.toFixed(3)} second ${entry.second.toFixed(3)}; `
        + `${entry.cells.length} cells, loosest ${entry.cells[0]}`)
    }
    expect(Array.isArray(state.suspicions)).toBe(true)
  })

  it('breaks the headline cells down by origin pair and names what they gained', () => {
    say('')
    say('## The headline cells by origin pair')
    say('')
    const exactTable = new Map<string, { anchors: number, agree: number, contradict: number }>()
    for (const unit of state.units) {
      for (const anchor of state.exact.get(unit)!) {
        const verdict = judge(unit, anchor)
        const key = `${unit.candidate.origin} onto ${unit.reference.origin}`
        const row = exactTable.get(key) ?? { anchors: 0, agree: 0, contradict: 0 }
        row.anchors += 1
        if (verdict.verdict === 'agree') row.agree += 1
        if (verdict.verdict === 'contradict') row.contradict += 1
        exactTable.set(key, row)
      }
    }
    const labels = [...state.perOrigin.keys()].sort(compare)
    const origins = [...new Set([...exactTable.keys(), ...labels.flatMap(label => [...state.perOrigin.get(label)!.keys()])])].sort(compare)
    say('| origin pair | ' + ['exact', ...labels].join(' | ') + ' |')
    say('| --- | ' + [0, ...labels].map(() => '---').join(' | ') + ' |')
    for (const origin of origins) {
      const cells = [exactTable.get(origin), ...labels.map(label => state.perOrigin.get(label)!.get(origin))]
        .map(row => (row ? `${row.anchors}a ${row.agree}y ${row.contradict}x` : '0a 0y 0x'))
      say(`| ${origin} | ${cells.join(' | ')} |`)
    }
    const population = new Set(state.units.map(unit => `${unit.candidate.origin} onto ${unit.reference.origin}`))
    const silent = [...population].filter(key => !origins.includes(key)).sort(compare)
    say('')
    say(`origin pairs in the measured population that proposed NO anchor at any of these cells: `
      + `${silent.length ? silent.join(', ') : 'none'}. That is where the corpus's only Netflix `
      + `datapoint sits, and it is empty: the one nf list pair is the specification derived Blue `
      + `Exorcist case (8.3), whose 26 nf rows and 25 anizip rows carry NO episode titles at all, so `
      + `no anchor test of any kind can propose anything there. The corpus holds zero title bearing `
      + `Netflix episode labels, which is the whole reason the live sweep is a separate measurement.`)
    say('')
    for (const label of labels) {
      const gained = state.gained.get(label) ?? []
      say(`${label} gained ${gained.length} label agreements the exact test did not reach`
        + (gained.length ? ', for example:' : ''))
      for (const entry of gained.slice(0, 8)) {
        say(`  - ${entry.slug}: ${entry.what}; best ${entry.best.toFixed(3)} second ${entry.second.toFixed(3)}`)
      }
    }
    expect(labels.length).toBeGreaterThan(0)
  })

  it('answers whether a margin buys zero contradictions with the exact agreements retained', () => {
    say('')
    say('## Is there a safe cell')
    say('')
    const exactAgreements = state.exactAgree.size
    say(`the exact baseline agrees with ${exactAgreements} labels; a cell is SAFE when it contradicts `
      + `nothing and retains all ${exactAgreements}`)
    for (const scorer of SCORERS) {
      const safe = state.cells.filter(cell =>
        cell.scorer === scorer.name && cell.contradict === 0 && cell.retained === exactAgreements)
      const best = safe.sort((a, b) => b.agree - a.agree || a.margin - b.margin)[0]
      if (!best) {
        const closest = state.cells
          .filter(cell => cell.scorer === scorer.name && cell.contradict === 0)
          .sort((a, b) => b.retained - a.retained)[0]
        say(`${scorer.name}: NO safe cell. Best contradiction-free cell retains `
          + `${closest?.retained ?? 0} of ${exactAgreements} exact agreements `
          + `(f${closest?.floor.toFixed(2)} m${closest?.margin.toFixed(2)})`)
        continue
      }
      say(`${scorer.name}: ${safe.length} safe cells; the one with the most label agreement is `
        + `f${best.floor.toFixed(2)} m${best.margin.toFixed(2)} with ${best.anchors} anchors, `
        + `${best.agree} agreements (exact had ${exactAgreements}), ${best.offDiagonal} off diagonal unlabelled`)
      say(`${scorer.name} safe cells in full: `
        + safe.map(cell => `f${cell.floor.toFixed(2)} m${cell.margin.toFixed(2)} (${cell.agree}y)`).join(', '))
    }
    const noMargin = SCORERS.map(scorer => {
      const worst = state.cells
        .filter(cell => cell.scorer === scorer.name && cell.margin === 0)
        .reduce((sum, cell) => sum + cell.contradict, 0)
      return `${scorer.name} ${worst}`
    })
    say(`contradictions summed over every floor at margin 0: ${noMargin.join(', ')}`)
    expect(state.cells.some(cell => cell.contradict === 0)).toBe(true)
  })
})

describe('anchor corpus: why a loosened test loses an exact agreement', () => {
  it('classifies every lost exact agreement at four cells, by the stage that dropped it', async () => {
    say('')
    say('## Why a loosened test loses an exact agreement')
    say('')
    say('The loss is NOT only the margin. Rule 3 keeps at most one anchor per canonical slot and then '
      + 'takes the longest increasing subsequence, so an anchor the loosening ADDS can claim a slot a '
      + 'correct anchor wanted, or cross it and be dropped by the monotone filter instead of it. That '
      + 'happens at margin 0 too, where the margin cannot be the explanation.')
    say('')
    const cells: [Scorer, number, number][] = [
      [SCORERS[0]!, 0.34, 0],
      [SCORERS[0]!, 0.34, 0.15],
      [SCORERS[0]!, 0.7, 0.05],
      [SCORERS[1]!, 0.34, 0.15],
    ]
    for (const [scorer, floor, margin] of cells) {
      const reasons = new Map<string, number>()
      const examples: string[] = []
      for (const unit of state.units) {
        const matrix = await matrixOf(unit, scorer)
        const admit = scoredAdmit(matrix, floor, margin)
        const raw = unit.sides.theirs.map((row, index) => ({ row, index, hit: admit(row, index) }))
        const claims = new Map<number, number>()
        for (const entry of raw) if (entry.hit) claims.set(entry.hit.toIndex, (claims.get(entry.hit.toIndex) ?? 0) + 1)
        const kept = new Set(anchorsWith(unit.sides, admit).map(anchor => anchorId(unit, anchor)))
        for (const anchor of state.exact.get(unit)!) {
          const id = anchorId(unit, anchor)
          if (!state.exactAgree.has(id) || kept.has(id)) continue
          const entry = raw[anchor.fromIndex]!
          const reason = !entry.hit
            ? 'refused by the floor or the margin'
            : entry.hit.toIndex !== anchor.toIndex
              ? 'moved onto another number'
              : (claims.get(entry.hit.toIndex) ?? 0) > 1
                ? 'its slot was claimed by two of their rows'
                : 'dropped by the monotone filter'
          reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
          if (examples.length < 4) {
            examples.push(`  - ${unit.slug}: ${unit.candidate.mediaUri} row ${anchor.from.number} `
              + `"${titleOf(anchor.from)}" no longer pairs with number `
              + `${unit.sides.canonical[anchor.toIndex]!.number}: ${reason}`
              + (entry.hit ? ` (best ${entry.hit.best.toFixed(3)} second ${entry.hit.second.toFixed(3)})` : ''))
          }
        }
      }
      const total = [...reasons.values()].reduce((sum, count) => sum + count, 0)
      say(`${scorer.name} f${floor.toFixed(2)} m${margin.toFixed(2)}: ${total} exact agreements lost: `
        + ([...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count} ${reason}`).join(', ') || 'none'))
      for (const line of examples) say(line)
    }
    expect(state.exactAgree.size).toBeGreaterThan(0)
  }, 900_000)
})

describe('anchor corpus: the adjacent episode hazard', () => {
  it('measures how often a title scores above each floor against its own neighbour', async () => {
    const episodes = loadDumpEpisodes()
    const lists = new Map<string, DumpEpisode[]>()
    for (const episode of episodes) lists.set(episode.mediaUri, [...lists.get(episode.mediaUri) ?? [], episode])

    say('')
    say('## The adjacent episode hazard, over the whole recorded page')
    say('')
    const titled = episodes.filter(episode => episode.keys.length).length
    say(`${episodes.length} episode rows from ${lists.size} media lists in ${ANSWERS_PATH}; `
      + `${titled} carry a usable non generic title key and ${episodes.length - titled} do not, `
      + `which is the population the hazard can be measured on at all`)

    for (const scorer of SCORERS) {
      let pairs = 0
      let selfChecked = 0
      const atFloor = new Map<number, number>()
      const atBestOther = new Map<number, number>()
      const withinMargin = new Map<number, number>()
      const byOrigin = new Map<string, { pairs: number, over: number }>()
      for (const list of lists.values()) {
        const ordered = [...list]
          .filter(episode => episode.number !== null && episode.keys.length)
          .sort((a, b) => a.number! - b.number! || compare(a.uri, b.uri))
        for (let index = 0; index < ordered.length; index += 1) {
          const row = ordered[index]!
          const self = await bestBetween(row.keys, row.keys, scorer)
          expect(self, `${scorer.name} self score of ${row.uri}`).toBeCloseTo(1, 3)
          selfChecked += 1
          const neighbours = [ordered[index - 1], ordered[index + 1]].filter(Boolean) as DumpEpisode[]
          if (!neighbours.length) continue
          let best = 0
          for (const neighbour of neighbours) best = Math.max(best, await bestBetween(row.keys, neighbour.keys, scorer))
          let bestOther = 0
          for (const other of ordered) {
            if (other.uri === row.uri) continue
            bestOther = Math.max(bestOther, await bestBetween(row.keys, other.keys, scorer))
          }
          pairs += 1
          const origin = byOrigin.get(row.origin) ?? { pairs: 0, over: 0 }
          origin.pairs += 1
          if (best >= 0.34) origin.over += 1
          byOrigin.set(row.origin, origin)
          for (const floor of FLOORS) {
            if (best >= floor) atFloor.set(floor, (atFloor.get(floor) ?? 0) + 1)
            if (bestOther >= floor) atBestOther.set(floor, (atBestOther.get(floor) ?? 0) + 1)
          }
          for (const margin of MARGINS) {
            // the collateral of the margin: an EXACT anchor scores 1.0, so a neighbour at or above
            // 1 - margin refuses the true anchor the exact test would have taken
            if (best >= 1 - margin) withinMargin.set(margin, (withinMargin.get(margin) ?? 0) + 1)
          }
        }
      }
      say('')
      say(`### ${scorer.name}: ${pairs} rows with at least one titled neighbour, ${selfChecked} self scores at 1.0`)
      say('')
      say('| floor | rows whose NEIGHBOUR scores at or above it | rows where ANY other row of the list does |')
      say('| --- | --- | --- |')
      for (const floor of FLOORS) {
        const near = atFloor.get(floor) ?? 0
        const any = atBestOther.get(floor) ?? 0
        say(`| ${floor.toFixed(2)} | ${near} (${(100 * near / Math.max(pairs, 1)).toFixed(1)}%) `
          + `| ${any} (${(100 * any / Math.max(pairs, 1)).toFixed(1)}%) |`)
      }
      say('')
      say(`by origin, at floor 0.34: `
        + [...byOrigin.entries()].sort((a, b) => b[1].pairs - a[1].pairs)
          .map(([origin, counts]) => `${origin} ${counts.over}/${counts.pairs}`).join(', '))
      say('')
      say('margin collateral, the rows whose own neighbour is within the margin of an exact 1.0 and '
        + 'whose true exact anchor the margin would therefore refuse:')
      for (const margin of MARGINS) {
        const hit = withinMargin.get(margin) ?? 0
        say(`  margin ${margin.toFixed(2)}: ${hit} rows (${(100 * hit / Math.max(pairs, 1)).toFixed(2)}%)`)
      }
      expect(pairs).toBeGreaterThan(500)
    }
  }, 900_000)

  it('control: the hazard scan reports a hit on a list whose neighbours are near duplicates', async () => {
    const synthetic: DumpEpisode[] = [
      { uri: 'x:1', origin: 'x', mediaUri: 'x:0', number: 1, keys: ['rage mad dog'] },
      { uri: 'x:2', origin: 'x', mediaUri: 'x:0', number: 2, keys: ['howl mad dog'] },
    ]
    for (const scorer of SCORERS) {
      const score = await bestBetween(synthetic[0]!.keys, synthetic[1]!.keys, scorer)
      expect(score, `${scorer.name} on a near duplicate neighbour`).toBeGreaterThanOrEqual(FLOORS[0])
      say(`control: ${scorer.name} scores a near duplicate neighbour at ${score.toFixed(3)}, above the loosest floor`)
    }
  })
})

describe('anchor corpus: the report', () => {
  it('writes the report where a later agent can read it without rerunning', () => {
    mkdirSync(OUT_DIR, { recursive: true })
    const reportPath = resolve(OUT_DIR, 'anchor-corpus.md')
    writeFileSync(reportPath, `${report.join('\n')}\n`)
    writeFileSync(resolve(OUT_DIR, 'anchor-corpus.json'), `${JSON.stringify({
      floors: FLOORS,
      margins: MARGINS,
      units: state.units.length,
      exactAgreements: state.exactAgree.size,
      cells: state.cells,
      contradictions: state.contradictions,
    }, null, 2)}\n`)
    say(`report written to ${reportPath}`)
    expect(existsSync(reportPath)).toBe(true)
  })
})
