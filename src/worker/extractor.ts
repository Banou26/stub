import type { YogaInitialContext } from 'graphql-yoga'
import type { Exchange } from 'urql'

import type { Episode, Media, Origin, Resolvers } from '../generated/schema/types.generated'
import type { Uri } from 'src/utils/uri'
import type { Media as StoreMedia, Episode as StoreEpisode, Origin as StoreOrigin } from './store/types'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { useErrorHandler } from '@envelop/core'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { Client, fetchExchange, getOperationName } from 'urql'
import { getNamedType, GraphQLError } from 'graphql'
import DataLoader from 'dataloader'
import { pipe, tap } from 'wonka'

import { attach } from '@fkn/lib/packages'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from '../sources'
import { merge } from '../utils/merge'
import { fetch, fetchWithBackoff } from './fetch'
import { isAggregatedUri, fromAggregatedUri, type AggregatedUri } from '../utils/uri'
import { upsertMedia, upsertEpisodes, upsertOrigins, findAggregatedMedia } from './store/db'
import { aggregateMedia, recursivelyUnwrapMediaHandles } from './store/aggregate'
import { listenMultipleIterator } from './store/events'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
  key: (origin: string) => string | undefined
  findAggregatedMedia: (uri: string) => Promise<Media | undefined>
  listenForMediaChanges: (params: { uri: string }, options?: { abortSignal?: AbortSignal }) => AsyncGenerator<Media | undefined>
}

export type ExtractorUserContext = {

}

// User-supplied API keys (BYOK), pushed from the main thread's settings page over osra
// and read by keyful extractors via ctx.key(origin). Absent key -> the source no-ops.
let userKeys: Record<string, string> = {}
export const setUserKeys = (keys: Record<string, string>) => { userKeys = keys ?? {} }

// ─── Normalization helpers ───────────────────────────────────────────────────

