import type { ExtractorServerContext } from '../../worker/extractor'
import { airedDate } from '../aired-date'
import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'
import { MediaStatus as GQLMediaStatus, MediaType as GQLMediaType } from '../../generated/graphql'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { Maybe, Media, MediaExternalLink, MediaSeason, MediaStatus, Page } from './types'
import { matchSeasonByDate, getMedia as getCrunchyrollMedia } from '../crunchyroll/extractor'
import { makeMedia, normalizePage } from '../utils'
import { createAnilistFrontendSession } from './frontend'

export const icon = 'https://anilist.co/img/icons/favicon-32x32.png'
export const originUrl = 'https://anilist.co'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'Anilist'
export const origin = 'anilist'
export const official = true
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['anilist']

const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    native
    english
  }
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  season
  seasonYear
  status
  season
  format
  type
  genres
  synonyms
  duration
  popularity
  episodes
  source(version: 2)
  averageScore
  siteUrl
  description
  bannerImage
  coverImage {
    medium
    large
    extraLarge
    color
  }
  trailer {
    id
    site
    thumbnail
  }
  externalLinks {
    site
    siteId
    url
  }
  airingSchedule {
    edges {
      node {
        airingAt
        episode
        id
        media {
          id
          idMal
        }
        mediaId
        timeUntilAiring
      }
    }
  }
`

const SEARCH_QUERY = `
  query (
    $season: MediaSeason
    $year: Int
    $page: Int
  ) {
    Page(page: $page) {
      pageInfo {
        lastPage
        hasNextPage
        total
      }
      media(
        season: $season
        seasonYear: $year
      ) {
        ${MEDIA_FIELDS.split('\n').join('\n      ')}
      }
    }
  }
`

const SEARCH_MEDIA_QUERY = `
  query (
    $search: String
    $page: Int
  ) {
    Page(page: $page) {
      pageInfo {
        lastPage
        hasNextPage
        total
      }
      media(
        search: $search
        type: ANIME
        sort: SEARCH_MATCH
      ) {
        ${MEDIA_FIELDS.split('\n').join('\n      ')}
      }
    }
  }
`

const GET_MEDIA = `
  query GetMedia ($id: Int, $idMal: Int, $type: MediaType) {
    Media(idMal: $idMal, id: $id, type: $type) {
      ${MEDIA_FIELDS.split('\n').join('\n    ')}
    }
  }
