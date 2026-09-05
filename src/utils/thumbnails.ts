/**
 * The first thumbnail url the browser has not failed to load, in the order given, or undefined once
 * every one has. An aggregated episode carries one thumbnail per source, score first; a page that only
 * ever tried the first went blank whenever that source's host refused the viewer (Crunchyroll answers
 * a geo-blocked location with a redirect to an HTML page, 2026-09-05), while the next source's image
 * would have loaded.
 */
export const nextThumbnail = (
  thumbnails: readonly { url: string }[] | null | undefined,
  failed: ReadonlySet<string>
): string | undefined => thumbnails?.find(thumbnail => !failed.has(thumbnail.url))?.url
