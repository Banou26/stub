// The evidence rules behind `similarMedia`, in ONE module every answering source goes through.
//
// A season number is a guess: no two catalogues number a show's seasons the same way (Netflix folds
// two cours into one season, JustWatch numbers by its own list, anime metadata says "Season 2 Part 2"),
// so a season-scoped id minted by ordinal is a guess wearing a precise uri, and the store unions it
// with no inverse. What may go on a union is VERIFIED sameness, and this module is where verification
// is defined: a caller describes its run, a source describes its seasons, and the pick below either
// establishes one season or refuses.
//
// The rules decide WHICH season of a show and never WHICH show: the show id the caller holds settles
// that, and it came off a PART_OF edge whose container cluster the fuzzy title pass may have unioned
// on a listing. A wrong container union upstream is trusted here, so a pick is only as right as it.
//
// Imports only the pure season helpers, `stripTitle` and the shared 45 day window, so it loads under
// vitest and inside every extractor alike.
import { SEASON_DATE_WINDOW } from './catalogue-gate'
import { namesADay, parseSeasonNumber } from './season'
import { stripTitle } from './utils'

/** What a caller knows about ITS run. Every field optional; `hasEvidence` says whether any is usable. */
export type RunEvidence = {
  startDate?: string | null
  titles?: readonly string[] | null
  episodeCount?: number | null
  episodeTitles?: readonly string[] | null
}

/** One season of the answering source, described with whatever that source can see without guessing. */
export type SeasonCandidate<T> = {
  season: T
  seasonNumber?: number | null
  episodeCount?: number | null
  /** the season's own premiere: an ISO string or epoch milliseconds */
  premiere?: string | number | null
  /** the season's year when that is all the source knows; read as a veto, never as a match */
  year?: number | null
  episodeTitles?: readonly string[] | null
}

export type SimilarRule = 'date' | 'episode-titles' | 'ordinal' | 'year' | 'first'
export type SimilarVerdict<T> = { season: T, rule: SimilarRule }

/**
 * The share of a candidate season's real episode titles our run must carry to be that season.
 *
 * Measured against the CANDIDATE, so a fold of two equal cours scores 12/24 = 0.50 and a fold of 13
 * and 12 scores 0.52 or 0.48, all refused even when our count is unknown and the fold veto cannot
 * fire; a season with a four episode bonus block folded in scores 12/16 = 0.75 and is admitted, since
 * a bonus block is not a run. The recall cost of title drift between translations is unmeasured.
 */
export const EPISODE_TITLE_COVERAGE = 0.6
/** One shared title ("The Beginning", a recap name) is a coincidence; three is not. */
export const MIN_EPISODE_TITLE_MATCHES = 3

const parseTime = (date: string | number | null | undefined): number | undefined => {
  if (date == null || date === '') return undefined
  const time = typeof date === 'number' ? date : Date.parse(date)
  return Number.isNaN(time) ? undefined : time
}

const yearOf = (date: string | number | null | undefined): number | undefined => {
  const time = parseTime(date)
  return time === undefined ? undefined : new Date(time).getUTCFullYear()
}

/** Whether a caller said anything a season could be matched against. */
export const hasEvidence = ({ startDate, titles, episodeCount, episodeTitles }: RunEvidence): boolean =>
  Boolean(startDate && !Number.isNaN(Date.parse(startDate)))
  || Boolean(titles?.length)
  || episodeCount != null
  || Boolean(episodeTitles?.length)

