// The evidence rules, pinned against the weld they replace. Netflix's Mushoku Tensei folds several
// anime runs into each of its first two seasons (24 and 25 episodes) and its season 3 holds 11, the
// same count as anime season 1; a count-only match minted `nf:80987039-3` for season 1 while season 3
// took it by ordinal. Every case here is one way that guess used to get through, or a control that
// proves the rule still answers when the evidence is real.
import { expect, test } from 'vitest'

import {
  answerNamesOurShow,
  bestRunStartDate,
  describeEvidence,
  hasEvidence,
  isRunAnswerFrom,
  namesAPart,
  pickSimilarSeason,
  similarAskKey,
  SHOW_TITLE_THRESHOLD,
  type SeasonCandidate,
  printableToken,
} from '../../../src/sources/similar'

const episodeTitles = (season: number, count: number) =>
  Array.from({ length: count }, (_, i) => `S${season}E${i + 1}`)

/** Netflix's Mushoku Tensei: three seasons, titles for every episode, a year on the first only. */
const NF: SeasonCandidate<number>[] = [
  { season: 1, seasonNumber: 1, episodeCount: 24, episodeTitles: episodeTitles(1, 24), year: 2021 },
  { season: 2, seasonNumber: 2, episodeCount: 25, episodeTitles: episodeTitles(2, 25) },
  { season: 3, seasonNumber: 3, episodeCount: 11, episodeTitles: episodeTitles(3, 11) },
]

/** Crunchyroll's: every season dated. */
const CR: SeasonCandidate<number>[] = [
  { season: 1, seasonNumber: 1, premiere: '2021-01-11', episodeCount: 23 },
  { season: 2, seasonNumber: 2, premiere: '2023-07-09', episodeCount: 24 },
  { season: 3, seasonNumber: 3, premiere: '2026-07-04', episodeCount: 14 },
]

const SHOW = 'Mushoku Tensei: Jobless Reincarnation'

test('the coincidence: a run with no ordinal and 11 episodes is not the one season holding 11', () => {
  expect(pickSimilarSeason({ titles: [SHOW], episodeCount: 11 }, NF)).toBeUndefined()
})

test('the fold: a season holding more episodes than the run is never the answer', () => {
  expect(pickSimilarSeason({ titles: [`${SHOW} Season 2`], episodeCount: 13 }, NF)).toBeUndefined()
})

test('control: an agreed ordinal with a count the season does not exceed is that season', () => {
  expect(pickSimilarSeason({ titles: [`${SHOW} Season 3`], episodeCount: 14 }, NF)).toEqual({ season: 3, rule: 'ordinal' })
})

test('control: no ordinal and a count equal to the first season is the first season', () => {
  expect(pickSimilarSeason({ titles: ['Some Show'], episodeCount: 24 }, NF)).toEqual({ season: 1, rule: 'first' })
})

// The refusal is load bearing for the YEAR rule, which reads no ordinal: without it a run whose titles
// say two different seasons is placed by its year alone.
test('titles that disagree on the ordinal refuse', () => {
  expect(pickSimilarSeason({ titles: ['Show Season 2', 'Show Part 3'], episodeCount: 12 }, NF)).toBeUndefined()

  const dated: SeasonCandidate<number>[] = [
    { season: 2, seasonNumber: 2, episodeCount: 12, year: 2022 },
    { season: 3, seasonNumber: 3, episodeCount: 12, year: 2023 },
  ]
  expect(pickSimilarSeason({ titles: ['Show Season 2', 'Show Part 3'], episodeCount: 12, startDate: '2023-01-01' }, dated))
    .toBeUndefined()
})

test('a part marker makes the ordinal unusable', () => {
  const candidates: SeasonCandidate<number>[] = [
    { season: 2, seasonNumber: 2, episodeCount: 12 },
    { season: 3, seasonNumber: 3, episodeCount: 12 },
  ]
  expect(pickSimilarSeason({ titles: ['Show Season 2 Part 2'], episodeCount: 12 }, candidates)).toBeUndefined()
})

test('a day-precise date picks the run, and the date rule refuses rather than falling through', () => {
  expect(pickSimilarSeason({ startDate: '2026-07-04' }, CR)).toEqual({ season: 3, rule: 'date' })

  const close: SeasonCandidate<string>[] = [
    { season: 'a', seasonNumber: 1, premiere: '2026-07-04' },
    { season: 'b', seasonNumber: 2, premiere: '2026-07-14' },
  ]
  expect(pickSimilarSeason({ startDate: '2026-07-04' }, close), 'two parts released together').toBeUndefined()

  // the next cour, 91 days on, same year, same "Season 2" in its title: the ordinal and the count
  // would place it on season 2, and the date says it is not that run
  expect(
    pickSimilarSeason({ startDate: '2023-10-08', titles: ['Show Season 2'], episodeCount: 24 }, CR),
    'nothing within the window is a disagreement about when the run started, whatever the ordinal says'
  ).toBeUndefined()
})

