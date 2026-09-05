import { describe, expect, test } from 'vitest'

import { MediaCategory, MediaSeason, MediaStatus, MediaType } from '../../../src/generated/graphql'
import {
  EMPTY_SEARCH_FILTERS, KNOWN_GENRES, YEAR_MIN,
  hasSearchFilters, isKnownGenre, namesAQuery, parseSearchFilters, searchFiltersQuery, searchHeading,
  searchPath, seasonValue, yearMax,
} from '../../../src/router/search/params'
import type { SearchFilters } from '../../../src/router/search/params'
import { writePluginUris } from '../../../src/utils/plugin-links'

// The url IS the search page's state: the controls render from it, the header's box rewrites one key
// of it, and the home page links into it. A key silently dropped here is a filter that looks applied
// and is not, which is the one failure a user cannot tell from a broken source.

const AT = new Date('2026-09-06T00:00:00Z')

describe('parseSearchFilters', () => {
  test('an empty query string names nothing', () => {
    expect(parseSearchFilters('')).toEqual(EMPTY_SEARCH_FILTERS)
  })

  test('every axis round-trips through the query string', () => {
    const filters = {
      query: 'mushoku tensei',
      category: MediaCategory.Anime,
      status: MediaStatus.Releasing,
      season: MediaSeason.Summer,
      year: 2026,
      formats: [MediaType.Tv, MediaType.TvShort],
      genres: ['Action', 'Slice of Life'],
      tags: ['Isekai'],
    }
    expect(parseSearchFilters(searchFiltersQuery(filters), AT)).toEqual(filters)
  })

  test('a value carrying a separator survives, which is why the multi-valued keys repeat', () => {
    const filters = parseSearchFilters(searchFiltersQuery({ tags: ['Rock & Roll', 'Male, Female'], query: 'a=b&c' }), AT)
    expect(filters.tags).toEqual(['Rock & Roll', 'Male, Female'])
    expect(filters.query).toBe('a=b&c')
  })

  test('an enum value this build does not know is dropped rather than sent to the sources', () => {
    const filters = parseSearchFilters('season=AUTUMN&status=PENDING&category=BOOK&format=MANGA&format=TV', AT)
    expect(filters.season).toBeNull()
    expect(filters.status).toBeNull()
    expect(filters.category).toBeNull()
    expect(filters.formats).toEqual(['TV'])
  })

  test('a year outside the range a run could carry is dropped', () => {
    expect(parseSearchFilters('year=2026', AT).year).toBe(2026)
    expect(parseSearchFilters(`year=${YEAR_MIN}`, AT).year).toBe(YEAR_MIN)
    expect(parseSearchFilters(`year=${YEAR_MIN - 1}`, AT).year).toBeNull()
    expect(parseSearchFilters(`year=${yearMax(AT) + 1}`, AT).year).toBeNull()
    expect(parseSearchFilters('year=twenty', AT).year).toBeNull()
    expect(parseSearchFilters('year=99', AT).year).toBeNull()
  })

  test('a repeated label is kept once, so a chip cannot need two clicks to clear', () => {
    expect(parseSearchFilters('genre=Action&genre=action&tag=Isekai&tag=ISEKAI', AT))
      .toMatchObject({ genres: ['Action'], tags: ['Isekai'] })
  })

  test('a blank or whitespace value is absence, not a filter matching nothing', () => {
    expect(parseSearchFilters('q=%20%20&genre=&tag=%20', AT)).toEqual(EMPTY_SEARCH_FILTERS)
  })
})

// wouter's useSearch is NOT location.search.slice(1): it is decodeURI(stripQm(...)), so one extra
// decode happens between what is written to the address bar and what the page parses back. Everything
// the codec writes survives it except a literal percent followed by two hex digits, which that decode
// consumes. Pinned rather than fixed: making the writer double-encode would produce a query string
// that is only correct after wouter's decode, which is a worse trap than a mangled "%41".
const throughAddressBar = (query: string) => decodeURI(query)

describe('the round trip through wouter, which decodes once more than URLSearchParams', () => {
  test('ordinary text, separators and non-ASCII all survive', () => {
    for (const query of ['naruto', 'a=b&c', 're:zero', '100%', 'リゼロ', 'a b + c', 'Fate/Zero']) {
      const parsed = parseSearchFilters(throughAddressBar(searchFiltersQuery({ query })), AT)
      expect(parsed.query, query).toBe(query)
    }
  })

  test('a literal percent followed by two hex digits is the one thing that does not', () => {
    const parsed = parseSearchFilters(throughAddressBar(searchFiltersQuery({ query: '%41' })), AT)
    expect(parsed.query).toBe('A')
  })
})

