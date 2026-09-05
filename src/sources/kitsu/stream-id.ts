// What a Kitsu streaming link contributes as a handle: which provider, which id, and what the path
// says that id NAMES. Split out of extractor.ts so a test and a measurement probe can drive it
// without standing up the resolver, and so the url shape rules sit next to the regex reading them.
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
//
// The first group is captured as well as the second, because the SEGMENT is what says whether the id
// names one title or a container holding several. See `linkNamesOneTitle` below.
const ID_IN_PATH = /\/(series|title|watch|shows?)\/([^/?#]+)/

// Matched against the HOSTNAME, for the same reason: `/(primevideo|amazon)\./` against a whole url
// matches the string anywhere in it, a query parameter included.
const STREAM_ORIGIN: [RegExp, string][] = [
  [/crunchyroll\.com/, 'cr'],
  [/netflix\.com/, 'nf'],
  [/hulu\.com/, 'hulu'],
  [/disneyplus\.com/, 'disney'],
  [/(primevideo|amazon)\./, 'amazon'],
  [/(hbomax|max)\.com/, 'hbo'],
]

/**
 * A streaming link read apart. `scope` is the path segment the id was taken from, and it is the whole
 * basis on which a caller can tell an id that names one title from one that names a container.
 */
export type StreamPointer = { origin: string, id: string, url: string, scope: string }

/** Every (origin, id) a streaming link names. What that id MEANS is decided by the caller. */
export const streamPointers = (urls: (string | undefined | null)[]): StreamPointer[] => {
  const pointers: StreamPointer[] = []
  for (const url of urls) {
    if (!url) continue
    let parsed: URL
    try { parsed = new URL(url) } catch { continue }
    const origin = STREAM_ORIGIN.find(([re]) => re.test(parsed.hostname))?.[1]
    if (!origin) continue
    // no id in the provider's own space means no pointer: a url is not an identity
    const parts = ID_IN_PATH.exec(parsed.pathname)
    if (!parts) continue
    pointers.push({ origin, id: parts[2]!, url, scope: parts[1]! })
  }
  return pointers
}

/**
 * The (origin, path segment) pairs whose id is a per-TITLE id in that provider's own space.
 *
 * AN ALLOWLIST, because minting has no inverse. `graph.link` unions and never unlinks, so a segment
 * nobody has measured must refuse rather than mint: the cost of refusing a good link is a missing row,
 * and the cost of minting a bad one is a permanent merge. A denylist has the wrong default for that.
 *
 *   nf:title  Netflix gives every title its own /title/<id>, film and show alike. 78 of the 148 links
 *             films carry, and 72 distinct ids over 600 films with no two films sharing one.
 *   nf:watch  the same numeric namespace: `unogs/extractor.ts` builds a movie's playable url as
 *             /watch/<the same id it minted>, so a film's /watch/ id equals its /title/ id.
 *
 * Deliberately absent:
 *
 *   cr:*      Crunchyroll publishes a film that belongs to a running series under the SERIES, so a
 *             /series/ id names the whole collection. See `mintableAsFilmHandle` below.
 *   cr:watch  a /watch/<id> is an EPISODE guid, and `crunchyroll/extractor.ts` reads a media id as
 *             `<seriesId>-<seasonId>`, so `cr:<guid>` resolves to nothing: an orphan, not a weld, but
 *             it asserts an identity no Crunchyroll call reproduces. It costs nothing to refuse:
 *             checked live 2026-09-04, kitsu:44544 renders `cr:GMTE00199304`, the film's real series
 *             id, which reaches the page from a source that reads the link correctly.
 *   hulu:*    no kitsu film in the corpus carries a hulu link at all, and `hulu.com/series/<uuid>` is
 *             the same uuid for two seasons, pinned in `tests/unit/sources/justwatch/id.test.ts`.
 *   hbo:*     inverts the convention. `play.hbomax.com/show/<uuid>` was 17 of 17 FILMS with 17
 *             distinct ids, six separate Batman films among them, while /video/watch/<uuid> was 28 of
 *             28 SHOWS. Nothing to act on: kitsu links no hbomax url in 3000 records.
 *   amazon:*  carries no segment ID_IN_PATH reads, so it contributes nothing today.
 */
const ONE_TITLE_IDS = new Set(['nf:title', 'nf:watch'])

/**
 * Whether this pointer's id names THIS FILM, so it can be minted as a handle directly.
 *
 * ONLY SOUND UNDER THE FILM GATE, which is why it takes the whole pointer and is named for films: the
 * two halves are an AND and neither implies the other. Reading it as a general rule about urls is the
 * mistake that shipped twice already, so the signature is built to refuse it.
 *
 * The SUBTYPE half. `/title/<id>` names one title only when the record IS one title. On a cour record
 * Netflix's id is the whole show's: measured 2026-09-04 over 3000 kitsu records, 37 Netflix title ids
 * are shared by two or more runs, `nf:80135674` carrying all five seasons of Boku no Hero Academia and
 * `nf:80179831` five runs of JoJo. Kitsu mints none of those today, because a non-film goes out as
 * PART_OF and the worker asks Netflix on the run's page, and dropping the gate would create all 37.
 *
 * The SHAPE half, which the first version of this predicate missed. "A movie has no seasons to be
 * confused between" is true and beside the point, because the link is not to the movie. Crunchyroll
 * gives a standalone film release its own /watch/ url, but publishes a film belonging to a running
 * series under the SERIES, so a franchise's films hand back one id:
 *
 *   cr:GQWH0M1GG  fifteen kitsu film records   /dragon-ball-z-movies, and the slug says it out loud
 *   cr:GY5P48XEY  kitsu:42586, 44388, 44389, 44390   four separate Demon Slayer films
 *   cr:G5PHNMWX9  six One Piece films
 *
 * A handle is an identity claim, so minting any of those says the records are one media, and
 * `upsertMedia` unions them at insert time, before a single one of the four season mechanisms in
 * worker/store/fuzzy-merge.ts is consulted. `graph.link` has no inverse, so the weld lasts the session.
 *
 * It cost more than the merge when the same id came off a series record. The bare series id is what
 * the Crunchyroll extractor is then handed, and its `getMedia` answers a season-less id with EVERY
 * season's episodes, which is how the season 3 page came to list 24 rows for a 14 episode season.
 */
export const mintableAsFilmHandle = ({ origin, scope }: StreamPointer) => ONE_TITLE_IDS.has(`${origin}:${scope}`)
