import type { ExtractorServerContext } from '../../worker/extractor'
import type { Media, MediaTrailer, Resolvers } from '../../generated/schema/types.generated'

import { z } from 'zod'
import { MediaStatus } from '../../generated/graphql'
import { fromUri, isUri } from '../../utils/uri'

export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME']
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['mal']

const malEntitySchema = z.object({
  mal_id: z.number(),
  type: z.string(),
  name: z.string(),
  url: z.string()
})

const imageSetSchema = z.object({
  image_url: z.string().nullable(),
  small_image_url: z.string().nullable(),
  large_image_url: z.string().nullable()
})

const trailerImagesSchema = z.object({
  image_url: z.string().nullable(),
  small_image_url: z.string().nullable(),
  medium_image_url: z.string().nullable(),
  large_image_url: z.string().nullable(),
  maximum_image_url: z.string().nullable()
})

const datePartSchema = z.object({
  day: z.number().nullable(),
  month: z.number().nullable(),
  year: z.number().nullable()
})

const externalLinkSchema = z.object({
  name: z.string(),
  url: z.string()
})

const searchAnimeDataSchema = z.object({
  mal_id: z.number(),
  url: z.string(),
  images: z.object({
    jpg: imageSetSchema,
    webp: imageSetSchema
  }),
  trailer: z.object({
    youtube_id: z.string().nullable(),
    url: z.string().nullable(),
    embed_url: z.string().nullable(),
    images: trailerImagesSchema
  }),
  approved: z.boolean(),
  titles: z.array(z.object({
    type: z.string(),
    title: z.string()
  })),
  title: z.string(),
  title_english: z.string().nullable(),
  title_japanese: z.string().nullable(),
  title_synonyms: z.array(z.string()),
  type: z.string().nullable(),
  source: z.string().nullable(),
  episodes: z.number().nullable(),
  status: z.string().nullable(),
  airing: z.boolean(),
  aired: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
    prop: z.object({
      from: datePartSchema,
      to: datePartSchema
    }),
    string: z.string().nullable()
  }),
  duration: z.string().nullable(),
  rating: z.string().nullable(),
  score: z.number().nullable(),
  scored_by: z.number().nullable(),
  rank: z.number().nullable(),
  popularity: z.number().nullable(),
  members: z.number().nullable(),
  favorites: z.number().nullable(),
  synopsis: z.string().nullable(),
  background: z.string().nullable(),
  season: z.string().nullable(),
  year: z.number().nullable(),
  broadcast: z.object({
    day: z.string().nullable(),
    time: z.string().nullable(),
    timezone: z.string().nullable(),
    string: z.string().nullable()
  }),
  producers: z.array(malEntitySchema),
  licensors: z.array(malEntitySchema),
  studios: z.array(malEntitySchema),
  genres: z.array(malEntitySchema),
  explicit_genres: z.array(malEntitySchema),
  themes: z.array(malEntitySchema),
  demographics: z.array(malEntitySchema)
})

const animeDataSchema = searchAnimeDataSchema.extend({
  relations: z.array(z.object({
    relation: z.string(),
    entry: z.array(malEntitySchema)
  })),
  theme: z.object({
    openings: z.array(z.string()),
    endings: z.array(z.string())
  }),
  external: z.array(externalLinkSchema),
  streaming: z.array(externalLinkSchema)
})

const paginationSchema = z.object({
  last_visible_page: z.number(),
  has_next_page: z.boolean(),
  current_page: z.number(),
  items: z.object({
    count: z.number(),
    total: z.number(),
    per_page: z.number()
  })
})

const animeSearchResponseSchema = z.object({
  data: z.array(searchAnimeDataSchema),
  pagination: paginationSchema
})

const animeResponseSchema = z.object({
  data: animeDataSchema
})

type SearchAnimeData = z.infer<typeof searchAnimeDataSchema>
type AnimeData = z.infer<typeof animeDataSchema>

// Helpers

const youtubeEmbedRegex = /\/embed\/([a-zA-Z0-9_-]{11})/

const toDate = (prop: { year: number | null, month: number | null, day: number | null }): string | undefined => {
  if (prop.year == null || prop.month == null || prop.day == null) return undefined
  return new Date(prop.year, prop.month, prop.day).toUTCString()
}

const normalizeMedia = async (data: SearchAnimeData & { external?: { name: string, url: string }[] }, context: ExtractorServerContext) => {
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

  const coverUrl = data.images.webp.large_image_url

  return {
    _id: crypto.randomUUID(),
    uri: `${origin}:${data.mal_id}`,
    origin,
    id: data.mal_id.toString(),
    url: data.url,
    handles: [
      ...anidbHandle ? [anidbHandle] : [],
      ...anizipHandle ? [anizipHandle] : []
    ],
    score: 1,
    averageScore: data.score,
    descriptions:
      data.synopsis
        ? [{ language: 'en', description: data.synopsis }]
        : [],
    shortDescriptions:
      data.synopsis
        ? [{ language: 'en', shortDescription: data.synopsis }]
        : [],
    titles: [
      ... data.title_english ? [{ language: 'en', title: data.title_english, score: 1 }] : [],
      ... data.title ? [{ language: 'jp-en', title: data.title, score: 1 }] : [],
      ... data.title_japanese ? [{ language: 'jp', title: data.title_japanese, score: 1 }] : []
    ],
    covers: coverUrl ? [{ language: 'en', url: coverUrl }] : [],
    banners: [],
    episodes: [],
    episodeCount: data.episodes,
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? MediaStatus.Releasing
      : data.status === 'Finished Airing' ? MediaStatus.Finished
      : undefined,
    startDate: toDate(data.aired.prop.from),
    endDate: toDate(data.aired.prop.to),
    trailers
  } satisfies Media
}

// API functions

const fetchSearchAnime = ({ search }: { search: string }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime?q=${search}`)
    .then(response => response.json())
    .then(json => animeSearchResponseSchema.parse(json))
    .then(({ data }) => data.map(media => normalizeMedia(media, context)))

const fetchMedia = ({ id }: { id: number }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    .then(response => response.json())
    .then(json => animeResponseSchema.parse(json))
    .then(({ data }) => normalizeMedia(data, context))

const getSeasonNow = (page = 1, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/seasons/now?page=${page}&sfw=true`)
    .then(response => response.json())
    .then(json => animeSearchResponseSchema.parse(json))

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
}
