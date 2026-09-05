// The `mediaPage` filters that can be decided from an aggregated row, kept out of
// ../resolvers/media/index.ts so they can be tested. That module reaches urql and dies under vitest
// with a CommonJS `require('react')`, which is the same reason `sameAsHandleUris` lives in
// ./aggregate.ts and `normalizeToStoreMedia` in ./normalize.ts. A filter nothing can pin is a filter
// nobody can prove empties a page.

import type { Media as GQLMedia } from '../../generated/schema/types.generated'

/**
 * The subset of `MediaPageInput` decided here, as plain data.
 *
 * `search` is absent on purpose: it is scored with a wasm-backed similarity pass and is therefore
 * async, and folding it in would make every caller await a predicate that is otherwise pure.
 *
 * `status` is absent for a different and more important reason. See `applyMediaFilters`.
 */
export type MediaPageFilters = {
  categories?: readonly string[] | null
  formats?: readonly string[] | null
  status?: string | null
  season?: string | null
  seasonYear?: number | null
  genres?: readonly string[] | null
  tags?: readonly string[] | null
}

const labelSet = (labels: readonly string[] | null | undefined): Set<string> =>
  new Set((labels ?? []).map(label => label.toLowerCase()))

/**
 * The medias an aggregated page should keep, given the filters the caller set.
 *
 * STRICT: a filter names values, and a row that cannot show it carries one of them does not match. A
 * media with no `type` fails a format filter, a media with no genres fails a genre filter. The
 * alternative, letting an absent field pass, means a "Movies" filter lists every row no source typed,
 * which is the failure a user reads as broken.
 *
 * Genres and tags are ALL-match, case-insensitively: adding a second genre narrows, which is what
 * every browse UI does and what a user adding one expects. Formats and categories are ANY-match,
 * because they are alternatives rather than refinements.
 *
 * `status` IS filtered here, and it could only become filterable once the home page stopped using it
 * to mean something else. That page asked for RELEASING to mean "the current season", every seasonal
 * source read it that way, and a listing of a season legitimately holds runs that have not aired yet,
 * so enforcing it would have emptied a third of the front page. The home page now names its season
 * (router/home/index.tsx), which leaves this free to mean what it says.
 *
 * It is strict like the rest, and that has a real cost worth knowing: the bundled offline catalogue
 * publishes no status at all, on purpose, because its dump's own value decays within weeks (192 of 219
 * SUMMER 2026 rows read UPCOMING in a dump cut six weeks before they aired). So a status filter drops
 * every row only that catalogue describes. That is the honest answer to "which of these is airing" and
 * it is why status is a filter rather than a default.
 */
export const applyMediaFilters = <T extends Pick<GQLMedia, 'categories' | 'type' | 'status' | 'season' | 'seasonYear' | 'genres' | 'tags'>>(
  medias: readonly T[],
  filters: MediaPageFilters
): T[] => {
  const categories = filters.categories ?? []
  const formats = filters.formats ?? []
  const genres = labelSet(filters.genres)
  const tags = labelSet(filters.tags)
  const { status, season, seasonYear } = filters

  return medias.filter(media => {
    if (categories.length && !(media.categories ?? []).some(category => categories.includes(category))) return false
    if (formats.length && !(media.type && formats.includes(media.type))) return false
    if (status && media.status !== status) return false
    if (season && media.season !== season) return false
    if (seasonYear && media.seasonYear !== seasonYear) return false
    if (genres.size) {
      const carried = labelSet(media.genres)
      for (const genre of genres) if (!carried.has(genre)) return false
    }
    if (tags.size) {
      const carried = labelSet(media.tags)
      for (const tag of tags) if (!carried.has(tag)) return false
    }
    return true
  })
}
