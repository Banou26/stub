import { describe, expect, test } from 'vitest'

import {
  CONFIDENT_TITLE_THRESHOLD,
  rankByTitle,
  searchQueries,
  yearAppearsInShow
} from './catalogue-gate'
import { bestTitleScore, titleSimilarity } from './utils'

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
