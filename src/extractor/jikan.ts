import type { ExtractorServerContext } from "../worker/extractor"
import type { Media, Resolvers } from "../generated/schema/types.generated"

export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME']
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const supportedUris = ['mal']

const normalizeMedia = async (data: AnimeData, context): Promise<Media> => {
  const aniDBSource =
    data.external?.find(site => site.name === 'AniDB')
  const aniDBId =
    aniDBSource
      ? (
        new URL(aniDBSource?.url).searchParams.get('aid')
        ?? new URL(aniDBSource?.url).pathname.split('/')[2]
      )
      : undefined

  const anizipHandle =
    aniDBSource
      ? populateHandle({
        origin: 'anizip',
        id: aniDBId,
        url: `https://api.ani.zip/mappings?anidb_id=${aniDBId}`,
        handles: []
      })
      : undefined

  return ({
    ...populateHandle({
      origin,
      id: data.mal_id.toString(),
      url: data.url,
      handles: [
        ...aniDBHandle ? [aniDBHandle] : [],
        ...animetoshoHandle ? [animetoshoHandle] : [],
        ...anizipHandle ? [anizipHandle] : []
      ]
    }),
    averageScore: data.score,
    description: data.synopsis,
    shortDescription: data.synopsis,
    title: {
      romanized: data.title,
      english: data.title_english,
      native: data.title_japanese
    },
    coverImage: [{
      extraLarge: data.images.webp.large_image_url,
      large: data.images.webp.large_image_url,
      medium: data.images.webp.large_image_url,
      color: ''
    }],
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? GraphQLTypes.MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? GraphQLTypes.MediaStatus.Releasing
      : data.status === 'Finished Airing' ? GraphQLTypes.MediaStatus.Finished
      : undefined,
    startDate: {
      year: data.aired.prop.from.year,
      month: data.aired.prop.from.month,
      day: data.aired.prop.from.day
    },
    endDate: {
      year: data.aired.prop.to.year,
      month: data.aired.prop.to.month,
      day: data.aired.prop.to.day
    },
    trailers:
      data.trailer?.youtube_id
        ? [{
          ...populateHandle({
            origin: 'yt',
            id: data.trailer.youtube_id,
            url: `https://www.youtube.com/watch?v=${data.trailer.youtube_id}`,
            handles: []
          }),
          thumbnail: data.trailer.images.image_url
        }]
      : undefined,
    episodes: []
    // episodes: {
    //   edges: data.episodes?.edges?.filter(Boolean).map(edge => edge?.node && ({
    //     node: {
    //       airingAt: edge.node.airingAt,
    //       episodeNumber: edge.node.episode,
    //       uri: edge.node.id.toString(),
    //       media: edge.node.media,
    //       mediaUri: edge.node?.media?.id.toString(),
    //       timeUntilAiring: edge.node.timeUntilAiring,
    //     }
    //   }))
    // }
  })
}

const fetchSearchAnime = ({ search }: { search: string }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime?q=${search}`)
    .then(response => response.json() as SearchAnimeData)
    .then(json =>
      json.data
        ? json.data.map(media => normalizeMedia(media, context))
        : undefined
    )

const fetchMedia = ({ id }: { id: number }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    .then(response => response.json() as AnimeResponse)
    .then(json =>
      json.data
        ? normalizeMedia(json.data, context)
        : undefined
    )

const getSeasonNow = (page = 1, context: ExtractorServerContext): Promise<Root> =>
  context
    .fetch(`https://api.jikan.moe/v4/seasons/now?page=${page}&sfw=true`)
    .then(res => res.json())

const getFullSeasonNow = async (_, { season, seasonYear }: MediaParams[1], context: ExtractorServerContext, __) => {
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
      .map(normalizeMedia)
  )
}

const searchAnime = async (_, { input: { search } }: MediaParams[1], context: ExtractorServerContext, __) =>
  fetchSearchAnime({ search: search! }, context)

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri } }, ctx) {
        if (!uri) return
        const uriValues =
          isScannarrUri(uri)
            ? (
              fromScannarrUri(uri)
                ?.handleUrisValues
                .find(({ origin: _origin }) => _origin === origin)
            )
            : fromUri(uri)
        if (!uriValues || uriValues.origin !== origin) return
        yield {
          media: await fetchMedia({ id: Number(uriValues.id) }, ctx)
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input: { search, seasonYear, season } }, ctx) {
        if (search) {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await fetchSearchAnime({ search }, ctx))
            }
          }
        } else if (season && seasonYear) {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await getFullSeasonNow(undefined, { seasonYear, season }, ctx, undefined))
            }
          }
        }
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
  large_image_url: string
}

interface Images {
  jpg: ImageUrls
  webp: ImageUrls
}

interface Trailer {
  youtube_id: string
  url: string
  embed_url: string
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

type SearchAnimeData = Exclude<'relations'| 'theme'| 'external'| 'streaming', AnimeData>

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
