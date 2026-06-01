import type { YogaInitialContext } from 'graphql-yoga'
import type { Exchange } from 'urql'

import type { Episode, Media, Origin, Resolvers } from '../generated/schema/types.generated'
import type { Uri } from 'src/utils/uri'
import type { Media as GrafeoMedia, Episode as GrafeoEpisode, Origin as GrafeoOrigin } from './store/types'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { useErrorHandler } from '@envelop/core'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { Client, fetchExchange, getOperationName } from 'urql'
import { getNamedType, GraphQLError } from 'graphql'
import DataLoader from 'dataloader'
import { pipe, tap } from 'wonka'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from '../sources'
import { merge } from '../utils/merge'
import { fetch } from './fetch'
import { isAggregatedUri, fromAggregatedUri, type AggregatedUri } from '../utils/uri'
import { upsertMedia, upsertEpisodes, upsertOrigins, findAggregatedMedia } from './store/db'
import { streamingPlatforms } from '../sources/streaming-platforms'
import { aggregateMedia, recursivelyUnwrapMediaHandles } from './store/aggregate'
import { listenMultipleIterator } from './store/events'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
  findAggregatedMedia: (uri: string) => Promise<Media | undefined>
  listenForMediaChanges: (params: { uri: string }, options?: { abortSignal?: AbortSignal }) => AsyncGenerator<Media | undefined>
}

export type ExtractorUserContext = {

}

// ─── Normalization helpers ───────────────────────────────────────────────────

const normalizeToGrafeoMedia = (media: Media): GrafeoMedia => ({
  uri: media.uri as Uri,
  origin: media.origin,
  id: media.id,
  url: media.url ?? null,
  score: media.score ?? null,
  type: (media.type as GrafeoMedia['type']) ?? null,
  status: (media.status as GrafeoMedia['status']) ?? null,
  titles: media.titles ?? [],
  descriptions: media.descriptions ?? [],
  shortDescriptions: media.shortDescriptions ?? [],
  trailers: media.trailers ?? [],
  covers: media.covers ?? [],
  banners: media.banners ?? [],
  externalLinks: media.externalLinks ?? null,
  averageScore: media.averageScore ?? null,
  popularity: media.popularity ?? null,
  startDate: media.startDate ?? null,
  endDate: media.endDate ?? null,
  isAdult: media.isAdult ?? null,
  episodeCount: media.episodeCount ?? null,
})

const normalizeToGrafeoEpisode = (episode: Episode): GrafeoEpisode => ({
  uri: episode.uri as Uri,
  origin: episode.origin,
  id: episode.id,
  url: episode.url ?? null,
  mediaUri: episode.mediaUri as Uri,
  score: episode.score ?? null,
  titles: episode.titles ?? [],
  descriptions: episode.descriptions ?? [],
  shortDescriptions: episode.shortDescriptions ?? [],
  thumbnails: episode.thumbnails ?? [],
  releaseDate: episode.releaseDate ?? null,
  seasonNumber: episode.seasonNumber ?? null,
  episodeNumber: episode.episodeNumber ?? null,
  absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
  runtime: episode.runtime ?? null,
})

const normalizeOrigin = (origin: { id: string; url?: string | null; name: string; icon?: string | null; color?: string | null; isApiOnly: boolean }): GrafeoOrigin => ({
  id: origin.id,
  url: origin.url ?? null,
  name: origin.name,
  icon: origin.icon ?? null,
  color: origin.color ?? null,
  isApiOnly: origin.isApiOnly,
})

// ─── Context helpers ─────────────────────────────────────────────────────────

const findAggregatedMediaForContext = async (uri: string): Promise<Media | undefined> => {
  let cluster = await findAggregatedMedia(uri)
  if (!cluster.length && isAggregatedUri(uri)) {
    const parsed = fromAggregatedUri(uri as AggregatedUri)
    for (const handleUri of parsed?.handleUris ?? []) {
      cluster = await findAggregatedMedia(handleUri)
      if (cluster.length) break
    }
  }
  if (!cluster.length) return undefined
  return aggregateMedia(cluster, location.origin)
}

const listenForMediaChangesForContext = async function* (
  params: { uri: string },
  options?: { abortSignal?: AbortSignal }
) {
  yield await findAggregatedMediaForContext(params.uri)

  const iterator = listenMultipleIterator(['media:changed', 'episode:changed'], { abortSignal: options?.abortSignal })
  for await (const _ of iterator) {
    yield await findAggregatedMediaForContext(params.uri)
  }
}

// ─── DataLoaders ─────────────────────────────────────────────────────────────

