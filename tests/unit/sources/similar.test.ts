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
  foldVetoed,
  hasEvidence,
  isRunAnswerFrom,
  namesAPart,
  pickContainingSeason,
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

// The run side of the same distinction, and what every caller has to hand in: an absent count is
// UNKNOWN and each rule says which of "silent" and "refuse" it means by it. The fold veto has nothing
// to be longer than, so it is silent and the rules that read a date or the episode titles still
// answer; the three rules that need a count refuse, because a season whose length cannot be compared
// is not established.
test('an unknown run count leaves the fold veto silent and refuses the rules that need a count', () => {
  expect(foldVetoed({ titles: [SHOW] }, NF[0]!), 'nothing to be longer than').toBe(false)
  expect(foldVetoed({ titles: [SHOW], episodeCount: 11 }, NF[0]!), 'the control: 24 over 11 is a fold').toBe(true)
  expect(foldVetoed({ titles: [SHOW], episodeCount: 24 }, NF[0]!), 'equal is not longer').toBe(false)

  // the date and the episode titles place a run whose length nobody published
  expect(pickSimilarSeason({ startDate: '2023-07-09' }, CR), 'the veto is silent, not passed').toEqual({ season: 2, rule: 'date' })
  expect(pickSimilarSeason({ episodeTitles: episodeTitles(3, 11) }, NF)).toEqual({ season: 3, rule: 'episode-titles' })

  // and the three that read a count refuse rather than answering on the rest of the evidence
  expect(pickSimilarSeason({ titles: [`${SHOW} Season 3`] }, NF), 'the ordinal rule').toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Some Show'], startDate: '2021-01-01' }, NF), 'the year rule').toBeUndefined()
  expect(pickSimilarSeason({ titles: ['Some Show'] }, NF), 'the first-season rule').toBeUndefined()
})

