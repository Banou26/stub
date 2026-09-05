import { describe, expect, test } from 'vitest'

import {
  CONFIDENT_TITLE_THRESHOLD,
  closestSeasonByAirDate,
  pickGatedCandidate,
  rankByTitle,
  searchQueries,
  SEASON_DATE_WINDOW,
  yearAppearsInShow
} from '../../../src/sources/catalogue-gate'
import { bestTitleScore, titleSimilarity } from '../../../src/sources/utils'

/**
 * The gate JustWatch and Apple TV used to ship: our FIRST title, raw, against the candidate, at 0.50.
 * Reproduced here rather than described, so every "this used to be refused" claim below is a measured
 * comparison against the real old function instead of a story about it.
 */
const SHIPPED_THRESHOLD = 0.5
const shippedGateAccepts = async (ourFirstTitle: string, candidateTitle: string) =>
  (await titleSimilarity(ourFirstTitle, candidateTitle)) >= SHIPPED_THRESHOLD

type JustWatchCandidate = { title: string, seasonYears: (number | null | undefined)[] }
type Known = { titles: string[], startDate?: string }

/** Both axes composed exactly as justwatch/extractor.ts composes them. */
const justwatchGateAccepts = async (known: Known, candidate: JustWatchCandidate) => {
  const ranked = await rankByTitle(known.titles, [candidate], entry => entry.title)
  if (!ranked.length) return false
  return yearAppearsInShow(known.startDate, candidate.seasonYears)
}

describe('the title axis', () => {
  // The defect the whole change is made of. A catalogue that models a show as one entry names it once,
  // without the season, while our cluster names the individual season, and the old gate charged the
  // correct match for that entire difference.
  describe('recovers a season-to-show link the shipped gate refused', () => {
    test('Solo Leveling season 2 against the catalogue entry for the show', async () => {
      expect(await titleSimilarity('Solo Leveling Season 2 -Arise from the Shadow-', 'Solo Leveling')).toBeCloseTo(0.2513, 4)
      expect(await shippedGateAccepts('Solo Leveling Season 2 -Arise from the Shadow-', 'Solo Leveling')).toBe(false)

      expect(await bestTitleScore(['Solo Leveling Season 2 -Arise from the Shadow-'], 'Solo Leveling')).toBe(1)
      expect(await bestTitleScore(
        ['Ore dake Level Up na Ken Season 2', 'Solo Leveling Season 2 -Arise from the Shadow-'],
        'Solo Leveling'
      )).toBe(1)
    })

    test('Attack on Titan season 3 part 2 against the catalogue entry for the show', async () => {
      expect(await titleSimilarity('Attack on Titan Season 3 Part 2', 'Attack on Titan')).toBeCloseTo(0.4370, 4)
      expect(await shippedGateAccepts('Attack on Titan Season 3 Part 2', 'Attack on Titan')).toBe(false)
      expect(await bestTitleScore(['Attack on Titan Season 3 Part 2'], 'Attack on Titan')).toBe(1)
    })

    // the OTHER half of the change, and it fixes a disjoint failure: the whole list recovers a
    // catalogue that lists the show under a name our cluster carries second, which no amount of season
    // stripping reaches
    test('only our second title names the show, and that is enough', async () => {
      expect(await shippedGateAccepts('Sousou no Frieren', "Frieren: Beyond Journey's End")).toBe(false)
      expect(await bestTitleScore(['Sousou no Frieren', "Frieren: Beyond Journey's End"], "Frieren: Beyond Journey's End")).toBe(1)
    })
  })

  describe('still refuses what the old gate refused', () => {
    test('a spin-off is not its parent', async () => {
      expect(await bestTitleScore(['Attack on Titan'], 'Attack on Titan: Junior High')).toBeLessThan(CONFIDENT_TITLE_THRESHOLD)
      expect(await bestTitleScore(['Steins;Gate'], 'Steins;Gate 0')).toBeLessThan(CONFIDENT_TITLE_THRESHOLD)
    })

    test('shares a distinctive word but is a different show', async () => {
      expect(await bestTitleScore(['Tokyo Ghoul'], 'Tokyo Revengers')).toBeLessThan(CONFIDENT_TITLE_THRESHOLD)
      expect(await bestTitleScore(['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba'], 'Woochi: The Demon Slayer'))
        .toBeLessThan(CONFIDENT_TITLE_THRESHOLD)
    })

    test('nothing to compare against is a refusal, never a pass', async () => {
      expect(await bestTitleScore([], 'Solo Leveling')).toBe(0)
      expect(await bestTitleScore([''], 'Solo Leveling')).toBe(0)
      expect(await bestTitleScore(['Solo Leveling'], '')).toBe(0)
    })
  })

  /**
   * A regression the threshold move introduces, asserted by name so it is not discovered again from
   * scratch. sacha does not read "act II" as a season marker, so franchiseTitle returns the string
   * unchanged and the pair scores 0.5114 before and after: it passed at 0.50 and it does not pass at
   * 0.90. The fix belongs in SEASON_MARKER and sacha's coverage, not in holding the threshold down.
   */
  test('KNOWN REGRESSION: an unrecognised season marker is refused where 0.50 admitted it', async () => {
    expect(await titleSimilarity('Ace of the Diamond act II', 'Ace of Diamond')).toBeCloseTo(0.5114, 4)
    expect(await bestTitleScore(['Ace of the Diamond act II'], 'Ace of Diamond')).toBeCloseTo(0.5114, 4)
    expect(await shippedGateAccepts('Ace of the Diamond act II', 'Ace of Diamond')).toBe(true)
    expect(await bestTitleScore(['Ace of the Diamond act II'], 'Ace of Diamond')).toBeLessThan(CONFIDENT_TITLE_THRESHOLD)
  })
})

