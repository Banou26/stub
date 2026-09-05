// The search page's whole state, as a url and back. Pure and preact-free so it can be tested: the
// page itself reaches wouter and preact, and a codec nobody can pin is a codec that silently drops a
// filter the day a param is renamed.

import { MediaCategory, MediaSeason, MediaStatus, MediaType } from '../../generated/graphql'

/**
 * Every axis the search page filters on.
 *
 * One type rather than a bag of props, because three places have to agree on it: the page that renders
 * the controls, the header search box that must not wipe the rest while rewriting `query`, and the
 * home page linking in with a season prefilled.
 *
 * Absent is spelled `null` for the single-valued axes and `[]` for the multi-valued ones, never
 * `undefined`, so a parsed url and a hand-built filter set compare equal.
 */
export type SearchFilters = {
  query: string
  category: MediaCategory | null
  status: MediaStatus | null
  season: MediaSeason | null
  year: number | null
  formats: MediaType[]
  genres: string[]
  tags: string[]
}

/**
 * The param names, in the order they are written.
 *
 * Repeated keys carry the multi-valued axes (`format=TV&format=MOVIE`) rather than a joined string:
 * a genre may contain a comma and a tag certainly can, so any separator would need escaping that
 * `URLSearchParams` already does for free.
 */
export const SEARCH_PARAMS = {
  query: 'q',
  category: 'category',
  status: 'status',
  season: 'season',
  year: 'year',
  format: 'format',
  genre: 'genre',
  tag: 'tag',
} as const

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  query: '',
  category: null,
  status: null,
  season: null,
  year: null,
  formats: [],
  genres: [],
  tags: [],
}

/** The formats the page offers, in the order the picker lists them. */
export const FORMAT_OPTIONS = [
  { value: MediaType.Tv, label: 'TV Show' },
  { value: MediaType.Movie, label: 'Movie' },
  { value: MediaType.TvShort, label: 'TV Short' },
  { value: MediaType.Special, label: 'Special' },
  { value: MediaType.Ova, label: 'OVA' },
  { value: MediaType.Ona, label: 'ONA' },
] as const

/**
 * The statuses the page offers.
 *
 * All five, because all five can now be answered: AniList's mapping covered only NOT_YET_RELEASED,
 * RELEASING and FINISHED until CANCELLED and HIATUS were added alongside this page, so a picker
 * offering either would have matched nothing.
 */
export const STATUS_OPTIONS = [
  { value: MediaStatus.Releasing, label: 'Airing' },
  { value: MediaStatus.Finished, label: 'Finished' },
  { value: MediaStatus.NotYetReleased, label: 'Not yet aired' },
  { value: MediaStatus.Cancelled, label: 'Cancelled' },
  { value: MediaStatus.Hiatus, label: 'Hiatus' },
] as const

export const SEASON_OPTIONS = [
  { value: MediaSeason.Winter, label: 'Winter' },
  { value: MediaSeason.Spring, label: 'Spring' },
  { value: MediaSeason.Summer, label: 'Summer' },
  { value: MediaSeason.Fall, label: 'Fall' },
] as const

export const CATEGORY_OPTIONS = [
  { value: MediaCategory.Anime, label: 'Anime' },
  { value: MediaCategory.Series, label: 'Series' },
  { value: MediaCategory.Movie, label: 'Movies' },
] as const

/**
 * AniList's genre vocabulary, which is the one the sources actually emit.
 *
 * A fixed list rather than a facet over the current results, because the control has to be usable
 * BEFORE anything is loaded: on an empty search page the results are empty, and a facet would offer
 * nothing to filter by. It is short and stable (AniList has published these since the v2 API), where
 * tags number in the hundreds and change, which is why tags are offered as a facet instead.
 *
 * jikan's own vocabulary is wider (its themes and demographics land in `genres` too, so "Isekai" and
 * "Shounen" appear on media as well). Those reach the picker through the facet, not through this list.
 *
 * ONE genre is deliberately missing. AniList's list also carries "Hentai", and its own browse hides it
 * behind an adult toggle. stub has an `isAdult` column that NO source fills and NO view reads, so there
 * is nothing here to gate it with, and offering it would be offering a filter with no control beside it.
 */
export const KNOWN_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha',
  'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural',
  'Thriller',
] as const

const GENRE_KEYS = new Set<string>(KNOWN_GENRES.map(genre => genre.toLowerCase()))

/** Whether a label is a genre rather than a tag, which is what splits one picker into two url keys. */
export const isKnownGenre = (label: string): boolean => GENRE_KEYS.has(label.trim().toLowerCase())

const memberOf = <T extends string>(values: readonly T[], raw: string | null): T | null =>
  values.find(value => value === raw) ?? null

const membersOf = <T extends string>(values: readonly T[], raw: string[]): T[] =>
  raw.map(entry => memberOf(values, entry)).filter((value): value is T => value !== null)

/**
 * A season name as the schema's enum, or nothing.
 *
 * The bridge between `MEDIA_SEASONS` in sources/season.ts, which is a plain string union the worker
 * and the extractors share, and the generated enum the GraphQL variables are typed against. Both
 * spell the four seasons identically; TypeScript simply does not consider a string literal a member
 * of a string enum, and this is the one place that gap is crossed.
 */
export const seasonValue = (name: string | null | undefined): MediaSeason | null =>
  SEASON_OPTIONS.map(option => option.value).find(value => value === name) ?? null

const FORMAT_VALUES = FORMAT_OPTIONS.map(option => option.value)
const STATUS_VALUES = STATUS_OPTIONS.map(option => option.value)
const SEASON_VALUES = SEASON_OPTIONS.map(option => option.value)
const CATEGORY_VALUES = CATEGORY_OPTIONS.map(option => option.value)

