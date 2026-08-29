// The gate a metadata catalogue's search hit must clear before it may be linked, mirroring the one
// crunchyroll/extractor.ts already ships. JustWatch and Apple TV both use it.
//
// APPLE TV NEEDED A PRECONDITION FIRST, recorded here because the next catalogue source will need the
// same one. This gate matches a SEASON cluster to a catalogue's SHOW entry, which is correct only
// where the source then mints a SEASON-scoped id: JustWatch has `jwId(objectId, seasonObjectId)` and
// crunchyroll has `crunchyrollId(seriesId, seasonId)`. Apple TV used to mint `id: content.id`, the
// show's id with no season component, so linking two season clusters to one show handed both of them
// the SAME `appletv:<id>` and union-find welded them. Verified against the real store: two Mushoku
// Tensei clusters three years apart came back as one component, and this path is a HANDLE link, so
// not one of the season vetoes in worker/store/fuzzy-merge.ts is even consulted. Adding appletv to
// SHOW_LEVEL_ORIGINS does not help; db.ts tests the handle side only and Apple TV emits itself as the
// mediaUri. So appletv/extractor.ts now mints `seasonScopedId(content.id, seasonNumber)` and scopes
// its episode list and its start date to that one season, and only then reads this gate. The Apple TV
// rows in the table below were measured before that was understood; they are the numbers this change
//
// WHAT SEASON SCOPING BOUNDS BUT DOES NOT ELIMINATE. Two of our clusters that both clear the title
// axis and both fall within the date window of the SAME catalogue season still receive the identical
// season-scoped id, and union-find welds them at upsert. That is a handle link, so none of the season
// mechanisms in worker/store/fuzzy-merge.ts is consulted, exactly as before; what changed is the size
// of the class, from "every season of a show" to "two clusters inside one 45 day window of one
// season". It is the residue of matching a season cluster to a catalogue that models shows, and it
// cannot be closed here: the gate has one candidate and no view of the other cluster.
// is judged against.
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
 *   the same, plus a 45 day window                  34.408%     0.848%   (Apple TV, 0.90, MODELLED)
 *
 * THE APPLE TV ROW IS A MODEL OF A CATALOGUE, NOT A MEASUREMENT OF APPLE'S. Every row here is computed
 * over the manami corpus, which is the right way to compare the two axes against each other and says
 * nothing about what a given catalogue actually returns. Measured against the UTS search endpoint this
 * extractor really queries, 2026-08-30: 0 of 150 anime TV titles and 0 of 120 anime films produced ANY
 * candidate clearing 0.90, while 88 and 69 of them returned items at all, and a positive control
 * ("Severance") is admitted at 1.0000. So the gate is live and correct and Apple's search simply does
 * not surface these shows under these titles. Read the row as what the gate would do if a candidate
 * arrived, never as links this source is producing. The corpus rows also count welds on a
 * title-plus-synonym pool, which over-counts relative to the main titles stub carries, so the weld
 * column is an upper bound in a second way as well.
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
 *   season-level 45 day window (Apple TV)      4.002% -> 0.695%   removes 4614 of 5583
 *
 * Both date rows model a source that publishes a per-season date. JustWatch does, as a year. Apple TV
 * does, as a day, and that it really does is measured under SEASON_DATE_WINDOW below rather than
 * assumed: 0 of 150 seasons came back without one.
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