describe('rankByTitle', () => {
  const known = ['Mushoku Tensei: Jobless Reincarnation Season 2']
  // deliberately listed worst first, so the order the catalogue happened to return cannot be mistaken
  // for the order this produces. The scores are measured, not chosen:
  //   0.8135  ... Gaiden                (a spin-off, and the highest scoring WRONG answer in the set)
  //   0.9523  ... Reincarnatio          (one character short)
  //   0.9535  Mushouku Tensei: ...      (one romanization apart)
  //   1.0000  ... Reincarnation         (exact after season stripping)
  const candidates = [
    { title: 'Mushoku Tensei: Jobless Reincarnation Gaiden' },
    { title: 'Fate/Zero' },
    { title: 'Mushoku Tensei: Jobless Reincarnatio' },
    { title: 'Mushouku Tensei: Jobless Reincarnation' },
    { title: 'Mushoku Tensei: Jobless Reincarnation' },
    { title: 'Mushoku Tensei Jobless Reincarnation' }
  ]

  test('drops everything under the threshold', async () => {
    const ranked = await rankByTitle(known, candidates, entry => entry.title)
    expect(ranked.every(entry => entry.score >= CONFIDENT_TITLE_THRESHOLD)).toBe(true)
    expect(ranked.map(entry => entry.candidate.title)).not.toContain('Mushoku Tensei: Jobless Reincarnation Gaiden')
    expect(ranked.map(entry => entry.candidate.title)).not.toContain('Fate/Zero')
  })

  // taking the best rather than the first is worth more than the threshold move at Apple TV: on the
  // 913 media where a correct and a wrong candidate both cleared the old gate, best welds 274 and
  // first welds 544.3 in expectation under a uniform ordering. Apple's order is not reproducible, so
  // the ranking must not depend on it.
  test('best first, and capped so a bad search cannot cost an unbounded number of detail requests', async () => {
    const ranked = await rankByTitle(known, candidates, entry => entry.title)
    expect(ranked.length).toBe(3)
    expect(ranked[0]!.score).toBe(1)
    expect(ranked[1]!.score).toBe(1)
    // the cap keeps 0.9535 and drops 0.9523, which is only correct if the sort ran before the slice
    expect(ranked[2]!.score).toBeCloseTo(0.9535, 4)
    expect(ranked[2]!.candidate.title).toBe('Mushouku Tensei: Jobless Reincarnation')
  })

  test('a candidate with no title scores nothing rather than throwing', async () => {
    const ranked = await rankByTitle(['Solo Leveling'], [{ title: undefined }, { title: 'Solo Leveling' }], entry => entry.title)
    expect(ranked.length).toBe(1)
  })
})

