import { describe, expect, test } from 'vitest'

import { SEASON_PAGE_SIZE, SEASON_PAGES, seasonPageNumbers, seasonQuery } from './season-paging'

describe('seasonQuery', () => {
  const query = seasonQuery({ season: 'summer', year: 2026, page: 1 })

  // The whole point of this module. page[offset] is what Kitsu documents and what its own links.next
  // advertises, and on a season filter it returns page one twice, so the walk loses the tail.
  test('pages by number and size, never by limit and offset', () => {
    expect(query).toContain('page%5Bsize%5D=20')
    expect(query).toContain('page%5Bnumber%5D=1')
    expect(query).not.toContain('page%5Boffset%5D')
    expect(query).not.toContain('page%5Blimit%5D')
  })

  // Without include=mappings the records carry no myanimelist or anilist id, so nothing merges with
  // the other sources and the homepage shows the season two or three times over.
  test('asks for the mappings that make a record mergeable', () => {
    expect(query).toContain('include=mappings')
  })

  test('filters to the season it was asked for', () => {
    const autumn = seasonQuery({ season: 'fall', year: 2025, page: 3 })
    expect(autumn).toContain('filter%5Bseason%5D=fall')
    expect(autumn).toContain('filter%5BseasonYear%5D=2025')
    expect(autumn).toContain('page%5Bnumber%5D=3')
  })

  test('every page asks for the maximum Kitsu allows', () => {
    expect(SEASON_PAGE_SIZE).toBe(20)
    for (const page of seasonPageNumbers()) {
      expect(seasonQuery({ season: 'summer', year: 2026, page })).toContain(`page%5Bsize%5D=${SEASON_PAGE_SIZE}`)
    }
  })
})

describe('seasonPageNumbers', () => {
  // Kitsu numbers pages from 1. Starting at 0 returns the same rows as 1 and wastes the last page.
  test('numbers pages from one', () => {
    expect(seasonPageNumbers(6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('no page number repeats', () => {
    const pages = seasonPageNumbers()
    expect(new Set(pages).size).toBe(pages.length)
  })

  // Summer 2026 was 117 titles over 6 pages, and the neighbouring seasons ran to 135. The walk has
  // to clear a busy season, not just the one it was measured against.
  test('the walk reaches past a busy season', () => {
    expect(SEASON_PAGES * SEASON_PAGE_SIZE).toBeGreaterThan(135)
    expect(seasonPageNumbers().length).toBe(SEASON_PAGES)
  })
})
