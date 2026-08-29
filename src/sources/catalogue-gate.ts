// The gate a metadata catalogue's search hit must clear before it may be linked, mirroring the one
// crunchyroll/extractor.ts already ships. JustWatch uses it.
//
// APPLE TV DELIBERATELY DOES NOT, and the reason is a precondition rather than a preference. This gate
// matches a SEASON cluster to a catalogue's SHOW entry, which is correct only where the source then
// mints a SEASON-scoped id: JustWatch has `jwId(objectId, seasonObjectId)` and crunchyroll has
// `crunchyrollId(seriesId, seasonId)`. Apple TV mints `id: content.id`, the show's id with no season
// component (appletv/extractor.ts, normalizeTitle), so linking two season clusters to one show hands
// both of them the SAME `appletv:<id>` and union-find welds them. Verified against the real store:
// two Mushoku Tensei clusters three years apart came back as one component, and this path is a HANDLE
// link, so not one of the season vetoes in worker/store/fuzzy-merge.ts is even consulted. Adding
// appletv to SHOW_LEVEL_ORIGINS does not help; db.ts tests the handle side only and Apple TV emits
// itself as the mediaUri. Wiring Apple TV up therefore means season-scoping its ids and its episode
// list first, which is its own change. The Apple TV rows in the table below are the measurement that
// was taken before that was understood; they are kept because they are still the numbers that change
// will be judged against.
//
// Split into its own module, importing only ./utils and ./season, so it can be tested: an extractor
// pulls in the player components and, through them, a CommonJS `require('react')` that no resolve
// alias intercepts, so no extractor can be imported under vitest. ./season.ts exists for the same
// reason.

import { bestTitleScore, simplifyTitle } from './utils'

/**
 * TWO INDEPENDENT AXES, and both must agree. Same shape, same constants and the same threshold as
 * crunchyroll/extractor.ts, because it is the same scale computed by the same function and this whole
 * calibration exists because one threshold drifted out of step with another at a different call site.
 *
 *   TITLE decides the FRANCHISE. `bestTitleScore` runs `franchiseTitle` (sacha) on both sides, so
 *   season markers come off, and takes the max over EVERY title the cluster knows rather than only
 *   its first.
 *
 *   DATE decides the SEASON, and it has to be read at SEASON level. See the two functions below.
 *
 * WHY NEITHER AXIS ALONE SHIPS, measured over the whole manami anime-offline-database with
 * `npm run calibrate`: 243194 correct-match pairs built from record synonyms, 139507 wrong-match pairs
 * built from relatedAnime, run through these exact exported functions, full uncapped populations.
 *
 *   gate                                            recall     wrong links passed
 *   what JustWatch shipped before                   28.085%    28.793%   (first title only, raw, 0.50)
 *   whole title list + franchiseTitle, no date      35.175%     5.116%   (0.90)
 *   the same, plus the season-level date axis       34.702%     1.062%   (JustWatch, 0.90)
 *   the same, plus a 45 day window                  34.408%     0.848%   (Apple TV, NOT wired up, upper bound)
 *
 * So the date axis is worth 4.8 points of wrong links at unchanged recall, and against what shipped it
 * is a 27x reduction in wrong links with recall going UP.
 *
 * THE FLOOR IS WHY THE DATE AXIS IS NOT OPTIONAL, and it is the number to read before anyone
 * "simplifies" it away. With the title axis alone, 5583 of the 139507 wrong pairs (4.002%) pass at
 * threshold 1.00: they are EXACTLY equal after season stripping, so no similarity number anywhere in
 * the 0..1 range can refuse them. Those are sequels and remakes collapsed onto their parent, and a
 * wrong link here is permanent: `graph.link` is a union-find union with no inverse, so the two shows
 * stay welded for the session and the merged cluster then goes on to weld a third. The date axis is
 * the only thing that touches that floor:
 *
 *   season-level year membership (JustWatch)   4.002% -> 0.825%   removes 4432 of 5583
 *   season-level 45 day window (Apple TV)      4.002% -> 0.695%   removes 4614 of 5583 (upper bound)
 *
 * WHY 0.90 AND NOT 0.50. Raising it to 0.94 refuses 208 more wrong links and costs 13046 correct ones,
 * a ratio of 0.016 against this repo's own exchange-rate bar of 1.0. Lowering it to 0.85 leaves 714
 * wrong links above the floor against 331 at 0.90, so the marginal safety per step collapses right
 * around 0.90. 0.90 is safe ONLY because the date axis is there: the same 0.90 without it sits at
 * 5.116%.
 *
 * KNOWN REGRESSION, named rather than summarised. Moving from 0.50 to 0.90 costs 29665 links across
 * the whole correct arm while recovering 46042, net +16377. Only 251 of the losses are season-to-show
 * pairs; the rest are near-miss spelling variants scoring in [0.50, 0.90), mostly diacritics and
 * punctuation ("!NVADE SHOW!" against "Invade Show!" at 0.8800). One is worth naming because it
 * passes today and does not here: "Ace of the Diamond act II" against "Ace of Diamond" scores 0.5114
 * both before and after, because sacha does not read "act II" as a season marker so `franchiseTitle`
 * returns the string unchanged. Fixing that belongs in SEASON_MARKER and sacha's coverage, not in
 * holding this threshold down.
 */
