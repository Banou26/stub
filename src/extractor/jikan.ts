import type { ExtractorServerContext } from '../worker/extractor'
import type { Media, MediaTrailer, Resolvers } from '../generated/schema/types.generated'
import { MediaStatus } from '../generated/graphql'

export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME']
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const supportedUris = ['mal']

const normalizeMedia = async (data: SearchAnimeData & Partial<Pick<AnimeData, 'external'>>, context: ExtractorServerContext) => {
  const aniDBSource = data.external?.find(site => site.name === 'AniDB')
  const aniDBId =
    aniDBSource
      ? (
        new URL(aniDBSource?.url).searchParams.get('aid')
        ?? new URL(aniDBSource?.url).pathname.split('/')[2]
      )
      : undefined

  const anizipHandle =
    aniDBSource
      ? {
        uri: `anizip:${aniDBId}`,
        origin: 'anizip',
        language: 'en',
        id: aniDBId,
        url: `https://api.ani.zip/mappings?anidb_id=${aniDBId}`
      } as Media
      : undefined

  return {
    uri: `${origin}:${data.mal_id}`,
    origin,
    id: data.mal_id.toString(),
    url: data.url,
    handles: [
      ...anizipHandle ? [anizipHandle] : []
    ],
    averageScore: data.score,
    descriptions: [{
      id: crypto.randomUUID(),
      language: 'en',
      description: data.synopsis
    }],
    shortDescriptions: [{
      id: crypto.randomUUID(),
      language: 'en',
      shortDescription: data.synopsis
    }],
    titles: [
      {
        id: crypto.randomUUID(),
        language: 'en',
        title: data.title_english,
      },
      {
        id: crypto.randomUUID(),
        language: 'jp-en',
        title: data.title
      },
      {
        id: crypto.randomUUID(),
        language: 'jp',
        title: data.title_japanese
      }
    ],
    covers: [{
      id: crypto.randomUUID(),
      language: 'en',
      url: data.images.webp.large_image_url
    }],
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? MediaStatus.Releasing
      : data.status === 'Finished Airing' ? MediaStatus.Finished
      : undefined,
    startDate:
      Temporal.PlainDate.from({
        year: data.aired.prop.from.year,
        month: data.aired.prop.from.month + 1,
        day: data.aired.prop.from.day + 1
      }),
    endDate:
      Temporal.PlainDate.from({
        year: data.aired.prop.to.year,
        month: data.aired.prop.to.month + 1,
        day: data.aired.prop.to.day + 1
      }),
    trailers:
      data.trailer?.youtube_id
        ? [{
          origin: 'yt',
          id: data.trailer.youtube_id,
          url: `https://www.youtube.com/watch?v=${data.trailer.youtube_id}`,
          thumbnail: data.trailer.images.image_url
        } as MediaTrailer]
      : undefined
  } satisfies Media
}

const fetchSearchAnime = ({ search }: { search: string }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime?q=${search}`)
    .then(response => response.json() as Promise<AnimeSearchResponse>)
    .then(json =>
      json.data
        ? json.data.map(media => normalizeMedia(media, context))
        : undefined
    )

const fetchMedia = ({ id }: { id: number }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    .then(response => response.json() as Promise<AnimeResponse>)
    .then(json =>
      json.data
        ? normalizeMedia(json.data, context)
        : undefined
    )

const getSeasonNow = (page = 1, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/seasons/now?page=${page}&sfw=true`)
    .then(response => response.json() as Promise<AnimeSearchResponse>)