test('a year-only date never reaches the window', () => {
  expect(pickSimilarSeason({ startDate: '2026-07-01', titles: [`${SHOW} Season 3`], episodeCount: 14 }, CR))
    .toEqual({ season: 3, rule: 'ordinal' })
})

test('a season dated another year is vetoed, and the one dated our year is picked', () => {
  expect(pickSimilarSeason({ startDate: '2026-01-01', titles: ['Show'], episodeCount: 24 }, NF)).toBeUndefined()

  const dated2026 = NF.map((candidate, index) => index === 0 ? { ...candidate, year: 2026 } : candidate)
  expect(pickSimilarSeason({ startDate: '2026-01-01', titles: ['Show'], episodeCount: 24 }, dated2026)?.season).toBe(1)
})

test('the date rule is exempt from the year veto: a run crossing a New Year is one run', () => {
  const candidates: SeasonCandidate<number>[] = [{ season: 1, seasonNumber: 1, premiere: '2023-12-29' }]
  expect(pickSimilarSeason({ startDate: '2024-01-05' }, candidates)).toEqual({ season: 1, rule: 'date' })
})

test('episode titles pick the season most of whose titles we carry, and refuse a fold', () => {
  const ours = episodeTitles(9, 12)
  const A: SeasonCandidate<string> = { season: 'A', seasonNumber: 1, episodeTitles: episodeTitles(8, 12) }
  const B: SeasonCandidate<string> = { season: 'B', seasonNumber: 2, episodeTitles: ours }
  expect(pickSimilarSeason({ episodeTitles: ours }, [A, B])).toEqual({ season: 'B', rule: 'episode-titles' })

  const fold: SeasonCandidate<string> = { season: 'F', seasonNumber: 1, episodeTitles: [...episodeTitles(8, 12), ...ours] }
  expect(pickSimilarSeason({ episodeTitles: ours }, [fold]), '12 of 24 is half a season, and a fold').toBeUndefined()

  const twin: SeasonCandidate<string> = { season: 'C', seasonNumber: 3, episodeTitles: ours }
  expect(pickSimilarSeason({ episodeTitles: ours }, [B, twin]), 'two seasons both covered is ambiguous').toBeUndefined()

  const generic = Array.from({ length: 12 }, (_, i) => `Episode ${i + 1}`)
  expect(
    pickSimilarSeason({ episodeTitles: generic, titles: ['Show Season 2'], episodeCount: 12 }, [A, { ...B, episodeCount: 12 }]),
    'generic titles are no evidence, so the rule does not apply and the ordinal decides'
  ).toEqual({ season: 'B', rule: 'ordinal' })
})

test('episode titles are decisive: a season sharing none of ours is refused whatever its number', () => {
  const candidates: SeasonCandidate<number>[] = [{ season: 3, seasonNumber: 3, episodeCount: 12, episodeTitles: episodeTitles(3, 12) }]
  expect(pickSimilarSeason({ episodeTitles: episodeTitles(7, 12), titles: ['Show Season 3'], episodeCount: 12 }, candidates)).toBeUndefined()
})

test('a lone season shorter than the run is a season still listing; with several, only exactness counts', () => {
  expect(pickSimilarSeason({ titles: ['Show'], episodeCount: 12 }, [{ season: 1, seasonNumber: 1, episodeCount: 5 }]))
    .toEqual({ season: 1, rule: 'first' })
  expect(pickSimilarSeason(
    { titles: ['Show'], episodeCount: 12 },
    [{ season: 1, seasonNumber: 1, episodeCount: 5 }, { season: 2, seasonNumber: 2, episodeCount: 12 }]
  )).toBeUndefined()
})

test('hasEvidence and isRunAnswerFrom refuse what they are meant to', () => {
  expect(hasEvidence({})).toBe(false)
  expect(hasEvidence({ startDate: 'not a date' })).toBe(false)
  expect(hasEvidence({ episodeCount: 12 })).toBe(true)

  expect(isRunAnswerFrom('cr', 'X', { origin: 'nf', id: 'X-3', scope: 'RUN' }), 'another origin').toBe(false)
  expect(isRunAnswerFrom('cr', 'X', { origin: 'cr', id: 'X-S3', scope: 'CONTAINER' }), 'a container').toBe(false)
  expect(isRunAnswerFrom('cr', 'X', { origin: 'cr', id: 'X', scope: 'RUN' }), 'the bare show id').toBe(false)
  expect(isRunAnswerFrom('cr', 'X', { origin: 'cr', id: 'X-S3', scope: 'RUN' })).toBe(true)
})

