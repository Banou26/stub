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
import { readPluginSources } from './plugin-sources'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
  key: (origin: string) => string | undefined
  findAggregatedMedia: (uri: string) => Promise<Media | undefined>
  listenForMediaChanges: (params: { uri: string }, options?: { abortSignal?: AbortSignal }) => AsyncGenerator<Media | undefined>
}

export type ExtractorUserContext = {

}

let userKeys: Record<string, string> = {}
export const setUserKeys = (keys: Record<string, string>) => { userKeys = keys ?? {} }

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

export const extractors = Object.values(extractorDefinitions).map(makeExtractor)

// data fields materialize locally, resolver functions stay remote and execute inside the plugin's own sandbox frame
type RemotePluginSubscribe = (parent: undefined, args: unknown, ctx: Record<string, never>) => Promise<AsyncIterable<any>>
/** One connection may carry several sources, so a package can ship a whole family of them. */
type RemotePluginPayload = RemotePluginSource & { sources?: unknown }
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

// nested handles stay untouched: cross-origin handles are how clustering works (accepted residual, bounded by the aggregation score threshold)
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
      // ctx stays empty across the connection: stub's privileged context (store reads, user keys) never crosses to third-party code
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

// the plugin frame renders its own picker, so the app needs both the package to show and the call
// that drives it; keyed by origin because that is all the source selector knows about a source
type RemotePicker = { pluginUri: string, select: (uris: string[]) => Promise<string | null> }
const pickers = new Map<string, RemotePicker>()

export const remotePicker = (origin: string): { pluginUri: string } | null => {
  const picker = pickers.get(origin)
  return picker ? { pluginUri: picker.pluginUri } : null
}

export const selectRemoteRelease = async (origin: string, uris: string[]): Promise<string | null> => {
  const picker = pickers.get(origin)
  if (!picker) return null
  return (await picker.select(uris)) ?? null
}

// A source that plays its own releases, unlike the picker, is only ever announced here: the app MOUNTS
// the package's frame in its player area and calls `play` on that connection, not on this one. The two
// are different documents of the same package, so a call made here would render into a frame nobody is
// looking at. All the app needs from the worker is which package to mount.
const players = new Map<string, string>()

export const remotePlayer = (origin: string): { pluginUri: string } | null => {
  const pluginUri = players.get(origin)
  return pluginUri ? { pluginUri } : null
}

export const registerRemoteExtractor = async (
  port: MessagePort,
  pluginUri: string
): Promise<{ sources: { origin: string, name: string }[], rejected: { origin: string, reason: string }[] }> => {
  const remote = await attach(port) as RemotePluginPayload
  const { sources, rejected } = readPluginSources(remote, pluginUri)

  // a reconnect re-registers the same plugin, so drop its own previous entries before the collision check
  unregisterRemoteExtractor(pluginUri)

  const registered: { origin: string, name: string }[] = []
  const failed = [...rejected]
  for (const { meta, source } of sources) {
    try {
      if (extractors.some(entry => entry.extractor.origin === meta.origin)) {
        throw new Error(`origin '${meta.origin}' is already registered by another source`)
      }
      const entry = makeExtractor({ ...meta, resolvers: makeDelegatingResolvers(meta.origin, source as RemotePluginSource) })
      entry.pluginUri = pluginUri
      extractors.push(entry)
      const select = (source as { selectRelease?: unknown }).selectRelease
      if (typeof select === 'function') {
        pickers.set(meta.origin, { pluginUri, select: select as RemotePicker['select'] })
      }
      if (typeof (source as { play?: unknown }).play === 'function') players.set(meta.origin, pluginUri)
      for (const fanout of fanouts) joinFanout(fanout, entry)
      registered.push({ origin: meta.origin, name: meta.name })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(new Error(`plugin '${pluginUri}': source '${meta.origin}' failed to register`, { cause: error }))
      failed.push({ origin: meta.origin, reason })
    }
  }

  for (const entry of failed) {
    console.warn(`plugin '${pluginUri}': skipped source '${entry.origin}' (${entry.reason})`)
  }
  if (!registered.length) {
    const detail = failed.map(entry => `${entry.origin}: ${entry.reason}`).join('; ')
    throw new Error(`plugin '${pluginUri}': no source could be registered${detail ? ` (${detail})` : ''}`)
  }

  return { sources: registered, rejected: failed }
}

