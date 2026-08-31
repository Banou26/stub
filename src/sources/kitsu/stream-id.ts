// The id a Kitsu streaming link contributes as a handle, or undefined when it carries none.
//
// Split out of extractor.ts so it can be tested: that module reaches the source barrel, which cannot
// be loaded outside a browser.
//
// A handle's id has to be an id in that provider's OWN space. It is what clusters this media with the
// provider's source, and it rides inside `ag:(...)` and inside a single route segment. Falling back to
// the whole url when the path shape is unrecognised broke both at once: a Crunchyroll link with no
// '/series/' segment minted
//
//   cr:https://www.crunchyroll.com/mushoku-tensei-jobless-reincarnation
//
// whose two extra slashes made '/watch/:mediaUri/:episodeUri' unmatchable, so opening an episode
// rendered the catch-all "404 No page found" with nothing on screen to point at. A url is not an
// identity in any case - it clusters with nothing - so a link we cannot read an id out of is dropped.
const ID_IN_PATH = /\/(?:series|title|watch|shows?)\/([^/?#]+)/

/**
 * Whether the id off a streaming link may be minted as a handle DIRECTLY.
 *
 * False does not mean the link is thrown away. It means the id is the show's rather than this run's,
 * so it cannot be an identity claim and is spent the other way instead: `streamHandles` in
 * ./extractor.ts hands it to the origin that owns it through `ctx.resolveSeason`, with the date of
 * our run, and takes back a season-scoped media. This predicate only decides which of those two
 * paths a link takes.
 *
 * A kitsu streaming link names the SHOW and never the season, so the id read out of it is the show's.
 * Measured 2026-08-31, straight off /anime/<id>/streaming-links: the identical
 * `https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation` is published on
 * kitsu:45950 (Mushoku Tensei season 2), kitsu:47694 (season 2 part 2) AND kitsu:49002 (season 3).
 *
 * A handle is an identity claim, so minting `cr:G24H1N3MP` on all three says those three seasons are
 * one media, and `upsertMedia` unions them at insert time, before a single one of the four season
 * mechanisms in worker/store/fuzzy-merge.ts is consulted. `graph.link` has no inverse, so the weld
 * lasts the session and the merged cluster then goes on to weld a fourth. It is the same defect Apple
 * TV had, and the fix is the same one: at the source, in the id it mints.
 *
 * It cost more than the merge, too. The bare series id is also what the Crunchyroll extractor is then
 * handed, and its `getMedia` answers a season-less id with EVERY season's episodes, which is how the
 * season 3 page came to list 24 rows for a 14 episode season: rows 12 to 24 were season 1.
 *
 * A MOVIE has no seasons to be confused between, so its bare provider id identifies it exactly. That
 * is the distinction justwatch/id.ts already draws with `showRequiresSeason`, and kitsu carries the
 * field to draw it: `subtype`. Anything else has to go and ask, because kitsu publishes no
 * season-scoped url to build an honest id out of, and an invented one clusters with nothing.
 */
export const streamLinkIsIdentifying = (subtype: string | null | undefined) => subtype === 'movie'

export const streamContentId = (url: string): string | undefined => ID_IN_PATH.exec(url)?.[1]