// Zero is a COUNT here, and it refuses every season longer than it. That is the whole cost of case 23:
// `media.episodeCount ?? media.episodes?.length` over an aggregate, whose list is always empty, handed
// this in for every cluster that declares no count. `declaredEpisodeCount` in ../utils.ts is what the
// answering sources read instead, and these two lines are why it may never fall back to a length.
test('a run count of zero is a count, and it vetoes every candidate', () => {
  expect(foldVetoed({ titles: [SHOW], episodeCount: 0 }, NF[0]!)).toBe(true)
  expect(NF.every(candidate => foldVetoed({ titles: [SHOW], episodeCount: 0 }, candidate))).toBe(true)
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

// THE LIVE SHAPE, taken off `?store=graph` on 2026-09-13 and the reason rule 2 was changed.
// unOGS lists Netflix's Mushoku Tensei with 24 numbered titles on season 1, 13 real names on season 2
// and TWO on season 3, which is the season the run actually is. Rule 2 could therefore measure only
// season 2, season 2 shares none of our names, and the rule refused OUTRIGHT: the run was denied a
// season it had an ordinal and a count for, while the identical run carrying no episode titles
// answered season 3 by ordinal. More evidence must never establish less.
const NUMBERED = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Episode ${from + i}`)
const UNOGS_MUSHOKU: SeasonCandidate<number>[] = [
  { season: 1, seasonNumber: 1, episodeCount: 24, episodeTitles: NUMBERED(1, 24), year: 2021 },
  {
    season: 2,
    seasonNumber: 2,
    episodeCount: 25,
    episodeTitles: [
      'Fitz the Guardian', 'The Depressed Magician', 'The Midnight Forest', 'Fast Approach',
      'Letter of Recommendation', 'Ranoa University of Magic', 'Unwilling to Die',
      'The Kidnapping and Confinement of Beast Girls', 'The Fiance of Despair', 'The White Mask',
      'This Feeling', 'To You', 'I Want to Convey',
      ...NUMBERED(14, 21), 'The Magic Circle on the Sixth Floor', ...NUMBERED(23, 25),
    ],
  },
  { season: 3, seasonNumber: 3, episodeCount: 12, episodeTitles: ['Rage, Mad Dog', 'Howl, Mad Dog', ...NUMBERED(3, 12)] },
]
const RUN_TITLES = [`${SHOW} Season 3`, 'Mushoku Tensei III: Isekai Ittara Honki Dasu', SHOW]
const RUN_EPISODES = [
  'Burn Bright, Mad Dog', 'Howl, Mad Dog', 'Life Back at Home', 'A King-Class Water Mage',
  'Celebrations', 'Another Domestic Disaster?', 'Phase Four', 'The Flying Fortress', 'Lament',
  'Episode 10', 'Episode 11',
]

test('a season rule 2 could not measure is left to the rules below, and the run keeps its ordinal', () => {
  const evidence = { titles: RUN_TITLES, episodeCount: 14, startDate: '2026-07-04', episodeTitles: RUN_EPISODES }
  expect(pickSimilarSeason(evidence, UNOGS_MUSHOKU)).toEqual({ season: 3, rule: 'ordinal' })
  // the control, and the statement in one line: the SAME run with no episode titles at all reaches
  // the same season, so carrying evidence cannot cost a match
  expect(pickSimilarSeason({ ...evidence, episodeTitles: [] }, UNOGS_MUSHOKU)).toEqual({ season: 3, rule: 'ordinal' })
})

test('a season rule 2 measured and refuted is removed, and no later rule may promote it', () => {
  // season 2 is the only measurable candidate and shares none of our names, so it is out of every
  // rule below: asking for ordinal 2 with its exact count now refuses where the count alone fit
  const asSeasonTwo = { titles: [`${SHOW} Season 2`], episodeCount: 25, episodeTitles: RUN_EPISODES }
  expect(pickSimilarSeason(asSeasonTwo, UNOGS_MUSHOKU), 'refuted by title, so not reachable by ordinal').toBeUndefined()
  expect(
    pickSimilarSeason({ ...asSeasonTwo, episodeTitles: [] }, UNOGS_MUSHOKU),
    'the control: with nothing to refute it, the ordinal answers'
  ).toEqual({ season: 2, rule: 'ordinal' })

  // and the first-season rule reads the SOURCE's first season, never the first survivor: a refuted
  // season 1 refuses rather than promoting the season behind it
  const refutedFirst: SeasonCandidate<string>[] = [
    { season: 'one', seasonNumber: 1, episodeCount: 12, episodeTitles: episodeTitles(8, 12) },
    { season: 'two', seasonNumber: 2, episodeCount: 12, episodeTitles: NUMBERED(1, 12) },
  ]
  expect(pickSimilarSeason({ titles: ['Show'], episodeCount: 12, episodeTitles: episodeTitles(9, 12) }, refutedFirst)).toBeUndefined()
  expect(
    pickSimilarSeason({ titles: ['Show'], episodeCount: 12 }, refutedFirst),
    'the control: with no episode titles the first season answers on its count'
  ).toEqual({ season: 'one', rule: 'first' })
})

test('rule 2 still refuses decisively when every season could be measured', () => {
  // nothing was left unmeasured, so "none of these" is a fact about all of them and the ordinal below
  // must not rescue it. This is the refusal the rule was written for and it is unchanged.
  const measurable: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 12, episodeTitles: episodeTitles(1, 12) },
    { season: 2, seasonNumber: 2, episodeCount: 12, episodeTitles: episodeTitles(2, 12) },
  ]
  expect(pickSimilarSeason({ titles: ['Show Season 2'], episodeCount: 12, episodeTitles: episodeTitles(9, 12) }, measurable)).toBeUndefined()
  expect(
    pickSimilarSeason({ titles: ['Show Season 2'], episodeCount: 12, episodeTitles: episodeTitles(2, 12) }, measurable),
    'the control: our own titles still pick the season carrying them'
  ).toEqual({ season: 2, rule: 'episode-titles' })
})

// WHERE THE OTHER TWO SEASONS STOP, pinned so nobody "fixes" it by loosening a guard. Netflix folds
// Mushoku Tensei's five anime runs into three seasons, so anime season 1 (11 episodes, January 2021)
// and its second cour (12 episodes, October 2021) are both INSIDE Netflix season 1, which holds 24.
// Neither of them IS a Netflix season, and there is no honest verdict here: the fold veto refuses the
// only season either could be matched to, and the year rule and the part marker close the rest.
//
// What they need is the `containing` answer of 4.4, which no source emits yet and which this picker
// has no verdict for. An episode placed on evidence we do not have is worse than no episode.
test('a run Netflix folded into a longer season is refused, not placed on the fold', () => {
  const cour1 = { titles: [SHOW], episodeCount: 11, startDate: '2021-01-11', episodeTitles: episodeTitles(9, 11) }
  expect(pickSimilarSeason(cour1, UNOGS_MUSHOKU), 'season 1 holds 24 where the run holds 11').toBeUndefined()
  expect(foldVetoed(cour1, UNOGS_MUSHOKU[0]!), 'and the fold veto is what says so').toBe(true)

  const cour2 = { titles: [`${SHOW} Part 2`], episodeCount: 12, startDate: '2021-10-04', episodeTitles: episodeTitles(10, 12) }
  expect(pickSimilarSeason(cour2, UNOGS_MUSHOKU), 'a part names a position inside a season, not a season').toBeUndefined()
})

// THE OTHER HALF OF THE FOLD, and the two runs above are what it is for. `pickContainingSeason` never
// says a season IS the run; it says one HOLDS it, which is what a caller writes as PART_OF (4.4). The
// fixture is the live unOGS shape: season 1 numbers all 24 of its episodes and so can be measured
// about nothing, season 2 names 14 of its 25, season 3 names 2 of its 12.
test('the fold read from the other side: the season refused for being longer is the one holding the run', () => {
  const cour1 = { titles: [SHOW], episodeCount: 11, startDate: '2021-01-11' }
  expect(pickSimilarSeason(cour1, UNOGS_MUSHOKU), 'the control: no season IS this run').toBeUndefined()
  // Mutation: drop the `candidateYear(candidate) === evidenceYear` clause and Netflix's season 2 is
  // admitted beside season 1, so the pick becomes a refusal. The year is the whole axis here, because
  // seasons 1 and 2 are both more than twice this run's length.
  expect(pickContainingSeason(cour1, UNOGS_MUSHOKU)).toEqual({ season: 1, rule: 'year', theirs: 24, ours: 11 })
  expect(
    pickContainingSeason({ ...cour1, episodeTitles: episodeTitles(9, 11) }, UNOGS_MUSHOKU),
    'and the same run carrying its own episode names, which are none of Netflix\'s, reaches the same season'
  ).toEqual({ season: 1, rule: 'year', theirs: 24, ours: 11 })
})

// A part is a position INSIDE a season, which is the fold seen from our side, so the marker that
// closes every sameness rule must not close this one. Mutation: add `|| titles.some(namesAPart)` to
// the early refusals and this reddens while every case above stays green.
test('a part-named run is given the season that holds it, where it is refused a season of its own', () => {
  const cour2 = { titles: [`${SHOW} Part 2`], episodeCount: 12, startDate: '2021-10-04', episodeTitles: episodeTitles(10, 12) }
  expect(pickSimilarSeason(cour2, UNOGS_MUSHOKU), 'the control').toBeUndefined()
  expect(pickContainingSeason(cour2, UNOGS_MUSHOKU)).toEqual({ season: 1, rule: 'year', theirs: 24, ours: 12 })
})

// The axis unOGS' season 2 can be measured on. Our 13 episode names are 13 of the 14 it lists, which
// reads as identity against the NAMES (0.93) and as a fold against the SEASON (13/25 = 0.52). Rule 2
// scores the first, passes the season, and is saved only by the fold veto; this scores the second.
//
// Mutation: measure the candidate's share against `theirs.length` rather than `countOf(candidate)` and
// 0.93 is above the line, so the verdict disappears.
test('a season naming most of our episodes among twice as many of its own holds the run', () => {
  const ours = UNOGS_MUSHOKU[1]!.episodeTitles!.filter(title => !title.startsWith('Episode'))
  const run = { titles: [`${SHOW} Season 2`], episodeCount: 13, startDate: '2023-07-02', episodeTitles: ours }
  expect(pickSimilarSeason(run, UNOGS_MUSHOKU), 'the control: 25 over 13 is a fold, not our run').toBeUndefined()
  expect(pickContainingSeason(run, UNOGS_MUSHOKU)).toEqual({ season: 2, rule: 'episode-titles', theirs: 25, ours: 13 })
})

// THE INVARIANT THE WHOLE OUTCOME EXISTS FOR: the two answers are mutually exclusive, and that is
// enforced here rather than left to a caller asking in the right order. A wrong containment costs a
// badge and a hidden card; a wrong sameness welds two works, so nothing may ever hold both.
//
// Mutation: delete the leading `if (pickSimilarSeason(evidence, candidates)) return undefined` and
// this run gets season 1 by date AND season 2 as its container.
test('a run that HAS a season is never also given a container', () => {
  const dated: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 11, premiere: '2021-01-11', year: 2021 },
    { season: 2, seasonNumber: 2, episodeCount: 24, premiere: '2021-06-01', year: 2021 },
  ]
  const run = { titles: ['Show'], episodeCount: 11, startDate: '2021-01-11' }
  expect(pickSimilarSeason(run, dated), 'season 1 premiered within the window').toEqual({ season: 1, rule: 'date' })
  expect(pickContainingSeason(run, dated), 'and season 2 is longer and dated our year, and holds nothing').toBeUndefined()
})

// A season carrying our run plus a four episode bonus block is 12/16 = 0.75, which rule 2 ADMITS as
// sameness when it can see the titles. With counts alone the two are indistinguishable, so nothing is
// answered rather than a container that is really the run.
//
// Mutation: drop `ours / countOf(candidate)! < EPISODE_TITLE_COVERAGE` from the year axis and the
// bonus block becomes a container.
test('a season only a little longer than the run is our run plus extras, and holds nothing', () => {
  const bonus: SeasonCandidate<number>[] = [{ season: 1, seasonNumber: 1, episodeCount: 16, year: 2021 }]
  const run = { titles: ['Show'], episodeCount: 12, startDate: '2021-01-11' }
  expect(pickSimilarSeason(run, bonus), 'the control: the fold veto refuses it as the run').toBeUndefined()
  expect(pickContainingSeason(run, bonus)).toBeUndefined()

  const fold: SeasonCandidate<number>[] = [{ season: 1, seasonNumber: 1, episodeCount: 24, year: 2021 }]
  expect(
    pickContainingSeason(run, fold),
    'the control: the same run against a season twice its length is held by it'
  ).toEqual({ season: 1, rule: 'year', theirs: 24, ours: 12 })
})

// The 2026-09-05 weld, closed on the containment side too: anime season 1 took `nf:80987039-3` once,
// and a fold only ever COMPRESSES, so the season holding our run is numbered at or below ours.
//
// Mutation: drop the `candidate.seasonNumber <= ceiling` clause and season 3 takes this run.
test('a run whose titles agree on season 1 is never put inside the source\'s season 3', () => {
  const late: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: undefined, year: 2021 },
    { season: 3, seasonNumber: 3, episodeCount: 24, year: 2021 },
  ]
  const run = { titles: ['Show Season 1'], episodeCount: 11, startDate: '2021-01-11' }
  expect(pickSimilarSeason(run, late), 'the control: a season with no count settles nothing').toBeUndefined()
  expect(pickContainingSeason(run, late)).toBeUndefined()
  expect(
    pickContainingSeason({ ...run, titles: ['Show'] }, late),
    'the control: the same evidence with no ordinal to read is held by that season'
  ).toEqual({ season: 3, rule: 'year', theirs: 24, ours: 11 })
})

// The same removal rule 2 makes, for the same reason: a season that lists real episode names, none of
// which are ours, is not where our run is, and the year must not pick it up afterwards.
//
// Mutation: drop the `pool = longer.filter(...)` line and the year axis answers this season.
test('a measured season sharing none of our episode names is removed, not left to the year', () => {
  const named: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 24, year: 2021, episodeTitles: episodeTitles(1, 24) },
  ]
  const run = { titles: ['Show'], episodeCount: 11, startDate: '2021-01-11', episodeTitles: episodeTitles(9, 11) }
  expect(pickSimilarSeason(run, named), 'the control: rule 2 refuses it outright').toBeUndefined()
  expect(pickContainingSeason(run, named)).toBeUndefined()
  expect(
    pickContainingSeason({ ...run, episodeTitles: [] }, named),
    'the control: with nothing to refute it, the year holds the run'
  ).toEqual({ season: 1, rule: 'year', theirs: 24, ours: 11 })
})

// Two seasons each carrying most of our run is a catalogue listing it twice, and no axis below can
// tell the copies apart. Mutation: take `holding[0]` instead of refusing and one of the two is picked.
test('two seasons holding our run is a refusal, exactly as two seasons being it is', () => {
  // and the third season is what makes the refusal load bearing: without it the two measured seasons
  // are merely removed, and with it a fall-through would answer a season nothing was measured about
  const twice: SeasonCandidate<number>[] = [
    { season: 1, seasonNumber: 1, episodeCount: 24, episodeTitles: episodeTitles(9, 24) },
    { season: 2, seasonNumber: 2, episodeCount: 25, episodeTitles: episodeTitles(9, 25) },
    { season: 3, seasonNumber: 3, episodeCount: 24, episodeTitles: NUMBERED(1, 24), year: 2021 },
  ]
  const run = { titles: ['Show'], episodeCount: 12, startDate: '2021-01-11', episodeTitles: episodeTitles(9, 12) }
  expect(pickSimilarSeason(run, twice), 'the control').toBeUndefined()
  expect(pickContainingSeason(run, twice)).toBeUndefined()
})

// Nothing to measure is not a container. A season whose length nobody published could be any length,
// and one no longer than the run has no room to hold it and something else.
test('a season with no count, and a season no longer than the run, hold nothing', () => {
  const run = { titles: ['Show'], episodeCount: 12, startDate: '2021-01-11' }
  expect(pickContainingSeason(run, [{ season: 1, seasonNumber: 1, year: 2021 }])).toBeUndefined()
  expect(pickContainingSeason(run, [{ season: 1, seasonNumber: 1, episodeCount: 12, year: 2021 }])).toBeUndefined()
  expect(
    pickContainingSeason({ ...run, episodeCount: undefined }, [{ season: 1, seasonNumber: 1, episodeCount: 24, year: 2021 }]),
    'and a run whose own length is unknown is not inside anything either'
  ).toBeUndefined()
})
