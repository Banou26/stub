import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { MAL_CONTINUING_SECTION, MAL_TYPE, isContinuing, malDate, parseMalSeason } from '../../../../src/sources/jikan/season-scrape'

// Real bytes taken from myanimelist.net/anime/season on 2026-08-16, one card per type id plus a
// card with no synopsis. A hand-written fixture would only ever test the regexes against
// themselves.
const fixture = readFileSync(new URL('./__fixtures__/mal-season.html', import.meta.url), 'utf8')

describe('parseMalSeason', () => {
  const entries = parseMalSeason(fixture)

  test('finds every card in the grid', () => {
    expect(entries).toHaveLength(6)
    expect(new Set(entries.map(entry => entry.id)).size).toBe(6)
  })

  test('reads the fields the homepage needs off a full card', () => {
    const mushoku = entries.find(entry => entry.id === '59193')
    expect(mushoku).toBeDefined()
    expect(mushoku).toMatchObject({
      id: '59193',
      title: 'Mushoku Tensei III: Isekai Ittara Honki Dasu',
      englishTitle: 'Mushoku Tensei: Jobless Reincarnation Season 3',
      score: 8.62,
      members: 299410,
      episodes: 14,
      startDate: '2026-07-06',
      typeId: 1,
    })
    expect(mushoku!.cover).toMatch(/^https:\/\/cdn\.myanimelist\.net\/images\/anime\/.+\.webp$/)
    expect(mushoku!.synopsis).toContain('Third season')
  })

  // members is what the homepage sorts on, so losing the thousands separator would reorder the page
  test('members keeps its full value rather than stopping at a comma', () => {
    for (const entry of entries) {
      if (entry.members !== undefined) expect(entry.members).toBeGreaterThan(0)
    }
    expect(entries.find(entry => entry.id === '59193')!.members).toBe(299410)
  })

  // Every card on the captured page happens to carry a synopsis and a score, so the missing-field
  // paths are exercised against a minimal card rather than pretended at with the fixture.
  test('a card with only an id and a title still parses', () => {
    const minimal =
      '<div class="js-anime-category-producer js-anime-type-1">'
      + '<a href="https://myanimelist.net/anime/12345/Some_Show" class="link-title">Some Show</a>'
      + '</div>'
    expect(parseMalSeason(minimal)).toEqual([{
      id: '12345',
      title: 'Some Show',
      englishTitle: undefined,
      cover: undefined,
      synopsis: undefined,
      score: undefined,
      members: undefined,
      episodes: undefined,
      startDate: undefined,
      typeId: 1,
      // no heading above it, so it belongs to no section and is never treated as carried over
      section: '',
    }])
  })

  test('a card with no id or no title is dropped rather than half-built', () => {
    expect(parseMalSeason('<div class="js-anime-category-producer">no link here</div>')).toEqual([])
    expect(parseMalSeason(
      '<div class="js-anime-category-producer"><a href="https://myanimelist.net/anime/7/X" class="link-title"></a></div>'
    )).toEqual([])
  })

  // The page repeats an id in its streaming payload and its genre block; one card must stay one media.
  test('a repeated id yields one entry', () => {
    const twice = fixture + fixture
    expect(parseMalSeason(twice)).toHaveLength(entries.length)
  })

  test('every card carries an id and a title, since neither can be recovered later', () => {
    for (const entry of entries) {
      expect(entry.id).toMatch(/^\d+$/)
      expect(entry.title.length).toBeGreaterThan(0)
    }
  })

  test('every type on the page maps to a known kind', () => {
    for (const entry of entries) {
      expect(MAL_TYPE[entry.typeId as keyof typeof MAL_TYPE]).toBeTruthy()
    }
    expect(new Set(entries.map(entry => entry.typeId))).toEqual(new Set([1, 2, 3, 4, 5, 9]))
  })

  // A score of N/A must be absent, never NaN, or it sorts and renders as garbage
  test('a missing score is absent rather than NaN', () => {
    for (const entry of entries) {
      if (entry.score !== undefined) expect(Number.isFinite(entry.score)).toBe(true)
    }
  })

  test('html entities in a title are decoded', () => {
    for (const entry of entries) {
      expect(entry.title).not.toMatch(/&(amp|quot|lt|gt|#\d+);/)
    }
  })

  test('an empty or junk document yields nothing rather than throwing', () => {
    expect(parseMalSeason('')).toEqual([])
    expect(parseMalSeason('<html><body>no anime here</body></html>')).toEqual([])
  })

  /**
   * The fixture above carries no headings, which is the shape this parser handled before sections
   * existed. Such a page must still yield every card, because returning nothing would empty the
   * homepage; the extractor logs the case instead.
   */
  test('a page with no headings still yields every card, unsectioned', () => {
    expect(entries).toHaveLength(6)
    for (const entry of entries) expect(entry.section).toBe('')
    expect(entries.some(isContinuing)).toBe(false)
  })
})

/**
 * MAL files carried-over long-runners under their own heading, and the season row sorts on members,
 * so the two biggest of them took the first two slots of "current season": One Piece (2.7M members,
 * started 1999) and Meitantei Conan (381k, started 1996).
 *
 * Real bytes, two cards from each of the two TV sections of the live page.
 */
describe('parseMalSeason, on a page with MAL\'s section headings', () => {
  const sectioned = parseMalSeason(
    readFileSync(new URL('./__fixtures__/mal-season-sections.html', import.meta.url), 'utf8')
  )
  const byId = (id: string) => sectioned.find(entry => entry.id === id)

  test('tags every card with the heading it sat under', () => {
    expect(sectioned).toHaveLength(4)
    expect(byId('59193')?.section).toBe('TV (New)')
    expect(byId('49233')?.section).toBe('TV (New)')
    expect(byId('21')?.section).toBe(MAL_CONTINUING_SECTION)
    expect(byId('235')?.section).toBe(MAL_CONTINUING_SECTION)
  })

  // the exact two titles that showed up first on the homepage
  test('One Piece and Meitantei Conan are carried over, not new', () => {
    expect(isContinuing(byId('21')!)).toBe(true)
    expect(isContinuing(byId('235')!)).toBe(true)
  })

  /**
   * The filter has to keep this season's shows. Mushoku Tensei III is the one AniList also returns
   * for SUMMER 2026, so it is the case that proves the filter is not simply dropping everything.
   */
  test('this season\'s shows survive the filter', () => {
    const seasonal = sectioned.filter(entry => !isContinuing(entry))
    expect(seasonal.map(entry => entry.id).sort()).toEqual(['49233', '59193'])
    expect(seasonal.find(entry => entry.id === '59193')?.title)
      .toBe('Mushoku Tensei III: Isekai Ittara Honki Dasu')
  })

  // sections must not cost any of the fields the homepage renders
  test('a sectioned card still parses every field', () => {
    expect(byId('59193')).toMatchObject({
      id: '59193',
      typeId: 1,
      startDate: '2026-07-06',
    })
    expect(byId('59193')?.cover).toMatch(/^https:\/\/cdn\.myanimelist\.net\/images\/anime\//)
    expect(byId('59193')?.members).toBeGreaterThan(0)
  })
})

describe('malDate', () => {
  test('reads the packed form MAL emits', () => {
    expect(malDate('20260706')).toBe('2026-07-06')
    expect(malDate('20261231')).toBe('2026-12-31')
  })

  // MAL writes a zero component when only the year or month is known, and `2026-00-00` is not a date
  test('a partial date is absent rather than invalid', () => {
    expect(malDate('20260000')).toBeUndefined()
    expect(malDate('20260700')).toBeUndefined()
  })

  test('anything unparseable is absent', () => {
    expect(malDate(undefined)).toBeUndefined()
    expect(malDate('')).toBeUndefined()
    expect(malDate('2026')).toBeUndefined()
    expect(malDate('not a date')).toBeUndefined()
  })
})
