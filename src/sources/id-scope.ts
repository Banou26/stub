// What an id NAMES, answered by the source that owns the origin.
//
// Split into its own module with NO imports, for the same reason season.ts is: the store has to read
// this, and an extractor pulls in a CommonJS `require('react')` through the players barrel that cannot
// load outside a browser. Only the per-source entries below reach into a source, and each one is a
// pure function over a string.

/**
 * What an id of a source's own origin can name.
 *
 * RUN        one cour or one film. This is what stub models as a media, so a SAME_AS is honest.
 * CONTAINER  a show or a collection holding several runs. `graph.link` is a union with no inverse,
 *            so one SAME_AS on a container welds every run that touches it for the session.
 * UNKNOWN    nobody has surveyed this origin. Behaves exactly as the store behaved before this
 *            module existed, which is what lets it be adopted one source at a time.
 *
 * UNKNOWN IS NOT "AMBIGUOUS". An origin whose shape genuinely cannot tell answers CONTAINER, which
 * is the allowlist stance the rest of the codebase already takes: a refused link costs a row, a wrong
 * one costs a permanent weld. UNKNOWN means the question has not been asked yet.
 */
export type IdScope = 'RUN' | 'CONTAINER' | 'UNKNOWN'

/**
 * What the store can offer a classifier beyond the id, for an origin whose shape cannot decide alone.
 *
 * Everything is optional: a uri may name a union-find member with no stored row at all, since
 * `graph.link` and `graph.edge` both accept a uri that was never `set`.
 */
export type IdEvidence = {
  categories?: readonly string[] | null
}

/** Takes the id part, never the uri: a source is only ever asked about its own origin. */
export type ClassifyId = (id: string, evidence?: IdEvidence) => IdScope

/**
 * A Crunchyroll id is `<seriesGuid>` or `<seriesGuid>-<seasonGuid>`, joined by `crunchyrollId`.
 *
 * The bare form names the SERIES, so it is a container. That is stricter than it sounds and the cost
 * is smaller than it sounds, because `getMedia` never leaves a single-season series on its bare id:
 * `targetSeason` falls back to `seasons[0]` when there is exactly one, so the answer comes back as
 * two segments (pinned by crunchyroll/extractor.test.ts, 'a single-season series keeps its episodes
 * when asked by the bare series id'). The only bare ids in the store are SEARCH rows, which are
 * minted from a payload carrying no season count, and every path that RESOLVES crunchyroll for a
 * media (anilist's matchSeasonByDate, kitsu's resolveSeason, justwatch's resolveEpisodeToSeriesId,
 * opening the page at all) produces the two-segment form and is untouched.
 *
 * Three segments is an EPISODE id and never reaches the media union-find, but it names one episode
 * of one season, so RUN is the honest answer if it ever does.
 */
export const classifyCrunchyrollId: ClassifyId = id =>
  id.includes('-') ? 'RUN' : 'CONTAINER'

/**
 * A Netflix id is `<netflixid>` or `<netflixid>-<seasonNumber>`, the suffix added by unogs' getMedia.
 *
 * THE BARE FORM IS THE HARD CASE and the shape cannot decide it: `normalizeTitle` builds one uri for
 * a film and for a whole series alike, so `nf:80987039` is either one movie, which is a run, or every
 * season of a show, which is a container. The stored row settles it, because the same function stamps
 * `categories` from Netflix's own `vtype` on both the detail and the search path.
 *
 * A bare id with NO categories is a row minted by somebody else: watchmode and justwatch both hand
 * back `makeMedia({ origin, id, url })`, which defaults `categories: []`. Nothing there says which it
 * is, so it answers UNKNOWN rather than guessing. Those two already mint their provider handles
 * PART_OF, so the guard they would want is one they do not need.
 */
export const classifyNetflixId: ClassifyId = (id, evidence) => {
  if (/-\d+$/.test(id)) return 'RUN'
  const categories = evidence?.categories
  if (!categories?.length) return 'UNKNOWN'
  if (categories.includes('MOVIE')) return 'RUN'
  return 'CONTAINER'
}

/**
 * An IMDb `tt` id for a series is the SERIES, and there is no season-level equivalent to name
 * instead, so every season of a show carries the same one.
 *
 * ALWAYS CONTAINER, INCLUDING FOR A FILM, which is not quite true and is deliberate: this is the case
 * the store special-cased as `SHOW_LEVEL_ORIGINS`, and that Set demoted every imdb handle whatever it
 * named. Answering the same thing here keeps the behaviour byte-identical while the predicate moves,
 * so the live check below measures the crunchyroll and netflix change and nothing else. A film's tt
 * really does name one run, and telling the two apart is a later step, along with omdb, which
 * republishes an IMDb tt under its OWN origin and so escapes this entirely today.
 */
export const classifyImdbId: ClassifyId = () => 'CONTAINER'

/**
 * Every origin that has been surveyed, keyed by the origin string the source EXPORTS.
 *
 * KEYED BY `origin`, NOT BY FOLDER NAME, and the difference is not academic: `jikan/extractor.ts`
 * exports `mal` and `justwatch/extractor.ts` exports `jw`. A wrong key here is the one way this whole
 * feature goes silently inert, because an origin nobody claims answers UNKNOWN and UNKNOWN is exactly
 * today's behaviour, so no existing test would go red. `id-scope.test.ts` asserts every key below is
 * an origin some source actually exports.
 */
export const ID_SCOPES: Record<string, ClassifyId> = {
  cr: classifyCrunchyrollId,
  nf: classifyNetflixId,
  imdb: classifyImdbId,
}

/** Whatever the owning source says about this uri, or UNKNOWN when no source has been surveyed. */
export const scopeOfUri = (uri: string, evidence?: IdEvidence): IdScope => {
  const separator = uri.indexOf(':')
  if (separator < 0) return 'UNKNOWN'
  return ID_SCOPES[uri.slice(0, separator)]?.(uri.slice(separator + 1), evidence) ?? 'UNKNOWN'
}
