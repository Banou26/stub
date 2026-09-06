// Import-free so it can be tested: an extractor pulls in the source barrel and, through it, a
// CommonJS require of react that cannot load outside a browser. Same reason ./aired-date.ts and
// ./season.ts are separate.

/**
 * A source's own rating, as the 0 to 100 percentage `Media.averageScore` promises.
 *
 * `scale` is the source's maximum: 10 for a MAL, IMDb, simkl or TMDB style rating, 100 for AniList's
 * and kitsu's. A missing, unparseable or out-of-range value answers `undefined`, which is what a
 * source with no rating says.
 *
 * The field's contract was never enforced and six of the ten sources that fill it emitted a 0 to 10
 * rating into it. jikan is one of them and outranks AniList in `worker/store/aggregate.ts`, so
 * wherever both answered, the cluster carried 8 for a show AniList scores 83. Nothing rendered
 * `averageScore` until the search page's card and list modes did, which is why it went unnoticed.
 */
export const percentScore = (value: number | string | null | undefined, scale: 10 | 100): number | undefined => {
  const raw = typeof value === 'string' ? Number(value) : value
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined
  const percent = Math.round(scale === 10 ? raw * 10 : raw)
  return percent > 0 && percent <= 100 ? percent : undefined
}
