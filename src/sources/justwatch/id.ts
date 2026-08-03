// How a JustWatch result is identified. Split out of extractor.ts so it can be tested: that module
// imports the crunchyroll extractor and the source barrel, which cannot be loaded outside a browser.
//
// The whole point of this file is that JustWatch has no season-level node. 'ts222366' is Mushoku
// Tensei entire, seasons 1 through 3 hanging off one id, and the same is true of the provider deep
// links it carries (a hulu.com/series/<uuid> url names the show, not the season).
//
// Stub clusters media by shared handle, so an id that spans seasons union-finds them into ONE media.
// That was visible three ways: picking season 2 out of search opened season 3, an aggregated uri
// carried two anilist ids and two mal ids at once, and two unrelated shows merged when a shared
// handle bridged their clusters.

/** A JustWatch node id, scoped to the season this media represents. */
export const jwId = (objectId: string | number, seasonNumber?: number) =>
  seasonNumber == null ? String(objectId) : `${objectId}-${seasonNumber}`

/** Reverse of jwId: the node to ask JustWatch for, and the season the uri already pinned. */
export const splitJwId = (id: string): { objectId: string, seasonNumber?: number } => {
  const match = /^(\d+)-(\d+)$/.exec(id)
  return match ? { objectId: match[1]!, seasonNumber: Number(match[2]) } : { objectId: id }
}

/**
 * The id a provider handle carries, or undefined when it cannot be given one worth minting.
 *
 * Crunchyroll is the exception to the season suffix: its season-specific identity is
 * '<seriesId>-<seasonId>' (what the crunchyroll source itself mints via crunchyrollId), so appending a
 * season NUMBER would build an id no other source can ever match. An orphan handle is worse than none:
 * it clusters nothing and shows up as a second, emptier entry. The extractor's episode-resolving path
 * still produces a real season-specific crunchyroll id when the offer links to an episode.
 */
export const providerContentId = (
  mappedOrigin: string,
  rawContentId: string,
  seasonNumber?: number,
  multiSeason = false
): string | undefined => {
  // A show whose season we could not determine is the SEARCH path: the mediaPage resolver normalizes
  // the node with no season at all, because JustWatch answers a query with the show. Its provider ids
  // are then correct for the show and poison for stub, which has no show - every media here is one
  // season, so a show-level hulu or crunchyroll id lands on all of them and unions the lot. The jw id
  // itself is safe to leave bare (nothing else mints `jw:`), so the show still appears in search; it
  // just stops dragging every season together through another source's id space.
  if (seasonNumber == null) return multiSeason ? undefined : rawContentId
  return mappedOrigin === 'cr' ? undefined : `${rawContentId}-${seasonNumber}`
}
