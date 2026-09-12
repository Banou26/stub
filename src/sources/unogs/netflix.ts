// Netflix's OWN data endpoint: the one www.netflix.com's public title pages call for their season and
// episode lists. It is NOT a documented or supported API, nobody publishes a contract for it, and it
// can change shape or disappear without notice. Everything below is written so that a change says so
// instead of quietly becoming an empty answer, because an empty answer here reads as "this title has
// no episodes" and that claim welds runs together downstream.
//
// Measured 2026-09-12 against www.netflix.com, anonymous, no cookie: HTTP 200, 41 KB, 0.52 to 0.54 s
// over five runs. CORS is open (OPTIONS answers 200 with access-control-allow-origin: *, and a POST
// carrying Origin: https://stub.moe is answered with that origin reflected), so a browser can make
// this call.
import type { ExtractorServerContext } from '../../worker/extractor'

/** The endpoint. Public title pages call it unauthenticated; see `fetchNetflixTitle` on credentials. */
export const NETFLIX_GRAPHQL_URL = 'https://www.netflix.com/graphql'

/**
 * The persisted query www.netflix.com sends for a logged-out title page, id and version exactly as
 * Netflix's own bundle spells them (measured 2026-09-12: 217277fd, version 102).
 *
 * WHEN IT GOES STALE, and it will: Netflix edits the query, the server stops recognising this id, and
 * every call is answered `PersistedQueryNotFound`. That arrives as `failure: 'persisted-query-stale'`
 * from `fetchNetflixTitle`, never as a title with no seasons.
 *
 * RECOVERY, which is a read rather than a guess: load a title page on www.netflix.com logged out, find
 * `LodpTitleAndPlansPageQueryDocument` in the page bundle, and read `__meta__.q` off it. The wire
 * format is the `{id, version}` pair that the bundle's `PrePersistedQueryLink` sends, which is exactly
 * the object below. Update both halves together: a right id with a wrong version is refused the same
 * way as a wrong id.
 */
export const NETFLIX_PERSISTED_QUERY = { id: '217277fd-12a1-4816-a5b2-b9d7b9afd4ea', version: 102 }

const OPERATION_NAME = 'LodpTitleAndPlansPageQuery'

/**
 * How many edges one page of this operation holds, measured and not documented anywhere by Netflix.
 *
 * Every season longer than ten answered exactly ten episodes, and One Piece's forty seasons answered
 * exactly ten seasons (2026-09-12, six shows). The operation takes no pagination variable, so there is
 * nothing to ask the rest with: a list that came back AT the cap is a prefix whatever its `pageInfo`
 * says, which is the second half of how `truncated` is read below.
 */
export const NETFLIX_PAGE_SIZE = 10

/**
 * The variables the page sends. Only `videoId` varies; the rest select the image formats and switch
 * off the signup-page extras, and Netflix rejects the operation if any of them is missing.
 */
const variablesFor = (videoId: number) => ({
  videoId,
  opaqueImageFormat: 'JPG',
  transparentImageFormat: 'PNG',
  thumbnailVideoId: 0,
  hasValidThumbnailVideoId: false,
  useBakedInPlayThumbnail: false,
  useFromWatchSupplements: false,
  isModernizedSignup: false
})

/** One episode as Netflix publishes it. `videoId` is the id unogs republishes as `epid`. */
export type NetflixEpisode = {
  videoId: number
  /**
   * Netflix's own position in its own season, undefined when the payload omits it.
   *
   * EVIDENCE ABOUT NETFLIX'S ORDERING, NEVER A CANONICAL EPISODE NUMBER: Netflix's numbering was
   * measured shifted by one against canonical numbering on at least one season, and Netflix also
   * disagrees about where a season begins (it splits Fullmetal Alchemist's single 64 episode run into
   * five seasons and folds Mushoku Tensei's five runs into three).
   */
  number?: number
  title: string
  synopsis?: string
  runtimeSec?: number
  thumbnail?: string
}

/** One season as Netflix publishes it. `videoId` is the id unogs republishes as `seasid`. */
export type NetflixSeasonListing = {
  videoId: number
  /**
   * The ordinal read off Netflix's own season label, undefined when the label names no number
   * ("Limited Series", a localized label). A caller that needs a number should use the season's
   * POSITION in the list rather than inventing one here.
   */
  number?: number
  title: string
  episodes: NetflixEpisode[]
  /**
   * True when `episodes` is a PREFIX of the season rather than the season, so its length is not the
   * season's length. A caller that reads `episodes.length` as an episode count here asserts 10 of 24.
   *
   * This operation caps a season at TEN episodes and takes no pagination variable, so a season longer
   * than ten is truncated by construction and there is nothing to ask for the rest with. Read from
   * `hasNextPage` AND from the measured cap (`isPrefix`), so a payload that stops declaring
   * `pageInfo` cannot arrive as a complete season.
   */
  truncated: boolean
}

