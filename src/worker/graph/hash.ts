/**
 * The one canonical form and the one digest every graph row is hashed with.
 *
 * Split out of `./answers.ts` when the ingest arrived, because the `Answer` key, a `Media.hash`, a
 * `CLAIMS.key` and a claim node's hash all have to agree on what "the same content" means. Two
 * spellings of that would make a re-fetch look new to one table and old to another, which is the
 * exact failure the content hash exists to prevent.
 *
 * `canonicalize` promises object keys sorted recursively with array order kept, and refuses to
 * reorder an array, since a list's order is content. `sha256Hex` promises the lowercase hex digest of
 * the UTF-8 bytes of its argument. Neither knows what it is hashing.
 */

/**
 * Keys that are not content, dropped at EVERY depth before anything is hashed.
 *
 * `_id` is minted per object: `makeMedia` and `makeEpisode` stamp `crypto.randomUUID()` on every row
 * they build, nested handle nodes included (`src/sources/utils.ts:60,84`). Two answers carrying the
 * same facts therefore never hash alike, which turns the design's "a byte-identical re-fetch is a
 * no-op" into nothing at all. Measured on the summer 2026 season walk, 2026-09-12: 572 distinct
 * (origin, uri) listing answers became 127,370 `Answer` rows, each page load re-recording the whole
 * listing, 222.7 times over.
 *
 * It is dropped from the HASH only. `Answer.raw` still carries the bytes the source returned, and
 * `Media.raw` still carries whichever `_id` the merge kept, because the row is what was answered; two
 * rows that differ in nothing else are simply one row, one key and one seq.
 */
const NOT_CONTENT = new Set(['_id'])

/**
 * The canonical form of a value: object keys sorted recursively, array order kept (2.1), minted ids
 * dropped.
 *
 * It exists so that two answers carrying the same facts in a different key order hash alike, which is
 * what makes the re-fetch of a source that iterates an object differently a no-op rather than a
 * second row. An `Answer.raw` is NOT canonicalized: that column keeps the bytes the source returned.
 */
export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value
  const entries = Object.keys(value as object)
    .filter(key => !NOT_CONTENT.has(key))
    .sort()
    .map(key => [key, canonicalize((value as Record<string, unknown>)[key])])
  return Object.fromEntries(entries)
}

/** The canonical JSON text of a value, which is what every hash in the graph is taken over. */
export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value))

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/** The sha-256 of a string, lowercase hex. */
export const sha256Hex = async (text: string): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

/** The content hash of a value: sha-256 over its canonical JSON. */
export const contentHash = (value: unknown): Promise<string> => sha256Hex(canonicalJson(value))