describe('the JustWatch date axis: our start year among the SHOW\'S SEASON years', () => {
  // THE correction, and the single most valuable assertion in this file. Comparing against the show's
  // own originalReleaseYear compares our season against the FRANCHISE'S FIRST season, which measured
  // 16.728% recall on the season-to-parent arm against 94.470% for reading the seasons.
  test('a later season is accepted, where the show-level year would refuse it', () => {
    const showYear = 2024
    const seasonYears = [2024, 2026]
    expect(yearAppearsInShow('2026-01-04T00:00:00.000Z', seasonYears)).toBe(true)
    expect(yearAppearsInShow('2026-01-04T00:00:00.000Z', [showYear])).toBe(false)
  })

  test('the whole gate accepts season 2 of a show the catalogue lists once', async () => {
    const known = { titles: ['Solo Leveling Season 2 -Arise from the Shadow-'], startDate: '2026-01-04' }
    expect(await justwatchGateAccepts(known, { title: 'Solo Leveling', seasonYears: [2024, 2026] })).toBe(true)
  })

  // the case the date axis exists for. These two are EXACTLY equal after season stripping, so they sit
  // in the 4.002% floor: 5583 of 139507 wrong pairs pass the title axis at threshold 1.00 and no
  // similarity number anywhere in 0..1 can refuse them.
  test('a remake the title axis cannot refuse is refused by the date', async () => {
    const known = { titles: ['Fruits Basket'], startDate: '2019-04-06' }
    expect(await bestTitleScore(known.titles, 'Fruits Basket')).toBe(1)

    expect(await justwatchGateAccepts(known, { title: 'Fruits Basket', seasonYears: [2001] })).toBe(false)
    expect(await justwatchGateAccepts(known, { title: 'Fruits Basket', seasonYears: [2019, 2020, 2021] })).toBe(true)
  })

  describe('anything missing is a refusal, never a guess', () => {
    test('no start date', () => {
      expect(yearAppearsInShow(undefined, [2019])).toBe(false)
      expect(yearAppearsInShow(null, [2019])).toBe(false)
      expect(yearAppearsInShow('', [2019])).toBe(false)
      expect(yearAppearsInShow('not a date', [2019])).toBe(false)
    })

    test('no season years', () => {
      expect(yearAppearsInShow('2019-04-06', [])).toBe(false)
      expect(yearAppearsInShow('2019-04-06', [null, undefined])).toBe(false)
    })

    test('the whole gate refuses a title it is sure of when the date is missing', async () => {
      const candidate = { title: 'Solo Leveling', seasonYears: [2024, 2026] }
      expect(await justwatchGateAccepts({ titles: ['Solo Leveling Season 2 -Arise from the Shadow-'] }, candidate)).toBe(false)
      expect(await justwatchGateAccepts(
        { titles: ['Solo Leveling Season 2 -Arise from the Shadow-'], startDate: '2026-01-04' },
        { ...candidate, seasonYears: [] }
      )).toBe(false)
    })
  })

  // the year is read in UTC on both sides, so a date at the very edge of a year cannot be moved into
  // the neighbouring one by the machine's timezone. A gate whose verdict depends on where it runs is
  // worse than a coarser gate.
  test('the year is UTC, not local', () => {
    expect(yearAppearsInShow('2019-01-01T00:30:00.000Z', [2019])).toBe(true)
    expect(yearAppearsInShow('2019-12-31T23:30:00.000Z', [2019])).toBe(true)
  })
})


describe('searchQueries', () => {
  // the query is built from our primary title only, while the title axis scores against the whole
  // cluster. Scoring the rung that found a candidate instead of the cluster is the mistake this
  // separation exists to prevent, and it measured worse than not simplifying at all.
  test('most specific first, deduplicated, capped', () => {
    const queries = searchQueries('Solo Leveling Season 2 -Arise from the Shadow-')
    expect(queries[0]).toBe('Solo Leveling Season 2 -Arise from the Shadow-')
    expect(queries).toContain('Solo Leveling')
    expect(queries.length).toBeLessThanOrEqual(4)
    expect(new Set(queries).size).toBe(queries.length)
  })

  test('a title with nothing to strip is its own only query', () => {
    expect(searchQueries('Hunter x Hunter')).toEqual(['Hunter x Hunter'])
  })
})