const mediaInserter = new DataLoader<Media, Media>(async (medias) => {
  const allUnwrapped = (medias as Media[]).flatMap(recursivelyUnwrapMediaHandles)

  const handlePairs: { mediaUri: string; handleUri: string }[] = []
  const seen = new Set<string>()
  for (const media of allUnwrapped) {
    for (const handle of media.handles ?? []) {
      const key = `${media.uri}\0${handle.uri}`
      if (!seen.has(key)) {
        seen.add(key)
        handlePairs.push({ mediaUri: media.uri, handleUri: handle.uri })
      }
    }
  }

  await upsertMedia(allUnwrapped.map(normalizeToGrafeoMedia), handlePairs)
  return medias
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

const episodeInserter = new DataLoader<Episode, Episode>(async (episodes) => {
  const handlePairs: { episodeUri: string; handleUri: string }[] = []
  for (const episode of episodes as Episode[]) {
    for (const handle of episode.handles ?? []) {
      handlePairs.push({ episodeUri: episode.uri, handleUri: handle.uri })
    }
  }

  await upsertEpisodes((episodes as Episode[]).map(normalizeToGrafeoEpisode), handlePairs)
  return episodes
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

const originInserter = new DataLoader<Origin, Origin>(async (origins) => {
  await upsertOrigins((origins as Origin[]).map(o => normalizeOrigin({ ...o, url: o.url ?? null, icon: o.icon ?? null, color: o.color ?? null })))
  return origins
}, {
  cache: false,
  batch: true,
  maxBatchSize: 50,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

// ─── Extractors ──────────────────────────────────────────────────────────────

export const extractors =
  Object
    .entries(extractorDefinitions)
    .map(([name, extractor]) => {
      const originData = normalizeOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl })

      const server = createYoga<Omit<ExtractorServerContext, keyof YogaInitialContext>, ExtractorUserContext>({
        schema: createSchema<Omit<ExtractorServerContext, keyof YogaInitialContext>>({
          typeDefs,
          resolvers:
            merge(
              {
                Media: {
                  _id: (parent) => parent.uri,
                  handles: (parent) => parent.handles ?? [],
                  titles: (parent) => parent.titles ?? [],
                  descriptions: (parent) => parent.descriptions ?? [],
                  shortDescriptions: (parent) => parent.shortDescriptions ?? [],
                  covers: (parent) => parent.covers ?? [],
                  banners: (parent) => parent.banners ?? [],
                  trailers: (parent) => parent.trailers ?? [],
                  episodes: (parent) => parent.episodes ?? [],
                },
                Episode: {
                  _id: (parent) => parent.uri,
                  handles: (parent) => parent.handles ?? [],
                  descriptions: (parent) => parent.descriptions ?? [],
                  shortDescriptions: (parent) => parent.shortDescriptions ?? []
                },
                Query: {
                },
                Mutation: {
                },
                Subscription: {
                  origin: {
                    resolve: () => originData,
                    subscribe: async function*() { return yield originData }
                  },
                  originPage: {
                    resolve: () => ({ nodes: [originData] }),
                    subscribe: async function* () { yield [originData] }
                  },
                  media: { subscribe: async function* (_parent) { yield { media: null } } },
                  mediaPage: { subscribe: async function* (_parent) { yield { mediaPage: { nodes: [] } } } }
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
          useResponseCache({ session: () => null, ttl: 15 * 60 * 1000 }),
          {
            onPluginInit: ({ addPlugin }) => {
              addPlugin(useOnResolve(({ info }) =>
                async ({ result }) => {
                  if (getNamedType(info.returnType).name === 'Media') {
                    if (Array.isArray(result)) {
                      await mediaInserter.loadMany(result as Media[])
                    } else if (result) {
                      await mediaInserter.load(result as Media)
                    }
                  } else if (getNamedType(info.returnType).name === 'Episode') {
                    if (Array.isArray(result)) {
                      await episodeInserter.loadMany(result as Episode[])
                    } else if (result) {
                      await episodeInserter.load(result as Episode)
                    }
                  } else if (getNamedType(info.returnType).name === 'Origin') {
                    if (Array.isArray(result)) {
                      await originInserter.loadMany(result as Origin[])
                    } else if (result) {
                      await originInserter.load(result as Origin)
                    }
                  }
                }
              ))
            }
          }
        ],
        maskedErrors: {
          maskError(error, message, isDev) {
            console.error(`Server Extractor ${extractor.name} GQLError occurred:`, error)
            return new GraphQLError((error as Error).message)
          },
        }
      })

      const errorExchange: Exchange = ({ forward }) => (ops$) => {
        return pipe(
          forward(ops$),
          tap((result) => {
            if (result.error) {
              if (result.error.networkError) {
                console.error(new Error(`Client Extractor ${extractor.name} Network error on ${getOperationName(result.operation.query)}:`, { cause: result.error.networkError }))
              }
              if (result.error.graphQLErrors?.length) {
                result.error.graphQLErrors.forEach((err) => {
                  console.error(new Error(`Client Extractor ${extractor.name} GraphQL error on ${getOperationName(result.operation.query)}:`, { cause: err }))
                })
              }
            }
          })
        )
      }

      const client = new Client({
        url: 'http://d/graphql',
        exchanges: [errorExchange, fetchExchange],
        fetchSubscriptions: true,
        fetch: async (input: Parameters<typeof globalThis.fetch>[0], init: Parameters<typeof globalThis.fetch>[1]) =>
          server.handleRequest(
            new Request(input, init),
            {
              fetch,
              findAggregatedMedia: (uri: string) => findAggregatedMediaForContext(uri),
              listenForMediaChanges: listenForMediaChangesForContext
            }
          )
      })

      return {
        name: extractor.name,
        server,
        client,
        extractor
      }
    })

// Register branded metadata for streaming platforms surfaced by JustWatch but without
// their own extractor, so their source buttons render with a name/logo/colour.
upsertOrigins(
  streamingPlatforms.map(platform =>
    normalizeOrigin({ ...platform, isApiOnly: false })
  )
)

export const proxyRequestToExtractors = (ctx: ExtractorServerContext, extractUris?: (result: any) => string[]) => {
  const insertedUris = new Set<string>()

  const subscriptions = extractors.map(extractor =>
    extractor.client.subscription(
      ctx.params.query!,
      ctx.params.variables
    ).subscribe((result) => {
      if (!extractUris) return
      for (const uri of extractUris(result) ?? []) {
        insertedUris.add(uri)
      }
    })
  )

  return { subscriptions, insertedUris }
}