`

/**
 * One score for every field, deliberately BELOW jikan and anizip, which both sit at 0.9.
 *
 * Owner's call, 2026-08-18. Know what it does, because `byScore` in `store/aggregate.ts` sorts
 * descending and the top source takes the field outright: wherever all three describe the same
 * media, jikan and anizip now win the title, the cover, the description and every media-level
 * field (`status`, `startDate`, `episodeCount`, `type`, `averageScore`). AniList still supplies
 * anything neither of them has, because the aggregate falls through with `??`.
 *
 * That reverses an earlier deliberate change, and the reasoning it replaces is worth keeping:
 * four constants used to disagree, with title, description and cover at 0.7 while a declared
 * `THUMBNAIL_SCORE` of 0.9 was never referenced, so covers went out at 0.7 and lost to MyAnimeList
 * and AniZip. The note then was that AniList has the best art of the three. If the art regressing
 * is not wanted, the fix is not to raise this back to 0.9 but to score the cover separately.
 */
const SCORE = 0.8

const siteMappings = [
  {
    siteId: 5,
    mapper: async (
      externalLink: MediaExternalLink,
      startDate: string | undefined,
      context: ExtractorServerContext
    ): Promise<GQLMedia | undefined> => {
      const match = externalLink.url?.match(/https:\/\/www\.crunchyroll\.com\/series\/(\w+)/)
      const crunchyrollSeriesId = match?.[1]
      if (!crunchyrollSeriesId || !startDate) return undefined

      const compositeId = await matchSeasonByDate(crunchyrollSeriesId, startDate, context)
      if (!compositeId) return undefined
      const crMedia = await getCrunchyrollMedia(compositeId, context)
      return crMedia
    }
  }
]

type AnilistResponse<T> = {
  data?: T | null
  errors?: { message?: string, status?: number }[]
}

/**
 * How long the public API stays skipped after it has failed.
 *
 * It is either up or switched off wholesale rather than flaky per request, so once it has answered
 * 403 there is no point paying for a round trip on every call. The expiry is the half that matters:
 * it is what lets this source return to the public API on its own when AniList turns it back on,
 * with no deploy and nothing to remember.
 */
const PUBLIC_API_RETRY_MS = 5 * 60 * 1000
let publicApiDownUntil = 0

/**
 * One frontend session for the module, so the CSRF pair is acquired once rather than per query.
 *
 * The fetch is read at call time rather than captured, because the session outlives any single
 * request context. In practice every context shares the one bridge in ../../worker/fetch.ts, so
 * this only ever guards against that stopping being true.
 */
let latestFetch: ExtractorServerContext['fetch'] | undefined
const frontend = createAnilistFrontendSession((input, init) => {
  if (!latestFetch) throw new Error('AniList frontend: queried before any request context bound a fetch')
  return latestFetch(input, init)
})

// AniList reports failures with an HTTP 200 and a `{ data: null, errors: [...] }` body, rate limits above all
const fetchPublicAnilist = async <T>({ query, variables }: { query: string, variables: any }, context: ExtractorServerContext): Promise<T | undefined> => {
  const response = await context.fetch('https://graphql.anilist.co/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables
    })
  })
  const body = await response.json().catch(() => undefined) as AnilistResponse<T> | undefined
  if (body?.errors?.length) {
    const reason = body.errors.map(error => error.message).filter(Boolean).join('; ')
    console.error(`AniList request failed (HTTP ${response.status}): ${reason || 'no message'}`)
  }
  if (body?.data == null) {
    if (!body?.errors?.length) console.error(`AniList returned no data (HTTP ${response.status})`)
    return undefined
  }
  return body.data
}

/**
 * The public API, falling back to AniList's own frontend endpoint when it is not answering.
 *
 * Measured 2026-08-16: graphql.anilist.co returned 403 "The AniList API has been temporarily
 * disabled due to severe stability issues" to everyone, while anilist.co/graphql served this exact
 * query with every field populated. See ./frontend.ts for what the fallback has to satisfy.
 */
const fetchAnilist = async <T>(request: { query: string, variables: any }, context: ExtractorServerContext): Promise<T | undefined> => {
  latestFetch = context.fetch
  if (Date.now() >= publicApiDownUntil) {
    const data = await fetchPublicAnilist<T>(request, context).catch(() => undefined)
    if (data != null) return data
    publicApiDownUntil = Date.now() + PUBLIC_API_RETRY_MS
  }
  return frontend.query<T>(request)
}

const mediaSeasons = [MediaSeason.Winter, MediaSeason.Spring, MediaSeason.Summer, MediaSeason.Fall]

const getMediaSeason = (date = new Date()): MediaSeason => {
  const month = date.getMonth()

  return (
    month >= 0 && month <= 2 ? MediaSeason.Winter
    : month >= 3 && month <= 5 ? MediaSeason.Spring
    : month >= 6 && month <= 8 ? MediaSeason.Summer
    : month >= 9 && month <= 11 ? MediaSeason.Fall
    : undefined as never
  )
}

const getPreviousMediaSeason = (date = new Date()) =>
  mediaSeasons[mediaSeasons.indexOf(getMediaSeason(date)) - 1]
  ?? MediaSeason.Fall

const fetchMedia = async ({ id, idMal }: { id?: number, idMal?: number }, context: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const data = await fetchAnilist<{ Media: Media }>({ query: GET_MEDIA, variables: { id, idMal, type: 'ANIME' } }, context)
  if (!data?.Media) return undefined

  // The same date `normalizeMedia` publishes, rather than a second one built here. This hand-rolled a
  // date twice over, and both halves mattered to the one thing it feeds, `matchSeasonByDate`:
  //
  //   IT FABRICATED A DAY. `day ?? 1` invents the 1st whenever AniList says the day is unknown, which
  //   is 2355 of 29722 entries, while `airedDate` reaches for the airing schedule's episode 1 in
  //   exactly that case and finds a real timestamp. So a Crunchyroll season was being matched against
  //   an invented date while a real one sat in the same payload, already fetched: GET_MEDIA is built
  //   from MEDIA_FIELDS, which carries `airingSchedule`.
  //
  //   IT BUILT THE DATE IN LOCAL TIME. `new Date(y, m, d)` is local midnight, so `.toUTCString()` on
  //   a machine east of UTC rolls the day back: AniList day 4 comes out as `Fri, 03 Jul 2026 15:00:00
  //   GMT` under JST. Harmless inside a 45 day window, and wrong in a way that would not stay harmless
  //   if anything finer ever read it. `airedDate` uses Date.UTC throughout.
  const startDate = airedDate(data.Media.startDate, data.Media.airingSchedule, 'first')

  const externalLinks = data.Media.externalLinks
    ?.filter((link): link is NonNullable<typeof link> => Boolean(link))
    .filter(externalLink => externalLinkHasSiteId(externalLink))
    ?? []

  const handles = (await Promise.all(
    externalLinks.map(async (externalLink) => {
      const mapper = siteMappings.find(m => m.siteId === externalLink.siteId)
      if (!mapper) return undefined
      try {
        return await mapper.mapper(externalLink, startDate, context)
      } catch (error) {
        console.error(`anilist mapper for siteId ${externalLink.siteId} failed:`, error)
        return undefined
      }
    })
  )).filter((handle): handle is GQLMedia => Boolean(handle))

  return normalizeMedia(data.Media, handles)
}

const fetchMediaSeason = (
  { season, year, page = 1 }:
  { season: MediaSeason, year: number, page?: number },
  context: ExtractorServerContext
) =>
  fetchAnilist<{ Page: Page }>({ query: SEARCH_QUERY, variables: { season, year, page } }, context)