test('bestRunStartDate prefers the first date naming a day over a higher-ranked year', () => {
  expect(bestRunStartDate(['2026-01-01', '2026-07-04'])).toBe('2026-07-04')
  expect(bestRunStartDate(['2026-01-01'])).toBe('2026-01-01')
  expect(bestRunStartDate([])).toBeUndefined()
})

// Measured 2026-09-05 on the unogs self-link: Netflix listing one season of 11 (its first cour, year
// 2021) answered 'Show' 11, 'Show Part 2' 12 and 'Show 2nd Season' 12 alike, three of our runs on one
// season. The part and the ordinal made Rules 3 and 5 n/a and the year rule read neither.
test('the year rule reads no run whose titles name a part or a season the source lacks', () => {
  const firstCourOnly: SeasonCandidate<number>[] = [{ season: 1, seasonNumber: 1, episodeCount: 11, year: 2021 }]

  expect(pickSimilarSeason({ titles: ['Show Part 2'], episodeCount: 12, startDate: '2021-10-04' }, firstCourOnly), 'a part').toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Show 2nd Season'], episodeCount: 12, startDate: '2021-10-04' }, firstCourOnly), 'an ordinal with no such season').toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Show'], episodeCount: 11, startDate: '2021-01-11' }, firstCourOnly), 'the control: the first cour itself')
    .toEqual({ season: 1, rule: 'year' })
})

// Apple offers no counts and JustWatch lists an unaired season as 0: on those two runs of one year with
// any lengths both took the one season dated that year (2026-09-05). A year with no count on either
// side cannot show a season is not a fold, so it vetoes and never picks.
test('the year rule needs a count on both sides', () => {
  const countless: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 12, year: 2021 },
    { season: 2, seasonNumber: 2, year: 2023 },
  ]
  expect(pickSimilarSeason({ startDate: '2023-01-01', titles: ['A Show'], episodeCount: 12 }, countless), 'the season has no count').toBeUndefined()
  expect(pickSimilarSeason({ startDate: '2023-01-01', titles: ['A Show: Second Arc'], episodeCount: 8 }, countless)).toBeUndefined()

  const counted: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 12, year: 2021 },
    { season: 2, seasonNumber: 2, episodeCount: 12, year: 2023 },
  ]
  expect(pickSimilarSeason({ startDate: '2023-01-01', titles: ['A Show'] }, counted), 'the run has no count').toBeUndefined()
  expect(pickSimilarSeason({ startDate: '2023-01-01', titles: ['A Show'], episodeCount: 12 }, counted), 'the control')
    .toEqual({ season: 2, rule: 'year' })
})

// An empty episodes payload (an announced season, a region that cannot see the listing) came through
// as a season of 0, and 0 fits under every run's count: two runs two years apart both took it.
test('a season listing zero episodes has no count', () => {
  const empty: SeasonCandidate<number>[] = [{ season: 1, episodeCount: 0, episodeTitles: [] }]
  expect(pickSimilarSeason({ titles: ['Show'], episodeCount: 12, startDate: '2024-04-07' }, empty)).toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Another Run Of It'], episodeCount: 24, startDate: '2022-10-02' }, empty)).toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Show Season 2'], episodeCount: 12 }, [{ season: 2, seasonNumber: 2, episodeCount: 0 }]), 'nor by ordinal')
    .toBeUndefined()
})

test('a part spelled in roman numerals or words is still a part', () => {
  expect(namesAPart('Show Season 2 Part II')).toBe(true)
  expect(namesAPart('Show 2nd Season Second Cour')).toBe(true)
  expect(namesAPart('Show Part Two')).toBe(true)
  expect(namesAPart('Show Final Part')).toBe(true)
  expect(namesAPart('Show Season 2')).toBe(false)
  expect(namesAPart('Working!! Part Time'), 'a word after "part" is not a number').toBe(false)

  const seasonTwo: SeasonCandidate<number>[] = [{ season: 2, seasonNumber: 2, episodeCount: 12 }]
  expect(pickSimilarSeason({ titles: ['Show Season 2 Part II'], episodeCount: 12 }, seasonTwo)).toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Show Season 2'], episodeCount: 12 }, seasonTwo), 'the control').toEqual({ season: 2, rule: 'ordinal' })
})

