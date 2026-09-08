/**
 * Which sources can answer a question about a given set of origins.
 *
 * Its own module, with no imports, because `worker/extractor.ts` reaches urql and cannot load under
 * vitest: same reason `anilist/frontend.ts` and `jikan/season-scrape.ts` are split out.
 */

export type Answerable = {
  /** The origin this source PUBLISHES under, which is the prefix on every uri it mints. */
  origin: string
  /** The origins whose ids this source can be ASKED with. Absent means only its own. */
  supportedUris?: readonly string[]
}

/**
 * Whether a source can answer once these origins are known.
 *
 * TWO SETS, and conflating them is a whole class of source that never answers. A source publishes
 * under one origin and is addressable by others: anizip mints `anizip:` uris but answers from an
 * anidb or a mal id, so its own name cannot appear in a cluster until it has already answered. Asked
 * only when its own origin shows up, it is never asked at all, and its data appeared only on a reload
 * where the address already carried the mal id (measured 2026-09-09 on `ag:(anilist:166873)`, which
 * settled without anizip and gained it on a second load).
 *
 * `supportedUris` is declared by every source in this directory and was read by nothing until this.
 */
export const answersForOrigins = (source: Answerable, origins: readonly string[]): boolean =>
  origins.includes(source.origin)
  || (source.supportedUris ?? []).some(origin => origins.includes(origin))