export const unregisterRemoteExtractor = (pluginUri: string) => {
  for (const [origin, picker] of pickers) {
    if (picker.pluginUri === pluginUri) pickers.delete(origin)
  }
  for (const [origin, uri] of players) {
    if (uri === pluginUri) players.delete(origin)
  }
  for (let index = extractors.length - 1; index >= 0; index -= 1) {
    const entry = extractors[index]!
    if (entry.pluginUri !== pluginUri) continue
    extractors.splice(index, 1)
    for (const fanout of fanouts) leaveFanout(fanout, entry)
  }
}

type ExtractorEntry = (typeof extractors)[number]
type FanoutSubscription = ReturnType<ReturnType<ExtractorEntry['client']['subscription']>['subscribe']>

type SubscriptionArgs = Parameters<ExtractorEntry['client']['subscription']>

type Fanout = {
  query: SubscriptionArgs[0]
  variables: SubscriptionArgs[1]
  insertedUris: Set<string>
  extractUris?: (result: any) => string[]
  // the same array the caller holds and unsubscribes, so late joiners are torn down with the rest
  /** the same array the caller holds and unsubscribes, so late joiners are torn down with the rest */
  subscriptions: FanoutSubscription[]
  joined: Map<ExtractorEntry, FanoutSubscription>
}

// every in-flight fan-out, so a source that registers mid-subscription can still join it
const fanouts = new Set<Fanout>()

// one source must never be able to take down the fan-out: a source that cannot start is skipped
const joinFanout = (fanout: Fanout, extractor: ExtractorEntry) => {
  if (fanout.joined.has(extractor)) return
  let subscription: FanoutSubscription
  try {
    subscription = extractor.client.subscription(fanout.query, fanout.variables).subscribe((result) => {
      if (!fanout.extractUris) return
      try {
        for (const uri of fanout.extractUris(result) ?? []) {
          fanout.insertedUris.add(uri)
        }
      } catch (error) {
        console.error(new Error(`Extractor ${extractor.name} produced an unreadable fan-out result`, { cause: error }))
      }
    })
  } catch (error) {
    console.error(new Error(`Extractor ${extractor.name} failed to join the fan-out`, { cause: error }))
    return
  }
  fanout.joined.set(extractor, subscription)
  fanout.subscriptions.push(subscription)
}

const leaveFanout = (fanout: Fanout, extractor: ExtractorEntry) => {
  const subscription = fanout.joined.get(extractor)
  if (!subscription) return
  fanout.joined.delete(extractor)
  const index = fanout.subscriptions.indexOf(subscription)
  if (index !== -1) fanout.subscriptions.splice(index, 1)
  Promise.resolve(subscription.unsubscribe()).catch(() => {})
}

export const proxyRequestToExtractors = (ctx: ExtractorServerContext, extractUris?: (result: any) => string[]) => {
  const fanout: Fanout = {
    query: ctx.params.query!,
    variables: ctx.params.variables,
    insertedUris: new Set<string>(),
    extractUris,
    subscriptions: [],
    joined: new Map(),
  }
  for (const extractor of extractors) joinFanout(fanout, extractor)
  fanouts.add(fanout)

  return {
    subscriptions: fanout.subscriptions,
    insertedUris: fanout.insertedUris,
    // stop accepting late joiners; the caller still unsubscribes what it holds
    /** stop accepting late joiners; the caller still unsubscribes what it holds */
    close: () => { fanouts.delete(fanout) },
  }
}