// 'Part 2', 'Part II', 'Part Two', 'Cour 3'; '2nd Part', 'Second Cour', 'Final Part', 'Second Half'.
// AniList, MAL and kitsu spell parts with digits; synonyms and other catalogues spell them out.
const PART_NUMBERED = /\b(?:part|cour)\s*(?:\d{1,3}|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
const PART_ORDINAL = /\b(?:\d{1,3}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|last)\s+(?:part|cour|half)\b/i

/**
 * A title naming a PART or a COUR. A part number is a position inside a season and maps to no
 * catalogue's season list, which is the owner's "season 2 part 3, season 2 part 4".
 */
export const namesAPart = (title: string): boolean => PART_NUMBERED.test(title) || PART_ORDINAL.test(title)

/** Every season ordinal the titles carry. More than one means the titles disagree. */
export const seasonOrdinals = (titles: readonly string[] | null | undefined): Set<number> =>
  new Set((titles ?? []).map(parseSeasonNumber).filter((n): n is number => n != null))

const GENERIC_EPISODE = /^(?:episode|ep|e|part|chapter|第)?\s*\d+\s*(?:話|集|화)?$/
const HAS_LETTER = /\p{L}/u

/** 'Episode 12', '第3話', '7': a title that names a position and never an episode. */
export const isGenericEpisodeTitle = (title: string): boolean => {
  const stripped = stripTitle(title)
  return !HAS_LETTER.test(stripped) || GENERIC_EPISODE.test(stripped)
}

/**
 * The date to describe a run with, out of its members' dates ordered by score descending: the first
 * one naming a DAY, else the first non-empty one. A day-precise date is worth more than a
 * higher-scored `YYYY-01-01`, since only a day can be measured against a 45 day window.
 */
export const bestRunStartDate = (dates: readonly (string | null | undefined)[]): string | undefined =>
  dates.find(date => namesADay(date)) ?? dates.find((date): date is string => Boolean(date))

/**
 * Whether an answer is a RUN of the asked origin, and never the show itself. A source answering with
 * its bare show id is refused whatever scope it stamped, because that id is every season at once.
 */
export const isRunAnswerFrom = (
  origin: string,
  showId: string,
  answer: { origin: string, id: string, scope?: string | null }
): boolean => answer.origin === origin && answer.scope !== 'CONTAINER' && answer.id !== showId

const candidateYear = <T>(candidate: SeasonCandidate<T>): number | undefined =>
  candidate.year ?? yearOf(candidate.premiere)

// A season listing ZERO episodes (announced, or a listing this region cannot see) has no length, and
// read as a length it fit under every run's count: two runs two years apart both took a crunchyroll
// season whose episodes payload was empty (2026-09-05).
const countOf = <T>(candidate: SeasonCandidate<T>): number | undefined => candidate.episodeCount || undefined

// A season holding MORE episodes than the run holds other runs too (Netflix season 2 = 25 over 13 and
// 12). Zero tolerance, the same allowance season.ts measured as the only one worth having.
const foldVetoed = <T>(evidence: RunEvidence, candidate: SeasonCandidate<T>): boolean => {
  const theirs = countOf(candidate)
  return theirs != null && evidence.episodeCount != null && theirs > evidence.episodeCount
}

// A season dated another year is not our run, whatever else fits: this closes the sequel with no
// ordinal, a "Show II" of 12 episodes in 2024 that would otherwise take season 1 of 12 from 2022.
const yearVetoed = <T>(evidence: RunEvidence, candidate: SeasonCandidate<T>): boolean => {
  const theirs = candidateYear(candidate)
  const ours = yearOf(evidence.startDate)
  return theirs != null && ours != null && theirs !== ours
}

const realTitles = (titles: readonly string[] | null | undefined): string[] =>
  (titles ?? []).filter(title => !isGenericEpisodeTitle(title))

/**
 * The one season of a show that the evidence establishes as the caller's run, or undefined.
 *
 * The rules run in order; a rule that does not apply falls to the next, and a rule that applies but
 * finds nothing unambiguous REFUSES outright. Every rule picks over ALL candidates and only then
 * checks the vetoes on its pick: a vetoed pick is a refusal, never a fall-through to the next best
 * candidate, because that fall-through is precisely how season 1 of Mushoku Tensei reached Netflix
 * season 3 once season 1 was excluded. The FOLD veto applies to every rule; the YEAR veto to every
 * rule but the date, which is finer than a year and legitimately crosses a New Year.
 */
export const pickSimilarSeason = <T>(
  evidence: RunEvidence,
  candidates: readonly SeasonCandidate<T>[]
): SimilarVerdict<T> | undefined => {
  const titles = evidence.titles ?? []
  const partNamed = titles.some(namesAPart)
  const ordinals = seasonOrdinals(titles)
  const evidenceYear = yearOf(evidence.startDate)

  // Rule 1, DATE: a premiere within the window of a day-precise start. Zero within means the
  // catalogues disagree about when this run started; two within is two parts released together.
  const start = namesADay(evidence.startDate) ? parseTime(evidence.startDate) : undefined
  if (start !== undefined && candidates.some(candidate => parseTime(candidate.premiere) !== undefined)) {
    const within = candidates.filter(candidate => {
      const premiere = parseTime(candidate.premiere)
      return premiere !== undefined && Math.abs(premiere - start) <= SEASON_DATE_WINDOW
    })
    if (within.length !== 1 || foldVetoed(evidence, within[0]!)) return undefined
    return { season: within[0]!.season, rule: 'date' }
  }

  // Rule 2, EPISODE TITLES: decisive both ways. Two catalogues carrying three or more real episode
  // titles each for one run agree on most of them; two runs of one show share none.
  const ours = new Set(realTitles(evidence.episodeTitles).map(stripTitle))
  if (ours.size >= MIN_EPISODE_TITLE_MATCHES) {
    const titled = candidates
      .map(candidate => ({ candidate, theirs: realTitles(candidate.episodeTitles) }))
      .filter(({ theirs }) => theirs.length >= MIN_EPISODE_TITLE_MATCHES)
    if (titled.length) {
      const passing = titled.filter(({ theirs }) => {
        const matched = theirs.filter(title => ours.has(stripTitle(title))).length
        return matched >= MIN_EPISODE_TITLE_MATCHES && matched / theirs.length >= EPISODE_TITLE_COVERAGE
      })
      if (passing.length !== 1) return undefined
      const pick = passing[0]!.candidate
      if (foldVetoed(evidence, pick) || yearVetoed(evidence, pick)) return undefined
      return { season: pick.season, rule: 'episode-titles' }
    }
  }

  // Rule 3, ORDINAL WITH COUNT. Disagreeing titles refuse outright. A part marker makes the ordinal
  // unusable here: "Season 2 Part 3" of 12 episodes would otherwise take the provider's season 2
  // whenever that happens to hold 12 or fewer.
  if (ordinals.size > 1) return undefined
  if (ordinals.size === 1 && !partNamed && evidence.episodeCount != null) {
    const [ordinal] = ordinals
    const matches = candidates.filter(candidate => candidate.seasonNumber === ordinal)
    if (matches.length > 1) return undefined
    if (matches.length === 1 && countOf(matches[0]!) != null) {
      const pick = matches[0]!
      if (foldVetoed(evidence, pick) || yearVetoed(evidence, pick)) return undefined
      return { season: pick.season, rule: 'ordinal' }
    }
  }

  // Rules 4 and 5 read a run whose titles name NO season and no part, with a count. A part is a
  // position inside a season, and a title naming season N is never placed on season M by a year or by
  // being first: with a lone first season of 11 in 2021, 'Show', 'Show Part 2' and 'Show 2nd Season'
  // all answered season 1 by year (2026-09-05), three runs on one Netflix season.
  const unnumberedWithCount = ordinals.size === 0 && !partNamed && evidence.episodeCount != null

  // Rule 4, YEAR: the one season dated our year, holding no more episodes than our run. Two cours in
  // one year cannot be told apart by a year, and none in our year leaves the pick to the first-season
  // rule, whose year veto refuses. A season whose length is unknown cannot be shown not to be a fold,
  // so the one season dated our year with no count is a refusal, never a pick (Apple offers no
  // counts, JustWatch lists a season as 0 until it airs).
  if (unnumberedWithCount && evidenceYear != null && candidates.some(candidate => candidateYear(candidate) != null)) {
    const dated = candidates.filter(candidate => candidateYear(candidate) === evidenceYear)
    if (dated.length === 1) {
      const pick = dated[0]!
      if (countOf(pick) == null || foldVetoed(evidence, pick)) return undefined
      return { season: pick.season, rule: 'year' }
    }
  }

  // Rule 5, FIRST: only ever the first season, so season 1 (11) against 24, 25, 11 is refused at
  // 24 !== 11 rather than finding the 11 further down. A lone season shorter than our run is a season
  // still listing (most of the homepage); with several seasons a shorter first season may be one half
  // of our run (the Fullmetal Alchemist split), so only exactness counts.
  if (unnumberedWithCount) {
    const numbered = candidates.filter(candidate => candidate.seasonNumber != null)
    const first =
      candidates.length === 1 ? candidates[0]
      : numbered.length ? numbered.reduce((lowest, candidate) => candidate.seasonNumber! < lowest.seasonNumber! ? candidate : lowest)
      : undefined
    if (!first) return undefined
    if (foldVetoed(evidence, first) || yearVetoed(evidence, first)) return undefined
    const theirs = countOf(first)
    const fits =
      candidates.length === 1
        ? theirs != null && theirs <= evidence.episodeCount!
        : theirs === evidence.episodeCount
    return fits ? { season: first.season, rule: 'first' } : undefined
  }

  return undefined
}

const compareNumbers = (a: number, b: number) => a - b

/**
 * The question an ask puts, normalised, so two asks share one in-flight answer exactly when the rules
 * above would read them alike: the show, the day (kitsu's `YYYY-MM-DD`, anilist's `toUTCString` and a
 * templated `YYYY-01-01` of one day are one day), the count, the ordinals the titles agree on and
 * whether any names a part, and the real episode titles. The episode titles are IN the key because
 * Rule 2 is the only rule that tells apart two runs agreeing on all the rest (two same-year cours of
 * 12 with no ordinal): a second run joining the first's in-flight ask would take the first's season
 * with the right evidence in hand.
 */
export const similarAskKey = (origin: string, showId: string, evidence: RunEvidence): string => {
  const time = parseTime(evidence.startDate)
  const day = time === undefined ? '-' : new Date(time).toISOString().slice(0, 10)
  const titles = evidence.titles ?? []
  const ordinals = [...seasonOrdinals(titles)].sort(compareNumbers).join(',')
  const parts = titles.some(namesAPart) ? 'p' : ''
  const episodes = [...new Set(realTitles(evidence.episodeTitles).map(stripTitle))].sort().join('\u0001')
  return [origin, showId, day, evidence.episodeCount ?? '-', ordinals, parts, episodes].join('\u0000')
}
