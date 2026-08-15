// Kitsu's season pagination, split out with NO imports so it can be tested: an extractor pulls in
// the source barrel and, through it, a CommonJS `require('react')` that cannot load outside a
// browser. Same reason ./stream-id.ts is its own module.

/**
 * Kitsu caps a page at 20 and says so: `page[size]=40` answers 400 "size exceeds maximum page size
 * of 20". The `page[limit]` spelling of the same mistake answers 200 with an EMPTY list instead,
 * which reads exactly like a season with nothing in it.
 */
export const SEASON_PAGE_SIZE = 20

/**
 * Eight pages reaches 160 titles. Summer 2026 was 117 and Kitsu's neighbouring seasons were 133 to
 * 135, so this clears a busy season. Pages past the end return an empty list, costing one request
 * each and nothing else.
 */
export const SEASON_PAGES = 8

/**
 * The season page as a query string.
 *
 * **Use `page[size]` and `page[number]`, never `page[limit]` and `page[offset]`.** The offset pair
 * is the one Kitsu's own docs describe, and its `links.next` advertises it, but it is broken in
 * combination with the season filter: `offset=0` and `offset=20` return the SAME twenty titles, so
 * a naive walk fetches page one twice and loses the tail. Measured against summer 2026
 * (`meta.count` 117) on 2026-08-16:
 *
 *     page[offset]   0  20  40  60   80  100  120
 *     new titles    20   0  20  20   20   20   17   = 117 only if 20 is skipped, 100 if it is not
 *     page[number]   1   2   3   4    5    6    7
 *     new titles    20  20  20  20   20   17    0   = 117, the whole season, no special cases
 *
 * Ruled out as the cause of the offset behaviour: caching (`cf-cache-status: DYNAMIC`, and
 * cache-busted), concurrency (sequential fetches behave identically) and the sort (three different
 * sorts, same boundary). Dropping the season filter makes offset paging work again, so it is the
 * combination that fails.
 *
 * `sort=-userCount` is a HINT, not an order: over the 117 rows returned, 53 of the 116 adjacent
 * pairs violate descending userCount. It is asked for anyway so that a partial result skews toward
 * titles someone wants, but the real ordering is stub's own, applied over the merged page.
 * `createdAt` rides along only to make the window deterministic between requests.
 */
export const seasonQuery = (
  { season, year, page }: { season: string, year: number, page: number }
) =>
  `/anime?filter%5Bseason%5D=${season}&filter%5BseasonYear%5D=${year}`
  + `&page%5Bsize%5D=${SEASON_PAGE_SIZE}&page%5Bnumber%5D=${page}`
  + `&sort=-userCount%2CcreatedAt&include=mappings`

/** The page numbers one season walk asks for. Kitsu numbers pages from 1, not 0. */
export const seasonPageNumbers = (pages = SEASON_PAGES) =>
  Array.from({ length: pages }, (_, index) => index + 1)