/**
 * A year a run could plausibly carry, or nothing.
 *
 * Bounded rather than merely numeric so a hand-edited url cannot put an unusable value into the
 * GraphQL variables, where it would fan out to every source. The lower bound is the first commercial
 * anime broadcast; the upper is generous enough for a work announced years ahead.
 */
export const YEAR_MIN = 1917
export const yearMax = (now = new Date()) => now.getFullYear() + 5

const parseYear = (raw: string | null, now = new Date()): number | null => {
  if (!raw || !/^\d{4}$/.test(raw)) return null
  const year = Number(raw)
  return year >= YEAR_MIN && year <= yearMax(now) ? year : null
}

/**
 * The filters a query string names, with everything unrecognised dropped.
 *
 * Takes the string WITHOUT its leading `?`, which is what wouter's `useSearch` returns. That is not
 * `location.search.slice(1)`: wouter applies `decodeURI` on the way out, so one extra decode happens
 * between what this module writes and what it reads back. Everything survives it except a literal
 * percent followed by two hex digits, which that decode consumes, so a search for `%41` reads back as
 * `A`. Left alone deliberately: double-encoding on the way out would make the written query string
 * correct only after wouter's decode, which is a worse trap than one mangled term. Pinned in
 * tests/unit/router/search-params.test.ts.
 *
 * Never throws:
 * a url is user input and a malformed one has to render an empty search page rather than a blank
 * screen, so an unknown enum value, a non-numeric year and a repeated single-valued key all resolve to
 * the same thing as absence.
 */
export const parseSearchFilters = (search: string, now = new Date()): SearchFilters => {
  const params = new URLSearchParams(search)
  return {
    query: (params.get(SEARCH_PARAMS.query) ?? '').trim(),
    category: memberOf(CATEGORY_VALUES, params.get(SEARCH_PARAMS.category)),
    status: memberOf(STATUS_VALUES, params.get(SEARCH_PARAMS.status)),
    season: memberOf(SEASON_VALUES, params.get(SEARCH_PARAMS.season)),
    year: parseYear(params.get(SEARCH_PARAMS.year), now),
    formats: membersOf(FORMAT_VALUES, params.getAll(SEARCH_PARAMS.format)),
    genres: dedupeLabels(params.getAll(SEARCH_PARAMS.genre)),
    tags: dedupeLabels(params.getAll(SEARCH_PARAMS.tag)),
  }
}

// A url can repeat a label, and the page renders one chip per entry, so a duplicate would render twice
// and take two clicks to clear. Case-insensitive to match how the store compares them.
const dedupeLabels = (labels: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of labels) {
    const label = raw.trim()
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

/** The query string for a filter set, without its leading `?`. Empty when nothing is filtered. */
export const searchFiltersQuery = (filters: Partial<SearchFilters>): string => {
  const params = new URLSearchParams()
  const query = filters.query?.trim()
  if (query) params.set(SEARCH_PARAMS.query, query)
  if (filters.category) params.set(SEARCH_PARAMS.category, filters.category)
  if (filters.status) params.set(SEARCH_PARAMS.status, filters.status)
  if (filters.season) params.set(SEARCH_PARAMS.season, filters.season)
  if (filters.year) params.set(SEARCH_PARAMS.year, String(filters.year))
  for (const format of filters.formats ?? []) params.append(SEARCH_PARAMS.format, format)
  for (const genre of filters.genres ?? []) params.append(SEARCH_PARAMS.genre, genre)
  for (const tag of filters.tags ?? []) params.append(SEARCH_PARAMS.tag, tag)
  return params.toString()
}

/**
 * The href for a filter set.
 *
 * Lives here rather than in ../path.ts on purpose: that module is imported by the WORKER (through
 * store/aggregate.ts, which builds a media's canonical url) and is deliberately dependency-free, while
 * this one reaches the generated enums.
 */
export const searchPath = (filters: Partial<SearchFilters> = {}): string => {
  const query = searchFiltersQuery(filters)
  return query ? `/search?${query}` : '/search'
}

/**
 * What the page is showing, as a heading.
 *
 * Not merely decoration: the first control is itself labelled "Search", so a page headed "Search" says
 * the same word twice and names nothing. A season browse arrives here from the home page with no text
 * at all, and what the reader wants to see confirmed is the season.
 */
export const searchHeading = (filters: SearchFilters): string => {
  if (filters.query) return `Results for \u201C${filters.query}\u201D`
  const season = SEASON_OPTIONS.find(option => option.value === filters.season)?.label
  if (season && filters.year) return `${season} ${filters.year}`
  if (season) return `${season} seasons`
  if (filters.year) return String(filters.year)
  return hasSearchFilters(filters) ? 'Browsing' : 'Search'
}

/** Whether anything is filtered at all. Nothing set means the page asks nothing and shows a prompt. */
export const hasSearchFilters = (filters: SearchFilters): boolean =>
  Boolean(
    filters.query || filters.category || filters.status || filters.season || filters.year
    || filters.formats.length || filters.genres.length || filters.tags.length
  )

/**
 * Whether anything here is a QUESTION a source can answer, as opposed to a refinement of one.
 *
 * `category` is the only axis that is purely a refinement: no source reads it, and the worker applies
 * it locally over whatever the other axes fetched. A page holding nothing else has therefore asked
 * nobody anything, and settling on "No results found" would blame the filter for a request that was
 * never made. The page says "pick something to browse" instead.
 *
 * It still counts as a filter for `hasSearchFilters`, so its chip renders and clearing the last other
 * filter does not make the whole page vanish underneath it.
 */
export const namesAQuery = (filters: SearchFilters): boolean =>
  Boolean(
    filters.query || filters.status || filters.season || filters.year
    || filters.formats.length || filters.genres.length || filters.tags.length
  )