/** One Netflix title: the show, its seasons, and how complete that listing is. */
export type NetflixTitle = {
  videoId: number
  title: string
  synopsis?: string
  /** Netflix's `latestYear` for the whole TITLE, which is not any one season's year. */
  year?: number
  seasons: NetflixSeasonListing[]
  /**
   * True when the SEASON list itself is a prefix. A film simply has no seasons, which is not this.
   *
   * The same ten-per-page cap applies to seasons: One Piece answers `totalCount: 40` with ten edges
   * and `hasNextPage: true` (2026-09-12), so a caller asked about season 15 off this listing is
   * asking about a season it cannot see. A season missing from a truncated listing is unknown, never
   * absent, and `extractor.ts`'s `assembleMedia` refuses to mint one rather than publishing zero.
   */
  seasonsTruncated: boolean
}

/**
 * Why a call did not produce a title. Each one is a different thing to do about it:
 *
 * - `persisted-query-stale`: Netflix edited the query and `NETFLIX_PERSISTED_QUERY` must be re-read
 *   from their bundle (procedure on that constant). Nothing else will fix it, and every call fails
 *   until it is done.
 * - `http-status`: the endpoint answered a non-success status. Transient or a moved endpoint.
 * - `graphql-errors`: a 200 carrying `errors`, which is how this endpoint reports a rejected
 *   operation. The message is theirs.
 * - `unreadable`: the body is not the shape this file parses, which is the tell that the payload
 *   changed under us.
 * - `unreachable`: the request itself failed (dropped connection, blocked egress).
 */
export type NetflixFailureKind =
  | 'persisted-query-stale'
  | 'http-status'
  | 'graphql-errors'
  | 'unreadable'
  | 'unreachable'

/**
 * What one ask came to.
 *
 * `{ ok: true, title: undefined }` is a real answer: Netflix has no such video id. It is deliberately
 * a different value from every failure above, because the whole point of this module is that a
 * failure must never be mistaken for a title with nothing in it.
 */
export type NetflixTitleResult =
  | { ok: true, title: NetflixTitle | undefined }
  | { ok: false, failure: NetflixFailureKind, message: string }

type Json = Record<string, unknown>

const asRecord = (value: unknown): Json | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : undefined

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length ? value : undefined

/** Netflix labels a season rather than numbering it, so the ordinal is read off the label or nothing. */
const labelNumber = (...labels: (string | undefined)[]): number | undefined => {
  for (const label of labels) {
    const digits = label?.match(/\d+/)
    if (digits) return Number(digits[0])
  }
  return undefined
}

/** An image is only a url when Netflix says it resolved; an unavailable one carries a stale key. */
const imageUrl = (value: unknown): string | undefined => {
  const image = asRecord(value)
  if (!image || image.available === false) return undefined
  return asString(image.url)
}

const parseEpisode = (value: unknown): NetflixEpisode | undefined => {
  const node = asRecord(asRecord(value)?.node)
  const videoId = asNumber(node?.videoId)
  if (!node || videoId === undefined) return undefined
  return {
    videoId,
    number: asNumber(node.number),
    title: asString(node.title) ?? '',
    synopsis: asString(node.shortSynopsis),
    runtimeSec: asNumber(node.runtimeSec),
    thumbnail: imageUrl(node.merchStill300)
  }
}

const parseSeason = (value: unknown): NetflixSeasonListing | undefined => {
  const node = asRecord(asRecord(value)?.node)
  const videoId = asNumber(node?.videoId)
  if (!node || videoId === undefined) return undefined
  const episodes = asRecord(node.episodes)
  const title = asString(node.title) ?? ''
  const parsed = asArray(episodes?.edges).map(parseEpisode).filter((episode): episode is NetflixEpisode => Boolean(episode))
  return {
    videoId,
    number: labelNumber(asString(node.numberLabelV2), asString(node.shortTitle), title),
    title,
    episodes: parsed,
    truncated: Boolean(episodes) && isPrefix(episodes, parsed.length)
  }
}

/**
 * Whether a connection answered a PREFIX of what it holds. Belt and braces, and both halves are load
 * bearing, because reading this wrong publishes ten episodes as a 24 episode season's length.
 *
 * `hasNextPage` is Netflix's own word, so only an explicit `false` is taken as "that is all of it": an
 * absent `pageInfo`, a renamed field or a reshaped connection reads as a prefix rather than silently
 * as a complete list. And a list that came back exactly AT `NETFLIX_PAGE_SIZE` is a prefix whatever
 * the flag says, since that is the measured page and the operation cannot ask for a second one.
 */
