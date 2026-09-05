// Which media the homepage hero can actually be built from, split out with NO app imports so it can
// be tested: the vitest project only picks up src/worker, src/sources and src/utils, and a component
// pulls in Preact and Emotion besides.

/** Only the parts of a media the hero reads. Deliberately structural, so any source can satisfy it. */
export type TheaterCandidate = {
  _id?: string | null
  uri?: string | null
  titles?: readonly unknown[] | null
  shortDescriptions?: readonly unknown[] | null
  trailers?: readonly unknown[] | null
}

/** How the hero remembers WHICH show it is showing. An index cannot: the listing reorders under it. */
export const theaterKey = (media: TheaterCandidate): string => media._id ?? media.uri ?? ''

/**
 * The media the hero can render, best first.
 *
 * The hero shows a title, a short description, and autoplays a trailer when there is one. So those
 * are the things to select on.
 *
 * It used to gate on `score >= 0.8` instead, which was never a quality measure: `score` is the
 * source-confidence weight the store merges fields by, and 0.8 only ever meant "AniList (0.9) or
 * Jikan (0.9) is in this cluster". When both went down on 2026-08-16 every remaining record scored
 * Kitsu's 0.3, `aggregateMedia` takes the cluster MAX, and the hero silently rendered an empty shell
 * while the season row below it was full. Gating on the fields actually used cannot fail that way,
 * because a source that can fill the hero is by definition good enough for it.
 *
 * A trailer is preferred rather than required: with no trailer the hero still shows a title and a
 * description, which beats showing nothing.
 */
export const theaterCandidates = <T extends TheaterCandidate>(mediaNodes: readonly T[]): T[] => {
  const usable = mediaNodes.filter(media => media.titles?.length && media.shortDescriptions?.length)
  const withTrailer = usable.filter(media => media.trailers?.length)
  return withTrailer.length ? withTrailer : usable
}

/** How many of the candidates the hero picks between. Kept small so it stays a highlight reel. */
export const THEATER_POOL_SIZE = 10

/**
 * An index into the candidates that is not banned, or undefined when every choice is exhausted.
 *
 * `pick` is injected so a test does not depend on Math.random.
 *
 * The bound matters: the previous loop retried forever when every index in range was banned, and
 * `onTrailerError` bans one on each failed trailer, so a handful of dead trailers on a short season
 * was enough to spin the render.
 */
export const pickTheaterIndex = (
  candidateCount: number,
  banned: readonly number[] = [],
  pick: (limit: number) => number = limit => Math.floor(Math.random() * limit)
): number | undefined => {
  const limit = Math.min(THEATER_POOL_SIZE, candidateCount)
  if (limit <= 0) return undefined
  const allowed = Array.from({ length: limit }, (_, index) => index).filter(index => !banned.includes(index))
  if (!allowed.length) return undefined
  return allowed[Math.min(allowed.length - 1, Math.max(0, pick(allowed.length)))]
}

/**
 * The show the hero should be showing: the one it is already showing, for as long as that is possible.
 *
 * The hero used to pick by INDEX, memoized on the candidate COUNT, with `Math.random`. The count grows
 * as sources answer (22 from the bundle, then more), so every growth re-rolled a new random index, and
 * an index also repoints at a different show whenever the listing reorders under it. The owner saw the
 * result: "the theater switches between 5 different anime in like 1s, and it ALWAYS happens".
 *
 * So the pick is remembered by KEY and only re-made when it has to be: the show left the candidates,
 * or its trailer failed and it was banned. Banning is by key too, since an index bans whichever show
 * happens to sit there next.
 *
 * `pick` is injected so a test does not depend on Math.random.
 */
export const holdTheaterPick = <T extends TheaterCandidate>(
  candidates: readonly T[],
  current: string | undefined,
  banned: readonly string[] = [],
  pick: (limit: number) => number = limit => Math.floor(Math.random() * limit)
): T | undefined => {
  const pool = candidates.slice(0, THEATER_POOL_SIZE).filter(media => !banned.includes(theaterKey(media)))
  const held = current && pool.find(media => theaterKey(media) === current)
  if (held) return held
  if (!pool.length) return undefined
  return pool[Math.min(pool.length - 1, Math.max(0, pick(pool.length)))]
}