/**
 * The widest gap between our start date and a catalogue season's premiere that still names the same
 * season. The same 45 days crunchyroll/extractor.ts uses, and it produces the "plus a 45 day window"
 * row of the table above: 34.408% recall at 0.848% wrong links, against 34.702% / 1.062% for the year
 * membership axis JustWatch is limited to.
 *
 * A source may only read this axis if it has a real SEASON-level date to read, and Apple TV does, in
 * the same `/shows/<id>` response the gate already holds: every entry of `data.seasons` carries its
 * own `releaseDate`.
 *
 * THE UNITS ARE EPOCH MILLISECONDS, established from the values rather than assumed, because a
 * seconds-based field read as milliseconds lands in 1970 and no January 1 precision guard would catch
 * it. `Severance` season 1 comes back as 1645142400000, which is 2022-02-18, its real premiere; as
 * seconds it would be 1970-01-20. Re-derivable in one request:
 *
 *   curl -s 'https://uts-api.itunes.apple.com/uts/v3/shows/umc.cmc.1srk2goyh2q2zdxcx605w8vtx?caller=web&sf=143441&v=58&pfm=web&locale=en-US&utsk=0'
 *
 * which also shows season 2 at 1737072000000, 2025-01-17, against a show-level `content.releaseDate`
 * of 1645142400000: the show's date IS season 1's.
 *
 * Measured 2026-08-29 over the 150 seasons of the 83 shows UTS search returns for 28 Apple TV series
 * titles, one `/shows/<id>` plus one episode request per season: 0 seasons missing `seasonNumber`, 0
 * missing `releaseDate`, and a season's `releaseDate` equalled the earliest release date among that
 * season's OWN episodes on 150 of 150. The show-level date named the wrong year for 66 of the 150
 * (44.000%), and for 66 of the 106 (62.264%) once single-season shows are dropped.
 */
export const SEASON_DATE_WINDOW = 45 * 24 * 60 * 60 * 1000

/**
 * The candidate season whose premiere is nearest our start date, and how far off it is.
 *
 * DISTANCE rather than membership, which is the one thing Apple TV can do that JustWatch cannot: a
 * JustWatch season carries a year and nothing finer, so `yearAppearsInShow` can only answer yes or no,
 * while an Apple TV season carries a day. The window is applied by the caller, because the diff is
 * also what ranks two candidates that both pass it.
 *
 * Anything missing is a refusal: no start date, no seasons, or no season carrying a date, and this
 * returns undefined rather than a nearest-of-nothing.
 */
export const closestSeasonByAirDate = <T>(
  startDate: string | number | null | undefined,
  seasons: readonly T[],
  releaseDateOf: (season: T) => string | number | null | undefined
): { season: T, diff: number } | undefined => {
  const target = parseDate(startDate)
  if (!target) return undefined
  let best: { season: T, diff: number } | undefined
  for (const season of seasons) {
    const aired = parseDate(releaseDateOf(season))
    if (!aired) continue
    const diff = Math.abs(aired.getTime() - target.getTime())
    if (!best || diff < best.diff) best = { season, diff }
  }
  return best
}

export type GatedCandidate<T, S> = { candidate: T, season: S, diff: number }

/**
 * Both axes, composed exactly as a caller must compose them, so the composition is the thing under
 * test rather than a reproduction of it in a test file.
 *
 * The order is load bearing and it is a cost decision as much as a correctness one: `rankByTitle` runs
 * entirely on the search payload, so `seasonsOf` (a detail request, per candidate) is never spent on a
 * candidate the title axis already refused.
 *
 * THE BEST WINS, NEVER THE FIRST TO PASS: see `rankByTitle` for what that was worth at Apple TV, which
 * took whichever passing candidate the catalogue happened to list first. The ranking here is by DATE
 * distance rather than by title score, and that is not a second opinion about the franchise: the title
 * axis has already reduced every survivor to the same one, so the only question left is which season,
 * and the diff is the only thing that answers it. Crunchyroll's search path resolves a tie the same
 * way, over the same window.
 */
export const pickGatedCandidate = async <T, S>(
  known: { titles: readonly string[], startDate?: string | null },
  candidates: readonly T[],
  titleOf: (candidate: T) => string | null | undefined,
  seasonsOf: (candidate: T) => Promise<readonly S[]>,
  releaseDateOf: (season: S) => string | number | null | undefined
): Promise<GatedCandidate<T, S> | undefined> => {
  // no start date is no date axis, and a gate running on one axis is the 4.002% floor of permanent
  // wrong links with nothing left to catch it
  if (!known.startDate) return undefined
  const scored = await rankByTitle(known.titles, candidates, titleOf)
  let best: GatedCandidate<T, S> | undefined
  for (const { candidate } of scored) {
    const nearest = closestSeasonByAirDate(known.startDate, await seasonsOf(candidate), releaseDateOf)
    if (!nearest || nearest.diff > SEASON_DATE_WINDOW) continue
    if (!best || nearest.diff < best.diff) best = { candidate, season: nearest.season, diff: nearest.diff }
  }
  return best
}