const normalizeToStoreMedia = (media: Media): StoreMedia => ({
  uri: media.uri as Uri,
  origin: media.origin,
  id: media.id,
  url: media.url ?? null,
  score: media.score ?? null,
  type: (media.type as StoreMedia['type']) ?? null,
  categories: media.categories ?? [],
  status: (media.status as StoreMedia['status']) ?? null,
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

const normalizeToStoreEpisode = (episode: Episode): StoreEpisode => ({
  uri: episode.uri as Uri,
  origin: episode.origin,
  id: episode.id,
  url: episode.url ?? null,
  embedUrl: episode.embedUrl ?? null,
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

const normalizeOrigin = (origin: { id: string; url?: string | null; name: string; icon?: string | null; color?: string | null; isApiOnly: boolean }): StoreOrigin => ({
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

  await upsertMedia(allUnwrapped.map(normalizeToStoreMedia), handlePairs)
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

  await upsertEpisodes((episodes as Episode[]).map(normalizeToStoreEpisode), handlePairs)
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

export type ExtractorDefinition = {
  origin: string
  originUrl: string
  name: string
  icon?: string | null
  color?: string | null
  isApiOnly: boolean
  metadataOnly?: boolean
  resolvers: Resolvers
}

const makeExtractor = (extractor: ExtractorDefinition) => {
  const originData = normalizeOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl, icon: extractor.icon ?? null, color: extractor.color ?? null })

  const server = createYoga<Omit<ExtractorServerContext, keyof YogaInitialContext>, ExtractorUserContext>({
    schema: createSchema<Omit<ExtractorServerContext, keyof YogaInitialContext>>({
      typeDefs,
      resolvers:
        merge(
          {
            Media: {
              _id: (parent) => parent.uri,
              handles: (parent) => parent.handles ?? [],
              categories: (parent) => parent.categories ?? [],
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
          fetch: fetchWithBackoff,
          key: (origin: string) => userKeys[origin],
          findAggregatedMedia: (uri: string) => findAggregatedMediaForContext(uri),
          listenForMediaChanges: listenForMediaChangesForContext
        }
      )
  })

  return {
    name: extractor.name,
    server,
    client,
    extractor,
    pluginUri: undefined as string | undefined
  }
}

// Mutable on purpose: remote plugin sources register and unregister at runtime, and every fan-out
// path maps over this array at subscribe time, so registrations are picked up immediately.
export const extractors = Object.values(extractorDefinitions).map(makeExtractor)

// ─── Remote plugin sources (FKN packages) ────────────────────────────────────

// One end of a brokered FKN packages connection; the plugin's payload is a source module shape
// (see src/plugin-api.ts). Data fields materialize locally, resolver functions stay remote and
// execute inside the plugin's own sandbox frame.
type RemotePluginSubscribe = (parent: undefined, args: unknown, ctx: Record<string, never>) => Promise<AsyncIterable<any>>
type RemotePluginSource = {
  origin?: unknown
  originUrl?: unknown
  name?: unknown
  icon?: unknown
  color?: unknown
  isApiOnly?: unknown
  metadataOnly?: unknown
  resolvers?: {
    Subscription?: {
      media?: { subscribe?: RemotePluginSubscribe }
      mediaPage?: { subscribe?: RemotePluginSubscribe }
    }
  }
}

const PLUGIN_ORIGIN_TOKEN = /^[a-z0-9][a-z0-9-]{0,31}$/

// A plugin only speaks for its own registered origin: mismatching top-level media is dropped so a
// plugin cannot masquerade as another source. Nested handles stay untouched - cross-origin handles
// are how clustering works (accepted residual, bounded by the aggregation score threshold).
const enforcePluginOrigin = (origin: string, field: 'media' | 'mediaPage', payload: any): any => {
  if (field === 'media') {
    if (payload?.media && payload.media.origin !== origin) {
      console.warn(`Plugin source '${origin}' yielded media from origin '${payload.media.origin}', dropped`)
      return { media: null }
    }
    return payload
  }
  const nodes = payload?.mediaPage?.nodes
  if (!Array.isArray(nodes)) return payload
  const kept = nodes.filter((node: any) => {
    if (node?.origin === origin) return true
    console.warn(`Plugin source '${origin}' yielded media from origin '${node?.origin}', dropped`)
    return false
  })
  return { ...payload, mediaPage: { ...payload.mediaPage, nodes: kept } }
}

const makeDelegatingResolvers = (origin: string, remote: RemotePluginSource): Resolvers => {
  const subscription = remote.resolvers?.Subscription
  const delegate = (field: 'media' | 'mediaPage') => ({
    subscribe: async function* (_parent: unknown, args: unknown) {
      const subscribe = subscription?.[field]?.subscribe
      if (!subscribe) return
      // ctx stays empty across the connection: the plugin uses its own @fkn/lib fetch, and stub's
      // privileged context (store reads, user keys) never crosses to third-party code
      for await (const payload of await subscribe(undefined, args, {})) {
        yield enforcePluginOrigin(origin, field, payload)
      }
    }
  })
  return {
    Query: {},
    Mutation: {},
    Subscription: {
      ...(subscription?.media?.subscribe ? { media: delegate('media') } : {}),
      ...(subscription?.mediaPage?.subscribe ? { mediaPage: delegate('mediaPage') } : {}),
    }
  } as Resolvers
}

export const registerRemoteExtractor = async (port: MessagePort, pluginUri: string): Promise<{ origin: string, name: string }> => {
  const remote = await attach(port) as RemotePluginSource
  const origin = typeof remote.origin === 'string' ? remote.origin : ''
  if (!PLUGIN_ORIGIN_TOKEN.test(origin)) throw new Error(`plugin '${pluginUri}': origin must be a short lowercase token`)
  if (extractors.some(entry => entry.extractor.origin === origin)) throw new Error(`plugin '${pluginUri}': origin '${origin}' is already registered`)
  const definition: ExtractorDefinition = {
    origin,
    originUrl: typeof remote.originUrl === 'string' ? remote.originUrl : '',
    name: typeof remote.name === 'string' && remote.name ? remote.name.slice(0, 64) : origin,
    icon: typeof remote.icon === 'string' ? remote.icon : null,
    color: typeof remote.color === 'string' ? remote.color : null,
    isApiOnly: remote.isApiOnly === true,
    metadataOnly: remote.metadataOnly === true,
    resolvers: makeDelegatingResolvers(origin, remote)
  }
  const entry = makeExtractor(definition)
  entry.pluginUri = pluginUri
  extractors.push(entry)
  return { origin, name: definition.name }
}

export const unregisterRemoteExtractor = (pluginUri: string) => {
  for (let index = extractors.length - 1; index >= 0; index -= 1) {
    if (extractors[index]!.pluginUri === pluginUri) extractors.splice(index, 1)
  }
}

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
