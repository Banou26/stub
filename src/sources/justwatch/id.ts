// How a JustWatch result is identified. Split out of extractor.ts so it can be tested: that module
// imports the crunchyroll extractor and the source barrel, which cannot be loaded outside a browser.
//
// JustWatch has no season-level node. 'ts222366' is Mushoku Tensei entire, seasons 1 through 3 hanging
// off one id, and its provider deep links are show-level too (a hulu.com/series/<uuid> url names the
// show). Stub has no notion of a show - every media here is ONE season - so a show-level id lands on
// all of them and union-finds them into a single media. That was visible three ways: picking season 2
// out of search opened season 3, an aggregated uri carried two anilist ids and two mal ids at once,
// and two unrelated shows merged once a shared handle bridged their clusters.
//
// So the rule is absolute: a series media is `<node>-<season>`, never the bare node id.
//
// The suffix is the SEASON'S OWN objectId, not its ordinal. JustWatch gives every season one
// (Mushoku Tensei is 222366 with seasons 230388, 378206, 490814), so this is a real id in their space
// rather than a position in a list - it does not move when a season is renumbered, split into cours,
// or has a recap inserted ahead of it, all of which happen and all of which would otherwise silently
// repoint an existing uri at different episodes.

/** A JustWatch node id scoped to one season. This is the only id shape a series media may carry. */
export const jwId = (objectId: string | number, seasonObjectId: string | number) => `${objectId}-${seasonObjectId}`

/** Reverse of jwId: the node to ask JustWatch for, and the season the uri pinned. */
export const splitJwId = (id: string): { objectId: string, seasonObjectId?: number } => {
  const match = /^(\d+)-(\d+)$/.exec(id)
  return match ? { objectId: match[1]!, seasonObjectId: Number(match[2]) } : { objectId: id }
}

/**
 * Whether this node needs a season before it can become a media.
 *
 * A movie has no seasons to be confused between, so its bare node id identifies it exactly. Anything
 * else is a series, and a series without a season number is precisely the id that merges every season
 * of the show together.
 */
export const showRequiresSeason = (objectType: string | undefined) => objectType !== 'MOVIE'

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
  seasonNumber?: number
): string | undefined => {
  if (seasonNumber == null) return rawContentId
  return mappedOrigin === 'cr' ? undefined : `${rawContentId}-${seasonNumber}`
}