const isPrefix = (connection: Json | undefined, count: number): boolean =>
  asRecord(connection?.pageInfo)?.hasNextPage !== false || count >= NETFLIX_PAGE_SIZE

/**
 * Netflix's seasons and episodes for one title id, or a named failure.
 *
 * NO CREDENTIALS, EVER. `credentials: 'omit'` is explicit and load bearing: the call works
 * anonymously, this runs in a browser where the viewer may well be signed in to Netflix, and a
 * request that carried their session would attach their account to a lookup they did not make. The
 * same reason it is not `'include'` like the unogs calls in extractor.ts: those are a public token
 * flow, this is netflix.com's own origin.
 *
 * `x-netflix.context.locales: en` or the titles come back in the geo default language.
 *
 * REFUSES: a stale persisted query, a non-success status, a GraphQL error, a body it cannot parse and
 * a request that never arrived, each as its own `failure` rather than as an empty title. Returns
 * `{ ok: true, title: undefined }` only when Netflix answered and knows no such video id.
 */
export const fetchNetflixTitle = async (videoId: string | number, ctx: ExtractorServerContext): Promise<NetflixTitleResult> => {
  const id = Number(videoId)
  if (!Number.isFinite(id)) return { ok: false, failure: 'unreadable', message: `not a Netflix video id: ${videoId}` }

  let response: Response
  try {
    response = await ctx.fetch(NETFLIX_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-netflix.context.locales': 'en'
      },
      body: JSON.stringify({
        operationName: OPERATION_NAME,
        variables: variablesFor(id),
        extensions: { persistedQuery: NETFLIX_PERSISTED_QUERY }
      }),
      mode: 'cors',
      // the viewer's own Netflix session must never ride along on this: see above
      credentials: 'omit'
    })
  } catch (error) {
    return { ok: false, failure: 'unreachable', message: String(error) }
  }

  // a stubbed Response may omit `ok`, and an absent field is not a claim that the call failed
  if (response.ok === false) return { ok: false, failure: 'http-status', message: `Netflix answered ${response.status}` }

  let body: Json | undefined
  try {
    body = asRecord(await response.json())
  } catch (error) {
    return { ok: false, failure: 'unreadable', message: String(error) }
  }
  if (!body) return { ok: false, failure: 'unreadable', message: 'Netflix answered a body that is not an object' }

  const errors = asArray(body.errors).map(asRecord)
  if (errors.length) {
    // the one error that means OUR id is wrong rather than THEIR service being unhappy, and the only
    // one a human has to act on: it is loud here so it cannot be read as "this title has no seasons"
    const stale = errors.some(error =>
      asRecord(error?.extensions)?.code === 'PERSISTED_QUERY_NOT_FOUND' || error?.message === 'PersistedQueryNotFound')
    const message = errors.map(error => asString(error?.message) ?? 'unnamed error').join('; ')
    return stale
      ? { ok: false, failure: 'persisted-query-stale', message: `${message}. Re-read NETFLIX_PERSISTED_QUERY from Netflix's page bundle` }
      : { ok: false, failure: 'graphql-errors', message }
  }

  const data = asRecord(body.data)
  if (!data) return { ok: false, failure: 'unreadable', message: 'Netflix answered no data' }
  // an EMPTY list is "no such video id"; anything that is not a list at all is the payload having
  // changed shape, and reading that as an unknown id is the one place this module's own tell would be
  // swallowed: `{ ok: true, title: undefined }` is indistinguishable from a genuine miss
  if (!Array.isArray(data.videos)) return { ok: false, failure: 'unreadable', message: 'Netflix answered no videos list' }
  const video = asRecord(data.videos[0])
  if (!video) return { ok: true, title: undefined }
  const videoIdOut = asNumber(video.videoId)
  if (videoIdOut === undefined) return { ok: false, failure: 'unreadable', message: 'Netflix answered a video with no videoId' }

  const seasons = asRecord(video.seasons)
  const parsedSeasons = asArray(seasons?.edges).map(parseSeason).filter((season): season is NetflixSeasonListing => Boolean(season))
  return {
    ok: true,
    title: {
      videoId: videoIdOut,
      title: asString(video.title) ?? '',
      synopsis: asString(video.shortSynopsis),
      year: asNumber(video.latestYear),
      seasons: parsedSeasons,
      // a film carries no seasons connection at all, which is not a prefix of anything
      seasonsTruncated: Boolean(seasons) && isPrefix(seasons, parsedSeasons.length)
    }
  }
}