describe('searchPath', () => {
  test('nothing set is the bare route, so a cleared page has a clean address', () => {
    expect(searchPath()).toBe('/search')
    expect(searchPath(EMPTY_SEARCH_FILTERS)).toBe('/search')
  })

  test('the home page link names one season', () => {
    expect(searchPath({ season: seasonValue('SUMMER'), year: 2026 })).toBe('/search?season=SUMMER&year=2026')
  })

  test('the plugin rewrite that runs on EVERY navigation leaves every filter intact', () => {
    // src/plugin-url.ts patches history.pushState, so this runs on the way to the search page whether
    // the navigation came from a <Link>, the header box or a filter control.
    const path = searchPath({
      query: 're zero', season: seasonValue('WINTER'), year: 2024,
      formats: [MediaType.Tv, MediaType.Movie], genres: ['Sci-Fi'], tags: ['Time Manipulation'], status: MediaStatus.Finished,
    })
    const written = writePluginUris(path, ['npm:@banou/stub-plugin'], 'https://stub.moe/')
    expect(parseSearchFilters(new URL(written).search.slice(1), AT)).toEqual({
      query: 're zero',
      category: null,
      status: 'FINISHED',
      season: 'WINTER',
      year: 2024,
      formats: ['TV', 'MOVIE'],
      genres: ['Sci-Fi'],
      tags: ['Time Manipulation'],
    })
  })
})

describe('hasSearchFilters', () => {
  test('nothing set asks no question, so the page subscribes to nothing', () => {
    expect(hasSearchFilters(EMPTY_SEARCH_FILTERS)).toBe(false)
  })

  test('any single axis a source can answer is enough to browse, not just the text', () => {
    for (const filters of [
      { query: 'a' }, { status: MediaStatus.Releasing }, { season: MediaSeason.Summer },
      { year: 2026 }, { formats: [MediaType.Tv] }, { genres: ['Action'] }, { tags: ['Isekai'] },
    ] satisfies Partial<SearchFilters>[]) {
      expect(hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, ...filters })).toBe(true)
    }
  })

  test('a category counts, so clearing the last other chip does not empty the page under it', () => {
    expect(hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, category: MediaCategory.Anime })).toBe(true)
  })
})

describe('namesAQuery', () => {
  test('a category on its own asks nobody anything: no source reads it', () => {
    // The split exists so the page can tell "this filter found nothing" from "this filter never sent
    // a request". Category is applied locally over what the other axes fetched, so alone it fetches
    // nothing, and reporting "No results found" would blame it for a query that was never made.
    expect(namesAQuery({ ...EMPTY_SEARCH_FILTERS, category: MediaCategory.Anime })).toBe(false)
    expect(namesAQuery({ ...EMPTY_SEARCH_FILTERS, category: MediaCategory.Anime, year: 2026 })).toBe(true)
    expect(namesAQuery(EMPTY_SEARCH_FILTERS)).toBe(false)
  })

  test('every other axis is a question a source can be asked', () => {
    for (const filters of [
      { query: 'a' }, { status: MediaStatus.Releasing }, { season: MediaSeason.Summer },
      { year: 2026 }, { formats: [MediaType.Tv] }, { genres: ['Action'] }, { tags: ['Isekai'] },
    ] satisfies Partial<SearchFilters>[]) {
      expect(namesAQuery({ ...EMPTY_SEARCH_FILTERS, ...filters })).toBe(true)
    }
  })
})

describe('isKnownGenre', () => {
  test('splits one Genres and Tags picker into the two keys the schema separates', () => {
    expect(isKnownGenre('Action')).toBe(true)
    expect(isKnownGenre('slice of life')).toBe(true)
    expect(isKnownGenre('Isekai')).toBe(false)
    expect(isKnownGenre('Time Manipulation')).toBe(false)
  })

  test('every offered genre is recognised by the splitter that routes it', () => {
    for (const genre of KNOWN_GENRES) expect(isKnownGenre(genre)).toBe(true)
  })
})

describe('seasonValue', () => {
  test('bridges the two spellings of the four seasons without inventing a third', () => {
    expect(seasonValue('SUMMER')).toBe('SUMMER')
    expect(seasonValue('summer')).toBeNull()
    expect(seasonValue('AUTUMN')).toBeNull()
    expect(seasonValue(null)).toBeNull()
  })
})

describe('searchHeading', () => {
  const of = (filters: Partial<SearchFilters>) => searchHeading({ ...EMPTY_SEARCH_FILTERS, ...filters })

  test('names the browse, so the page does not read Search above a control labelled Search', () => {
    expect(of({})).toBe('Search')
    expect(of({ season: MediaSeason.Summer, year: 2026 })).toBe('Summer 2026')
    expect(of({ year: 2026 })).toBe('2026')
    expect(of({ season: MediaSeason.Summer })).toBe('Summer seasons')
    expect(of({ genres: ['Action'] })).toBe('Browsing')
  })

  test('free text wins, because it is what the reader typed', () => {
    expect(of({ query: 'frieren', season: MediaSeason.Summer, year: 2026 })).toBe('Results for \u201Cfrieren\u201D')
  })
})