const getFullSeasonNow = async (context: ExtractorServerContext) => {
  const { data, pagination } = await getSeasonNow(1, context)
  return (
    [
      ...data,
      ...(await Promise.all(
        new Array(Math.min(2, pagination.last_visible_page - 1))
          .fill(undefined)
          .map((_, i) => getSeasonNow(i + 2, context).then(({ data }) => data))
      )).flat()
    ]
      .map(mediaData => normalizeMedia(mediaData, context))
  )
}

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    // media: {
    //   subscribe: async function*(_, { input: { uri } }, ctx) {
    //     if (!uri) return
    //     const uriValues =
    //       isScannarrUri(uri)
    //         ? (
    //           fromScannarrUri(uri)
    //             ?.handleUrisValues
    //             .find(({ origin: _origin }) => _origin === origin)
    //         )
    //         : fromUri(uri)
    //     if (!uriValues || uriValues.origin !== origin) return
    //     yield {
    //       media: await fetchMedia({ id: Number(uriValues.id) }, ctx)
    //     }
    //   }
    // },
    mediaPage: {
      subscribe: async function*(_, { input: { search, status } }, ctx: ExtractorServerContext) {
        if (status === 'RELEASING') {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await getFullSeasonNow(ctx))
            }
          }
        }
        throw new Error('Not implemented')
        // if (search) {
        //   return yield {
        //     mediaPage: {
        //       nodes: await Promise.all(await fetchSearchAnime({ search }, ctx))
        //     }
        //   }
        // } else if (season && seasonYear) {
        //   return yield {
        //     mediaPage: {
        //       nodes: await Promise.all(await getFullSeasonNow(undefined, { seasonYear, season }, ctx, undefined))
        //     }
        //   }
        // }
      }
    },
  }
} satisfies Resolvers


interface MalEntity {
  mal_id: number
  type: string
  name: string
  url: string
}

interface ImageUrls {
  image_url: string
  small_image_url: string
  medium_image_url: string
  large_image_url: string
  maximum_image_url: string
}

interface Images {
  jpg: Omit<ImageUrls, 'medium_image_url' | 'maximum_image_url'>
  webp: Omit<ImageUrls, 'medium_image_url' | 'maximum_image_url'>
}

interface Trailer {
  youtube_id: string
  url: string
  embed_url: string
  images: ImageUrls
}

interface Title {
  type: string
  title: string
}

interface DateProp {
  day: number
  month: number
  year: number
}

interface AiredDates {
  from: string
  to: string
  prop: {
    from: DateProp
    to: DateProp
    string: string
  }
}

interface Broadcast {
  day: string
  time: string
  timezone: string
  string: string
}

interface Relation {
  relation: string
  entry: MalEntity[]
}

interface Theme {
  openings: string[]
  endings: string[]
}

interface ExternalLink {
  name: string
  url: string
}

type AnimeType = 'TV' | 'Movie' | 'OVA' | 'Special' | 'ONA' | 'Music'

type AiringStatus =
  | 'Finished Airing'
  | 'Currently Airing'
  | 'Not yet aired'

type Rating =
  | 'G - All Ages'
  | 'PG - Children'
  | 'PG-13 - Teens 13 or older'
  | 'R - 17+ (violence & profanity)'
  | 'R+ - Mild Nudity'
  | 'Rx - Hentai'

type Season = 'spring' | 'summer' | 'fall' | 'winter'

interface AnimeData {
  mal_id: number
  url: string
  images: Images
  trailer: Trailer
  approved: boolean
  titles: Title[]
  title: string
  title_english: string
  title_japanese: string
  title_synonyms: string[]
  type: AnimeType
  source: string
  episodes: number
  status: AiringStatus
  airing: boolean
  aired: AiredDates
  duration: string
  rating: Rating
  score: number
  scored_by: number
  rank: number
  popularity: number
  members: number
  favorites: number
  synopsis: string
  background: string
  season: Season
  year: number
  broadcast: Broadcast
  producers: MalEntity[]
  licensors: MalEntity[]
  studios: MalEntity[]
  genres: MalEntity[]
  explicit_genres: MalEntity[]
  themes: MalEntity[]
  demographics: MalEntity[]
  relations: Relation[]
  theme: Theme
  external: ExternalLink[]
  streaming: ExternalLink[]
}

interface AnimeResponse {
  data: AnimeData
}

type SearchAnimeData = Omit<AnimeData, 'relations'| 'theme'| 'external'| 'streaming'>

// Search-specific interfaces
interface PaginationItems {
  count: number;
  total: number;
  per_page: number;
}

interface Pagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: PaginationItems;
}

interface AnimeSearchResponse {
  data: SearchAnimeData[];
  pagination: Pagination;
}