const getFullMediaSeason = async ({ season, year }: { season: MediaSeason, year: number }, context: ExtractorServerContext) => {
  const data = await fetchMediaSeason({ season, year, page: 1 }, context)
  const lastPage = data?.Page?.pageInfo?.lastPage

  return normalizePage(
    [
      ...data?.Page?.media ?? [],
      ...lastPage
        ? (await Promise.all(
          new Array(Math.min(2, lastPage - 1))
            .fill(undefined)
            .map((_, i) => fetchMediaSeason({ season, year, page: i + 2 }, context).then(data => data?.Page?.media ?? []))
        )).flat()
        : []
    ],
    media => normalizeMedia(media as Media),
    'AniList season'
  )
}

const externalLinkHasSiteId =
  (externalLink: Maybe<MediaExternalLink>): externalLink is MediaExternalLink & { siteId: number } =>
    Boolean(externalLink?.siteId)

const normalizeMedia = (media: Media, extraHandles: GQLMedia[] = []) => {
  const malHandle =
    media.idMal
      ? makeMedia({
        _id: crypto.randomUUID(),
        uri: `mal:${media.idMal}`,
        origin: 'mal',
        id: media.idMal.toString(),
        url: `https://myanimelist.net/anime/${media.idMal}`
      })
      : undefined

  const startDate = airedDate(media.startDate, media.airingSchedule, 'first')
  const endDate = airedDate(media.endDate, media.airingSchedule, 'last')

  return makeMedia({
    _id: crypto.randomUUID(),
    uri: `${origin}:${media.id}`,
    origin,
    id: media.id.toString(),
    url: media.siteUrl,
    categories: media.format === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    type:
      media.format === 'TV' || media.format === 'TV_SHORT' ? GQLMediaType.Tv
      : media.format === 'MOVIE' ? GQLMediaType.Movie
      : media.format === 'SPECIAL' ? GQLMediaType.Special
      : media.format === 'OVA' ? GQLMediaType.Ova
      : media.format === 'ONA' ? GQLMediaType.Ona
      : undefined,
    handles: [
      ...extraHandles,
      ...malHandle ? [malHandle] : []
    ],
    score: SCORE,
    averageScore: media.averageScore,
    descriptions:
      media.description
        ? [{ language: 'en', description: media.description, score: SCORE }]
        : [],
    shortDescriptions:
      media.description
        ? [{ language: 'en', shortDescription: media.description, score: SCORE }]
        : [],
    titles: [
      ...media.title?.english ? [{ language: 'en', title: media.title.english, score: SCORE }] : [],
      ...media.title?.romaji ? [{ language: 'jp-en', title: media.title.romaji, score: SCORE }] : [],
      ...media.title?.native ? [{ language: 'jp', title: media.title.native, score: SCORE }] : []
    ],
    covers: [
      ...media.coverImage?.extraLarge ? [{ language: 'jp', url: media.coverImage.extraLarge, score: SCORE }] : []
    ],
    episodeCount: media.episodes,
    popularity: media.popularity,
    status:
      media.status === MediaStatus.NotYetReleased ? GQLMediaStatus.NotYetReleased
      : media.status === MediaStatus.Releasing ? GQLMediaStatus.Releasing
      : media.status === MediaStatus.Finished ? GQLMediaStatus.Finished
      : undefined,
    startDate,
    endDate,
    trailers:
      media.trailer?.site === 'youtube' && media.trailer.id
        ? [{
          uri: `yt:${media.trailer.id}`,
          language: 'en',
          origin: 'yt',
          id: media.trailer.id.toString(),
          url: `https://www.youtube.com/watch?v=${media.trailer.id}`,
          thumbnail: media.trailer.thumbnail
        }]
        : [],
  })
}


// todo: implement overlapping week between season since some anime may start while some other ends
export const getAnimeSeasonNow = (context: ExtractorServerContext) => {
  const season = getMediaSeason()
  const seasonYear = new Date().getFullYear()
  return getFullMediaSeason({ season: season, year: seasonYear }, context)
}

const searchMedia = async (search: string, context: ExtractorServerContext) => {
  const data = await fetchAnilist<{ Page: Page }>({ query: SEARCH_MEDIA_QUERY, variables: { search, page: 1 } }, context)
  return normalizePage(data?.Page?.media ?? [], media => normalizeMedia(media as Media), 'AniList search')
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (!uri) return yield { media: null }
        const media = await fetchMedia({ id: Number(uri.id) }, ctx)
        yield {
          media
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input: { search, status } }, ctx: ExtractorServerContext) {
        if (status === 'RELEASING') {
          return yield {
            mediaPage: {
              nodes: await getAnimeSeasonNow(ctx)
            }
          }
        }
        if (search) {
          return yield {
            mediaPage: {
              nodes: await searchMedia(search, ctx)
            }
          }
        }
      }
    }
  }
}