/**
 * The finer axis, which Apple TV can read and JustWatch cannot: a JustWatch season carries a YEAR, an
 * Apple TV season carries a day.
 *
 * The Severance numbers below are the real payload, measured 2026-08-29 and re-derivable in one
 * request:
 *
 *   curl -s 'https://uts-api.itunes.apple.com/uts/v3/shows/umc.cmc.1srk2goyh2q2zdxcx605w8vtx?caller=web&sf=143441&v=58&pfm=web&locale=en-US&utsk=0'
 *
 * season 1 releaseDate 1645142400000 (2022-02-18), season 2 1737072000000 (2025-01-17), and a
 * show-level content.releaseDate of 1645142400000, which IS season 1's.
 */
describe('the Apple TV date axis: our start date within 45 days of a SEASON\'s premiere', () => {
  const DAY = 24 * 60 * 60 * 1000
  const SEVERANCE_SHOW_DATE = 1645142400000
  const SEVERANCE_SEASONS = [
    { seasonNumber: 1, releaseDate: 1645142400000 },
    { seasonNumber: 2, releaseDate: 1737072000000 }
  ]
  const dateOf = (season: { seasonNumber?: number, releaseDate?: number }) => season.releaseDate

  test('the nearest season is the one that aired, and the show-level date names the wrong one', () => {
    const nearest = closestSeasonByAirDate('2025-01-17T00:00:00.000Z', SEVERANCE_SEASONS, dateOf)
    expect(nearest?.season.seasonNumber).toBe(2)
    expect(nearest?.diff).toBe(0)

    // the show carries season 1's date, so a gate reading it puts season 2 nearly three years out and
    // refuses the link this whole change exists to recover
    const showLevel = closestSeasonByAirDate(
      '2025-01-17T00:00:00.000Z',
      [{ seasonNumber: 1, releaseDate: SEVERANCE_SHOW_DATE }],
      dateOf
    )
    expect(showLevel!.diff).toBeGreaterThan(SEASON_DATE_WINDOW)
  })

  // THE UNITS, pinned as behaviour because the failure is silent: a seconds-valued field read as
  // milliseconds is 1970, which is not a malformed date and not a January 1 that a precision guard
  // would notice, it is simply a wrong answer 55 years out.
  test('epoch MILLISECONDS: the same number read as seconds is refused', () => {
    expect(new Date(1645142400000).toISOString()).toBe('2022-02-18T00:00:00.000Z')
    expect(new Date(1645142400).toISOString()).toBe('1970-01-20T00:59:02.400Z')

    const asSeconds = [{ seasonNumber: 1, releaseDate: 1645142400 }]
    const nearest = closestSeasonByAirDate('2022-02-18T00:00:00.000Z', asSeconds, dateOf)
    expect(nearest!.diff).toBeGreaterThan(SEASON_DATE_WINDOW)
  })

  test('45 days is inside the window and 46 is not', () => {
    const premiere = Date.UTC(2025, 0, 17)
    const at = (days: number) =>
      closestSeasonByAirDate(new Date(premiere + days * DAY).toISOString(), [{ releaseDate: premiere }], dateOf)!.diff
    expect(at(45)).toBe(SEASON_DATE_WINDOW)
    expect(at(45) <= SEASON_DATE_WINDOW).toBe(true)
    expect(at(46) <= SEASON_DATE_WINDOW).toBe(false)
    // symmetric: a premiere BEFORE our date is the same distance as one after it
    expect(at(-45)).toBe(SEASON_DATE_WINDOW)
  })

  describe('anything missing is a refusal, never a guess', () => {
    test('no start date', () => {
      expect(closestSeasonByAirDate(undefined, SEVERANCE_SEASONS, dateOf)).toBeUndefined()
      expect(closestSeasonByAirDate(null, SEVERANCE_SEASONS, dateOf)).toBeUndefined()
      expect(closestSeasonByAirDate('', SEVERANCE_SEASONS, dateOf)).toBeUndefined()
      expect(closestSeasonByAirDate('not a date', SEVERANCE_SEASONS, dateOf)).toBeUndefined()
    })

    test('no seasons, or no season carrying a date', () => {
      expect(closestSeasonByAirDate('2025-01-17', [], dateOf)).toBeUndefined()
      expect(closestSeasonByAirDate('2025-01-17', [{ seasonNumber: 1 }, { seasonNumber: 2 }], dateOf)).toBeUndefined()
    })
  })
})


