import type { ExtractorServerContext } from '../../worker/extractor'
import type { Media, MediaTrailer, Resolvers } from '../../generated/schema/types.generated'
import { MediaStatus } from '../../generated/graphql'
import { fromUri, isUri } from '../../utils/uri'

export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['mal']

const SCORE = 0.9
const DESCRIPTION_SCORE = 0.9

const youtubeEmbedRegex = /\/embed\/([a-zA-Z0-9_-]{11})/

const normalizeMedia = async <T extends SearchAnimeData & Partial<Pick<AnimeData, 'external'> | AnimeData>>(data: T, context: ExtractorServerContext) => {
  const aniDBSource = data.external?.find(site => site.name === 'AniDB')
  const aniDBId =
    aniDBSource
      ? (
        new URL(aniDBSource?.url).searchParams.get('aid')
        ?? new URL(aniDBSource?.url).pathname.split('/')[2]
      )
      : undefined

  const anidbHandle =
    aniDBId
      ? {
        _id: crypto.randomUUID(),
        uri: `anidb:${aniDBId}`,
        origin: 'anidb',
        id: aniDBId,
        url: aniDBSource?.url
      } as Media
      : undefined

  const anizipHandle =
    aniDBSource
      ? {
        _id: crypto.randomUUID(),
        uri: `anizip:${aniDBId}`,
        origin: 'anizip',
        id: aniDBId,
        url: `https://api.ani.zip/mappings?anidb_id=${aniDBId}`
      } as Media
      : undefined

  const embeddedYoutubeUrl =
    data.trailer?.embed_url
      ? data.trailer.embed_url.match(youtubeEmbedRegex)?.[1]
      : undefined
  
  const trailers: MediaTrailer[] =
      data.trailer?.youtube_id ? [{
      uri: `yt:${data.trailer.youtube_id}`,
      origin: 'yt',
      id: data.trailer.youtube_id,
      url: `https://www.youtube.com/watch?v=${data.trailer.youtube_id}`,
      language: 'en',
      thumbnail: data.trailer.images.image_url
    }]
    : data.trailer?.embed_url && embeddedYoutubeUrl ? [{
      uri: `yt:${embeddedYoutubeUrl}`,
      origin: 'yt',
      id: embeddedYoutubeUrl,
      url: `https://www.youtube.com/watch?v=${embeddedYoutubeUrl}`,
      language: 'en',
      thumbnail: data.trailer.images.image_url
    }]
    : []
  
  return {
    _id: crypto.randomUUID(),
    uri: `${origin}:${data.mal_id}`,
    origin,
    categories: data.type === 'Movie' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    id: data.mal_id.toString(),
    url: data.url,
    handles: [
      ...anidbHandle ? [anidbHandle] : [],
      ...anizipHandle ? [anizipHandle] : []
    ],
    score: SCORE,
    averageScore: data.score,
    descriptions:
      data.synopsis
        ? [{ language: 'en', description: data.synopsis, score: DESCRIPTION_SCORE }]
        : [],
    shortDescriptions:
      data.synopsis
        ? [{ language: 'en', shortDescription: data.synopsis, score: DESCRIPTION_SCORE }]
        : [],
    titles: [
      ... data.title_english ? [{ language: 'en', title: data.title_english, score: SCORE }] : [],
      ... data.title ? [{ language: 'jp-en', title: data.title, score: SCORE }] : [],
      ... data.title_japanese ? [{ language: 'jp', title: data.title_japanese, score: SCORE }] : []
    ],
    covers: [{
      language: 'en',
      url: data.images.webp.large_image_url,
      score: SCORE
    }],
    banners: [],
    episodes: [],
    episodeCount: data.episodes,
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? MediaStatus.Releasing
      : data.status === 'Finished Airing' ? MediaStatus.Finished
      : undefined,
    startDate: new Date(data.aired.prop.from.year, data.aired.prop.from.month, data.aired.prop.from.day).toUTCString(),
    endDate: new Date(data.aired.prop.to.year, data.aired.prop.to.month, data.aired.prop.to.day).toUTCString(),
    trailers
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

export const resolvers: Resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !isUri(uri)) return yield { media: null }
        const uriValues = fromUri(uri)
        if (uriValues.origin !== origin) return yield { media: null }
        yield {
          media: await fetchMedia({ id: Number(uriValues.id) }, ctx)
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input: { search, status } }, ctx: ExtractorServerContext) {
        if (status === 'RELEASING') {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await getFullSeasonNow(ctx))
            }
          }
        }
        if (search) {
          const results = await fetchSearchAnime({ search }, ctx)
          return yield {
            mediaPage: {
              nodes: results ? await Promise.all(results) : []
            }
          }
        }
        yield { mediaPage: { nodes: [] } }
      }
    },
  }
}


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