// The in-flight dedupe in worker/extractor.ts joins a repeat of a question to the answer under way. The
// episode titles are the only evidence that tells apart two same-year cours of 12 with no ordinal, so
// two asks differing only there are two questions; the same question spelled differently is one.
test('the ask key splits on the real episode titles and on nothing spelled differently', () => {
  const base = { startDate: '2023-01-01', titles: ['Show'], episodeCount: 12 }
  expect(similarAskKey('nf', '1', { ...base, episodeTitles: episodeTitles(1, 12) }))
    .not.toBe(similarAskKey('nf', '1', { ...base, episodeTitles: episodeTitles(2, 12) }))
  expect(similarAskKey('nf', '1', { ...base, episodeTitles: Array.from({ length: 12 }, (_, i) => `Episode ${i + 1}`) }), 'generic titles are no evidence')
    .toBe(similarAskKey('nf', '1', base))
  expect(similarAskKey('cr', 'X', { startDate: '2026-07-04T15:00:00Z', titles: ['Show Season 2'] }))
    .toBe(similarAskKey('cr', 'X', { startDate: 'Sat, 04 Jul 2026 00:00:00 GMT', titles: ['Show 2nd Season'] }))
  expect(similarAskKey('cr', 'X', base)).not.toBe(similarAskKey('cr', 'Y', base))
})

// The which-show post-check the consumer runs on an answer. The show id came off a PART_OF edge whose
// container the fuzzy title pass may have unioned wrongly on a listing, so a season that fits by
// ordinal, count or year can be a run of another show; the titles are the one thing that says which.
test('the which-show check passes the show\'s own row and refuses another show\'s', async () => {
  const run = ['Mushoku Tensei: Jobless Reincarnation Season 3', 'Mushoku Tensei III: Isekai Ittara Honki Dasu', '無職転生 Ⅲ ～異世界行ったら本気だす～']

  expect((await answerNamesOurShow(run, ['Mushoku Tensei: Jobless Reincarnation'])).ok, 'crunchyroll titles its season 3 row with the show').toBe(true)

  const wrongShow = await answerNamesOurShow(run, ['Grand Blue Dreaming'])
  expect(wrongShow.ok, 'the row a wrong container union would produce').toBe(false)
  expect(wrongShow.score).toBeLessThan(SHOW_TITLE_THRESHOLD)

  const spinOff = await answerNamesOurShow(run, ['Mushoku Tensei: Jobless Reincarnation Gaiden'])
  expect(spinOff.ok, 'the binding wrong pair, 0.8135').toBe(false)
  expect(spinOff.score).toBeLessThan(SHOW_TITLE_THRESHOLD)

  expect(await answerNamesOurShow(run, []), 'an answer with no titles cannot be checked').toEqual({ ok: false, score: 0 })
  expect(await answerNamesOurShow([], ['Mushoku Tensei: Jobless Reincarnation']), 'nor can a run with none').toEqual({ ok: false, score: 0 })
})

test('describeEvidence prints what the rules read', () => {
  expect(describeEvidence({ startDate: '2026-07-04', titles: ['Show Season 3', 'Show'], episodeCount: 14, episodeTitles: ['A', 'B', 'Episode 3'] }))
    .toBe('{day:2026-07-04, count:14, ordinals:3, parts:no, titles:2, episodeTitles:3}')
  expect(describeEvidence({})).toBe('{day:-, count:-, ordinals:-, parts:no, titles:0, episodeTitles:0}')
  // 'Part 2' is read as ordinal 2 by parseSeasonNumber AND flagged as a part, which is exactly what
  // makes Rule 3 refuse it; the line shows both so the reader sees why the ordinal went unused
  expect(describeEvidence({ startDate: 'Sat, 04 Jul 2026 15:00:00 GMT', titles: ['Show Part 2'] }))
    .toBe('{day:2026-07-04, count:-, ordinals:2, parts:yes, titles:1, episodeTitles:0}')
})

// The two funnel lines printed BEFORE the show id is checked read a plugin's string, and a newline in it
// would break the one-line shape scripts/check-similar-media.mjs parses. A valid id prints unchanged.
test('a caller-supplied id prints as one log token', () => {
  expect(printableToken('G24H1N3MP')).toBe('G24H1N3MP')
  expect(printableToken('umc.cmc.1srk2goyh2q2zdxcx605w8vtx')).toBe('umc.cmc.1srk2goyh2q2zdxcx605w8vtx')
  expect(printableToken('a b\nc\u00e9')).toBe('a_b_c_')
  expect(printableToken('x'.repeat(200))).toHaveLength(128)
  expect(printableToken('')).toBe('-')
  expect(printableToken(undefined)).toBe('-')
})