export const CONFIDENT_TITLE_THRESHOLD = 0.9


/**
 * How many catalogue entries are worth spending a detail request on, and how many query rungs are
 * worth searching. Both mirror crunchyroll's MAX_SERIES_CANDIDATES and MAX_SEARCH_QUERIES.
 *
 * A franchise is routinely split across several catalogue entries, so the runners-up are date-checked
 * too rather than only the top scorer, but the list is capped because each survivor costs a detail
 * request and, at Apple TV, an episode request per season on top of it.
 */
export const MAX_CATALOGUE_CANDIDATES = 3
export const MAX_SEARCH_QUERIES = 4

/**
 * The queries to try, most specific first, capped.
 *
 * Deliberately built from the cluster's PRIMARY title only, while the title axis below scores against
 * every title the cluster knows. The two are separate on purpose: a shorter query is how a catalogue
 * is made to return the entry at all, and which rung found a candidate says nothing about whether the
 * candidate is the right show. Scoring the rung instead of the cluster is what both of these sources
 * did before, and it measured 0.0765 margin against 0.0971 for scoring the original, so the rung was
 * actively worse than doing nothing.
 */
export const searchQueries = (primary: string): string[] =>
  [...new Set([primary, ...simplifyTitle(primary)])].slice(0, MAX_SEARCH_QUERIES)

export type ScoredCandidate<T> = { candidate: T, score: number }

/**
 * Every candidate the title axis admits, best first, capped.
 *
 * Returning them ranked rather than returning the first over the line is worth more than the
 * threshold move at Apple TV, which took whichever passing candidate the catalogue happened to list
 * first. Measured over the media where both a correct and a wrong candidate clear the gate: at the
 * shipped gate, 913 such media, of which taking the best welds 274 (30.011%) while taking the first
 * welds 544.3 in expectation under a uniform ordering (59.618%) and 913 at worst. At this gate, 106
 * such media, best welds 2 (1.887%) against 50.4 expected for first (47.519%).
 *
 * Apple's result order is not reproducible from the corpus, so the "first" figures are a uniform draw
 * with both extremes printed beside them, while the "best" figures are a measured argmax that assumes
 * no ordering at all.
 */
export const rankByTitle = async <T>(
  knownTitles: readonly string[],
  candidates: readonly T[],
  titleOf: (candidate: T) => string | null | undefined
): Promise<ScoredCandidate<T>[]> => {
  const scored = await Promise.all(
    candidates.map(async candidate => {
      const title = titleOf(candidate)
      return { candidate, score: title ? await bestTitleScore(knownTitles, title) : 0 }
    })
  )
  return scored
    .filter(entry => entry.score >= CONFIDENT_TITLE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CATALOGUE_CANDIDATES)
}

const parseDate = (value: string | number | null | undefined): Date | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const date = new Date(value)
  return isNaN(date.getTime()) ? undefined : date
}


/**
 * Whether our start date's year is one of the years this show's SEASONS carry.
 *
 * Membership, not equality, and the distinction is the whole finding. A show-level year compares our
 * season's start against the FRANCHISE's first season, so it refuses the season-to-parent links this
 * gate exists to recover. Recall on the 4322 related-same-show pairs, the only arm where the date
 * axis's cost is visible at all:
 *
 *   show-level same year          admits 16.543%
 *   show-level adjacent quarter   admits  6.733%
 *   season-level year membership  admits 93.221%
 *
 * Those three reproduce from `npm run calibrate` as combined title-and-date recall at saturation on
 * that arm. An earlier draft of this comment carried 16.728 / 6.779 / 94.470, which were a different
 * measurement and do not come back from the harness; the ordering and the size of the gap are the same
 * either way, but a number in a comment has to be one someone can re-derive.
 *
 * Comparing our media's start date against JustWatch's `content.originalReleaseYear` would be the
 * single most damaging way to build this, and it is also the obvious one, which is why it is written
 * down here.
 *
 * Year granularity costs almost nothing once it is read at season level, so this is a finding and not
 * a concession JustWatch has to apologise for. Against the finer quarter-level axis on the same pairs:
 * floor 0.825% against 0.695%, wrong links at 0.90 1.062% against 0.848%, and the genuine recall cost
 * on the same-show arm is identical, 64 disagreements against 65.
 *
 * Anything missing is a refusal: no start date, no season years, or every season year null, and the
 * candidate does not link.
 */
export const yearAppearsInShow = (
  startDate: string | null | undefined,
  seasonYears: readonly (number | null | undefined)[]
): boolean => {
  const year = parseDate(startDate)?.getUTCFullYear()
  if (year === undefined) return false
  return seasonYears.some(seasonYear => seasonYear === year)
}


