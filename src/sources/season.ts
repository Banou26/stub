// Season identity for sources that model a SHOW where stub models a season.
//
// TMDB, JustWatch, IMDb and TVmaze all describe a series as one entity with seasons hanging off it.
// Stub has no such entity - every media here is one season - so a source that hands back the show's id
// hands the same id back for every season, and clustering union-finds them into a single media. That
// is what merged all three Mushoku Tensei seasons, and what made picking season 2 out of search open
// season 3.
//
// Split into its own module with NO imports so it can be tested: an extractor pulls in the source
// barrel and, through it, a CommonJS `require('react')` that cannot load outside a browser.

/** 'Mushoku Tensei Season 3', '... Part 2', '... Cour 2' -> the number. */
export const parseSeasonNumber = (title: string): number | undefined => {
  const match = title.match(/\b(?:Season|Part|Cour)\s+(\d+)\b/i)
  return match ? Number(match[1]) : undefined
}

/**
 * Which season has about this many episodes.
 *
 * The fallback for when nothing in the title says. Ambiguous by nature - two seasons of twelve are
 * indistinguishable this way - so it is only ever reached after the title has been tried, and it
 * returns nothing at all when there is only one season, because then there is nothing to choose.
 */
export const pickSeasonByEpisodeCount = (
  seasons: { seasonNumber: number, episodeCount: number }[],
  targetCount: number
): number | undefined => {
  if (seasons.length <= 1) return undefined
  let best: { seasonNumber: number, diff: number } | undefined
  for (const season of seasons) {
    const diff = Math.abs(season.episodeCount - targetCount)
    if (!best || diff < best.diff) best = { seasonNumber: season.seasonNumber, diff }
  }
  return best?.seasonNumber
}

// The '-s<n>' suffix, which is what TMDB's own episode ids already use ('94664-s3e1'). Keeping the
// media on the same convention means the two read as one id space rather than two.
const SEASON_SCOPED = /^(.+)-s(\d{1,3})$/

/** A show id scoped to one season. The only id shape a season-scoped media may carry. */
export const seasonScopedId = (id: string | number, seasonNumber: number) => `${id}-s${seasonNumber}`

/** Reverse of seasonScopedId: the show to ask for, and the season the uri pinned. */
export const splitSeasonScopedId = (id: string): { showId: string, seasonNumber?: number } => {
  const match = SEASON_SCOPED.exec(id)
  return match ? { showId: match[1]!, seasonNumber: Number(match[2]) } : { showId: id }
}