describe('the Apple TV gate, both axes composed', () => {
  type Season = { seasonNumber?: number, releaseDate?: number }
  type Candidate = { id: string, title: string, seasons: Season[] }

  /** Exactly what appletv/extractor.ts calls, with the detail request recorded rather than made. */
  const gate = (
    known: { titles: string[], startDate?: string },
    candidates: Candidate[],
    spent: string[] = []
  ) =>
    pickGatedCandidate(
      known,
      candidates,
      candidate => candidate.title,
      async candidate => { spent.push(candidate.id); return candidate.seasons },
      season => season.releaseDate
    )

  const soloLeveling = {
    titles: ['Solo Leveling Season 2 -Arise from the Shadow-'],
    startDate: '2026-01-04T00:00:00.000Z'
  }
  const soloLevelingShow = {
    id: 'umc.solo',
    title: 'Solo Leveling',
    seasons: [
      { seasonNumber: 1, releaseDate: Date.UTC(2024, 0, 6) },
      { seasonNumber: 2, releaseDate: Date.UTC(2026, 0, 4) }
    ]
  }

  // the whole point of the change: a catalogue that models the show as one entry names it once, without
  // the season, and the shipped gate charged the correct match for that entire difference
  test('a season-to-show link the shipped gate refused, and it names the SEASON it matched', async () => {
    expect(await shippedGateAccepts(soloLeveling.titles[0]!, soloLevelingShow.title)).toBe(false)

    const match = await gate(soloLeveling, [soloLevelingShow])
    expect(match?.candidate.id).toBe('umc.solo')
    expect(match?.season.seasonNumber).toBe(2)
    expect(match?.diff).toBe(0)
  })

  // the floor the date axis exists for: 5583 of 139507 wrong pairs are EXACTLY equal after season
  // stripping, so no similarity number in 0..1 can refuse them
  test('a remake the title axis cannot refuse is refused by the date', async () => {
    const known = { titles: ['Fruits Basket'], startDate: '2019-04-06T00:00:00.000Z' }
    expect(await bestTitleScore(known.titles, 'Fruits Basket')).toBe(1)

    const remake = { id: 'umc.fb2001', title: 'Fruits Basket', seasons: [{ seasonNumber: 1, releaseDate: Date.UTC(2001, 6, 5) }] }
    const original = { id: 'umc.fb2019', title: 'Fruits Basket', seasons: [{ seasonNumber: 1, releaseDate: Date.UTC(2019, 3, 6) }] }
    expect(await gate(known, [remake])).toBeUndefined()
    expect((await gate(known, [original]))?.candidate.id).toBe('umc.fb2019')
  })

  test('the whole gate refuses a title it is sure of when the date is missing', async () => {
    expect(await gate({ titles: soloLeveling.titles }, [soloLevelingShow])).toBeUndefined()
    expect(await gate(soloLeveling, [{ ...soloLevelingShow, seasons: [] }])).toBeUndefined()
    expect(await gate(soloLeveling, [{ ...soloLevelingShow, seasons: [{ seasonNumber: 2 }] }])).toBeUndefined()
  })

  // Apple's result order is not reproducible, and the shipped code took whichever passing candidate the
  // shelves happened to list first. Both orders must give the same answer or the gate is a coin flip.
  test('the best candidate wins whatever order the catalogue lists them in', async () => {
    const near = { id: 'umc.near', title: 'Solo Leveling', seasons: [{ seasonNumber: 2, releaseDate: Date.UTC(2026, 0, 4) }] }
    const far = { id: 'umc.far', title: 'Solo Leveling', seasons: [{ seasonNumber: 2, releaseDate: Date.UTC(2026, 0, 30) }] }

    expect((await gate(soloLeveling, [far, near]))?.candidate.id).toBe('umc.near')
    expect((await gate(soloLeveling, [near, far]))?.candidate.id).toBe('umc.near')
    // both are inside the window, so this is a ranking rather than a rejection
    expect((await gate(soloLeveling, [far]))?.candidate.id).toBe('umc.far')
  })

  // a detail request per candidate is what the cap in rankByTitle exists to bound, so a candidate the
  // title axis already refused must cost nothing at all
  test('a title-refused candidate never costs a detail request', async () => {
    const spent: string[] = []
    const match = await gate(
      soloLeveling,
      [{ id: 'umc.wrong', title: 'Fate/Zero', seasons: [{ seasonNumber: 1, releaseDate: Date.UTC(2026, 0, 4) }] }, soloLevelingShow],
      spent
    )
    expect(match?.candidate.id).toBe('umc.solo')
    expect(spent).toEqual(['umc.solo'])
  })
})
