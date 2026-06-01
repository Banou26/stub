import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'
import { MediaStatus as GQLMediaStatus } from '../../generated/graphql'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { Maybe, Media, MediaExternalLink, MediaSeason, MediaStatus, Page } from './types'
import { matchSeasonByDate, getMedia as getCrunchyrollMedia } from '../crunchyroll/extractor'
import { makeMedia } from '../utils'

export const icon = 'https://anilist.co/img/icons/favicon-32x32.png'
export const originUrl = 'https://anilist.co'
export const categories = ['ANIME'] as const
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

const TITLE_SCORE = 0.7
const THUMBNAIL_SCORE = 0.9
const DESCRIPTION_SCORE = 0.7
const COVER_SCORE = 0.7

const siteMappings = [
  {
    // link example: https://www.crunchyroll.com/series/GT00365624/you-and-i-are-polar-opposites
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

const fetchAnilist = <T>({ query, variables }: { query: string, variables: any }, context: ExtractorServerContext): Promise<{ data: T }> =>
  context
    .fetch('https://graphql.anilist.co/', {
      method: 'POST',
      "headers": {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables
      })
    })
    .then((response) => response.json() as Promise<{ data: T }>)

const mediaSeasons = [MediaSeason.Winter, MediaSeason.Spring, MediaSeason.Summer, MediaSeason.Fall]

const getMediaSeason = (date = new Date()): MediaSeason => {
  const month = date.getMonth()

  return (
    month >= 0 && month <= 2 ? MediaSeason.Winter // January to March
    : month >= 3 && month <= 5 ? MediaSeason.Spring // April to June
    : month >= 6 && month <= 8 ? MediaSeason.Summer // July to September
    : month >= 9 && month <= 11 ? MediaSeason.Fall // October to December
    : undefined as never
  )
}

const getPreviousMediaSeason = (date = new Date()) =>
  mediaSeasons[mediaSeasons.indexOf(getMediaSeason(date)) - 1]
  ?? MediaSeason.Fall

const fetchMedia = async ({ id, idMal }: { id?: number, idMal?: number }, context: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const { data } = await fetchAnilist<{ Media: Media }>({ query: GET_MEDIA, variables: { id, idMal, type: 'ANIME' } }, context)
  if (!data.Media) return undefined

  const startDate =
    data.Media.startDate?.year
      ? new Date(
          data.Media.startDate.year,
          (data.Media.startDate.month ?? 1) - 1,
          data.Media.startDate.day ?? 1
        ).toUTCString()
      : undefined

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
  const { data } = await fetchMediaSeason({ season, year, page: 1 }, context)

  return (
    [
      ...data.Page.media ?? [],
      ...data.Page.pageInfo?.lastPage
        ? (await Promise.all(
          new Array(Math.min(2, data.Page.pageInfo.lastPage - 1))
            .fill(undefined)
            .map((_, i) => fetchMediaSeason({ season, year, page: i + 2 }, context).then(({ data }) => data.Page.media ?? []))
        )).flat()
        : []
    ]
      .map(media => normalizeMedia(media as Media))
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

  const firstAiringNode = media.airingSchedule?.edges?.at(0)?.node
  const startDate =
    firstAiringNode?.airingAt
      ? new Date(firstAiringNode.airingAt * 1000).toUTCString()
      : undefined
  const lastAiringNode = media.airingSchedule?.edges?.at(-1)?.node
  const endDate =
    lastAiringNode?.airingAt
      ? new Date(lastAiringNode.airingAt * 1000).toUTCString()
      : undefined

  return makeMedia({
    _id: crypto.randomUUID(),
    uri: `${origin}:${media.id}`,
    origin,
    id: media.id.toString(),
    url: media.siteUrl,
    categories: media.format === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    handles: [
      ...extraHandles,
      ...malHandle ? [malHandle] : []
    ],
    score: 0.9,
    averageScore: media.averageScore,
    descriptions:
      media.description
        ? [{ language: 'en', description: media.description, score: DESCRIPTION_SCORE }]
        : [],
    shortDescriptions:
      media.description
        ? [{ language: 'en', shortDescription: media.description, score: DESCRIPTION_SCORE }]
        : [],
    titles: [
      ...media.title?.english ? [{ language: 'en', title: media.title.english, score: TITLE_SCORE }] : [],
      ...media.title?.romaji ? [{ language: 'jp-en', title: media.title.romaji, score: TITLE_SCORE }] : [],
      ...media.title?.native ? [{ language: 'jp', title: media.title.native, score: TITLE_SCORE }] : []
    ],
    covers: [
      // ...media.coverImage?.medium ? [{ language: 'en', url: media.coverImage.medium }] : [],
      // ...media.coverImage?.large ? [{ language: 'jp', url: media.coverImage.large }] : [],
      ...media.coverImage?.extraLarge ? [{ language: 'jp', url: media.coverImage.extraLarge, score: COVER_SCORE }] : []
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
  const { data } = await fetchAnilist<{ Page: Page }>({ query: SEARCH_MEDIA_QUERY, variables: { search, page: 1 } }, context)
  return (data?.Page?.media ?? []).map(media => normalizeMedia(media as Media))
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
