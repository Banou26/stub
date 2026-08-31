import type { YogaInitialContext } from 'graphql-yoga'
import type { Exchange } from 'urql'

import type { Episode, Media, MediaSeasonInput, Origin, Resolvers } from '../generated/schema/types.generated'
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
  /**
   * Ask ONE other origin to name the run of a show that started nearest a date. See `resolveSeason`
   * below for what it costs and what it refuses.
   */
  resolveSeason: (origin: string, input: MediaSeasonInput) => Promise<Media | undefined>
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

/**
 * One origin, one show id, one date, and the answer is that origin's own run or nothing.
 *
 * WHY THIS EXISTS. Stub models a broadcast run; every catalogue models a show. A source holding a
 * show-level link (Kitsu publishes Crunchyroll's `/series/<id>/` url on EVERY season record) has
 * something true about the show and nothing it may honestly mint as a handle, because a handle is an
 * identity claim and `graph.link` is a union-find union with no inverse. Dropping the link loses a
 * real offer; minting it welds every season of the show. This is the third option: hand the show id
 * back to the origin that owns it, say when our run started, and take the season-scoped media it
 * names, which IS an honest identity and links like any other.
 *
 * The two sources that needed this already do it, by importing Crunchyroll's internals directly
 * (anilist/extractor.ts and justwatch/extractor.ts both `import ... from '../crunchyroll/extractor'`).
 * So this replaces ad-hoc coupling with one declared capability rather than adding coupling.
 *
 * THE SELECTION IS DELIBERATELY MINIMAL. The store does not read it: `useOnResolve` below fires on
 * the RESOLVER'S RETURN VALUE, not on the selection set, so the full media is inserted whatever is
 * asked for here. The caller only ever needs enough to build a handle.
 */
const MEDIA_SEASON_DOCUMENT = `
  subscription MediaSeason($input: MediaSeasonInput!) {
    mediaSeason(input: $input) {
      uri
      origin
      id
      url
    }
  }
`

// A source may walk every season of a show to answer, which is one request per season on top of the
// seasons call, so this is generous. It is a backstop against a source that never yields, not a
// latency budget: the common answers, a hit and a refusal, both arrive on the first payload.
const RESOLVE_SEASON_TIMEOUT_MS = 30_000

/**
 * Cycles are ALLOWED here, by decision: a source may call `resolveSeason` from inside its own
 * `mediaSeason` resolver, and nothing removes that capability. What is bounded is the part that
 * cannot make progress anyway.
 *
 * A repeat of a question already being answered is the only cycle this can see for certain, and
 * returning the in-flight promise to its own caller would deadlock it, so the nested ask is declined
 * with a warning and the OUTER call carries on. The ceiling is the blunt half: a mutual recursion
 * that varies its show id every hop is not a repeat, so nothing above would catch it, and this stops
 * it costing the worker rather than a log line.
 *
 * Neither is exact detection. That would need the call chain threaded through the request, and the
 * only honest places to put it are the public input or a module-level stack, which a browser worker
 * cannot keep straight across awaits (no AsyncLocalStorage). Worth revisiting if a real cycle ever
 * shows up in the warnings.
 */
const MAX_CONCURRENT_RESOLVE_SEASON = 32

/**
 * And a per-caller share, because the ceiling above is global and a third-party source can spend it.
 *
 * A plugin may register a `mediaSeason` resolver that simply never yields, and a slot is then held
 * for the full RESOLVE_SEASON_TIMEOUT_MS. Enough of those pin the global ceiling, and the next
 * FIRST-PARTY ask is refused: kitsu drops its Crunchyroll offer and the page looks exactly like a
 * source that had no answer. A per-caller share cannot stop a plugin wasting its own budget, which is
 * fine, and does stop it spending anybody else's.
 */
const MAX_RESOLVE_SEASON_PER_CALLER = 8

/**
 * What a showId may look like, checked ONCE here rather than in each of the 23 sources.
 *
 * Every source interpolates ids straight into a url (`${CMS}/series/${id}/seasons`, `/tv/${showId}`,
 * `/series/${id}/extended`), which was safe for as long as an id could only have come out of an
 * upstream response. This endpoint is the first place an id is chosen by the CALLER, and a plugin is
 * a caller. `..` segments normalise and a `?` or `#` terminates the path, so an unchecked id steers
 * which path on that host gets fetched and what query it carries. The host cannot move, since the
 * prefix is absolute, and the method, headers and body are the source's own, so this is the whole of
 * the exposure and it closes here.
 *
 * The character set is the union of every id shape actually in use: Crunchyroll `G24H1N3MP`, Apple TV
 * `umc.cmc.1srk2goyh2q2zdxcx605w8vtx`, a Hulu uuid, a numeric TVmaze or TMDB id, and a trakt slug
 * like `mushoku-tensei-jobless-reincarnation`.
 */
const SAFE_SHOW_ID = /^[A-Za-z0-9._~-]{1,128}$/

const seasonAsksInFlight = new Map<string, Promise<Media | undefined>>()
const asksByCaller = new Map<string, number>()

const firstMediaSeason = (
  extractor: ReturnType<typeof makeExtractor>,
  input: MediaSeasonInput
): Promise<Media | undefined> =>
  new Promise(resolve => {
    let settled = false
    let subscription: { unsubscribe: () => void } | undefined
    const finish = (media: Media | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // the callback can fire before `subscribe` has returned, so unsubscribing is deferred a tick
      queueMicrotask(() => { try { subscription?.unsubscribe() } catch { /* already gone */ } })
      resolve(media)
    }
    const timer = setTimeout(() => finish(undefined), RESOLVE_SEASON_TIMEOUT_MS)
    try {
      subscription =
        extractor.client
          .subscription(MEDIA_SEASON_DOCUMENT, { input })
          .subscribe(result => {
            if (result.error) return finish(undefined)
            // any DELIVERED payload settles this, including an explicit null. A source that cannot
            // answer yields null once and ends, and waiting out the timeout for that would turn the
            // ordinary refusal into the slowest path in the system.
            if (!result.data) return
            finish((result.data as { mediaSeason?: Media | null }).mediaSeason ?? undefined)
          })
    } catch (error) {
      console.error(new Error(`Extractor ${extractor.name} failed to answer mediaSeason`, { cause: error }))
      finish(undefined)
    }
  })

/**
 * The ask, bound to the origin doing the asking so a budget can be attributed to it.
 *
 * THE DEDUPE KEY IS NORMALISED TO A DAY, and that is not a rounding convenience. The same question
 * about the same run arrives spelled at least three ways: kitsu passes its own `YYYY-MM-DD`, anilist
 * builds `new Date(...).toUTCString()` and would arrive as `Sun, 09 Jul 2023 00:00:00 GMT`, and a
 * crunchyroll show-level media carries `${year}-01-01`. Keyed raw, two callers asking the identical
 * question would not match, so the cycle guard would not fire in precisely the case it exists for. A
 * day is the right granularity because the whole design turns on a 45 day window and 91 day cour
 * spacing: two asks a few hours apart are the same question.
 */
const resolveSeasonFrom = (caller: string) =>
  async (origin: string, input: MediaSeasonInput): Promise<Media | undefined> => {
    if (!origin || !input?.showId || !input?.startDate) return undefined
    if (!SAFE_SHOW_ID.test(input.showId)) {
      console.warn(`resolveSeason: '${caller}' asked ${origin} for a showId that is not an id, declined`)
      return undefined
    }

    const day = new Date(input.startDate)
    if (Number.isNaN(day.getTime())) return undefined

    const extractor = extractors.find(candidate => candidate.extractor.origin === origin)
    if (!extractor) return undefined

    /**
     * A repeat of a question already in flight JOINS it rather than being refused.
     *
     * Most repeats are not cycles. Measured on the real app the first time this shipped: two kitsu
     * records for one show asked `(cr, GT00374354, 2026-07-07)` concurrently, and refusing the second
     * cost it its Crunchyroll handle for no reason, since the answer was seconds away. Sharing the
     * promise gives both the right answer and costs one upstream walk instead of two.
     *
     * A genuine cycle joins its own ancestor, which cannot settle until the ancestor does. That is a
     * stall rather than a deadlock: the ancestor's `firstMediaSeason` timer settles it at
     * RESOLVE_SEASON_TIMEOUT_MS and the whole chain unwinds with undefined. Bounded, warned about,
     * and not prevented, which is the shape asked for.
     */
    const key = `${origin}\u0000${input.showId}\u0000${day.toISOString().slice(0, 10)}`
    const inFlight = seasonAsksInFlight.get(key)
    if (inFlight) {
      console.warn(`resolveSeason repeat: ${origin} ${input.showId} at ${input.startDate} is already in flight, '${caller}' joins it. A repeat that is really a cycle unwinds on the ${RESOLVE_SEASON_TIMEOUT_MS}ms timeout.`)
      return inFlight
    }

    const byCaller = asksByCaller.get(caller) ?? 0
    if (byCaller >= MAX_RESOLVE_SEASON_PER_CALLER || seasonAsksInFlight.size >= MAX_CONCURRENT_RESOLVE_SEASON) {
      console.warn(`resolveSeason ceiling: '${caller}' holds ${byCaller} of ${seasonAsksInFlight.size} asks in flight, declining ${origin} ${input.showId}`)
      return undefined
    }

    asksByCaller.set(caller, byCaller + 1)
    const ask = firstMediaSeason(extractor, input).finally(() => {
      seasonAsksInFlight.delete(key)
      const left = (asksByCaller.get(caller) ?? 1) - 1
      if (left > 0) asksByCaller.set(caller, left)
      else asksByCaller.delete(caller)
    })
    seasonAsksInFlight.set(key, ask)
    return ask
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
              mediaPage: { subscribe: async function* (_parent) { yield { mediaPage: { nodes: [] } } } },
              // most sources cannot answer show-plus-date, and the default has to YIELD that rather
              // than end: a subscription generator that completes without yielding makes yoga respond
              // 204 No Content, which the caller would sit on until its timeout instead of reading a
              // refusal off the first payload
              mediaSeason: { subscribe: async function* (_parent) { yield { mediaSeason: null } } }
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
          listenForMediaChanges: listenForMediaChangesForContext,
          resolveSeason: resolveSeasonFrom(extractor.origin)
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

/** Everything a plugin source is handed. One function, and see `delegate` below for why only this one. */
type RemotePluginContext = { resolveSeason: ExtractorServerContext['resolveSeason'] }
type RemotePluginSubscribe = (parent: undefined, args: unknown, ctx: RemotePluginContext) => Promise<AsyncIterable<any>>
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
      mediaSeason?: { subscribe?: RemotePluginSubscribe }
    }
  }
}

// nested handles stay untouched: cross-origin handles are how clustering works (accepted residual, bounded by the aggregation score threshold)
type PluginField = 'media' | 'mediaPage' | 'mediaSeason'

const enforcePluginOrigin = (origin: string, field: PluginField, payload: any): any => {
  // mediaSeason answers with one media, exactly as `media` does, so it is held to the same rule: a
  // plugin may only ever name ITS OWN run. Without this a plugin asked about its own show could
  // answer with someone else's uri and have it linked as an identity.
  if (field === 'media' || field === 'mediaSeason') {
    if (payload?.[field] && payload[field].origin !== origin) {
      console.warn(`Plugin source '${origin}' yielded media from origin '${payload[field].origin}', dropped`)
      return { [field]: null }
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
  const delegate = (field: PluginField) => ({
    subscribe: async function* (_parent: unknown, args: unknown) {
      const subscribe = subscription?.[field]?.subscribe
      if (!subscribe) return
      /**
       * The ctx a plugin sees is EXACTLY one function and never the real one. Stub's privileged
       * context, the proxy fetch, the user's API keys and the store reads, still does not cross to
       * third-party code; what crosses is the ability to ask a first-party source "which run of this
       * show started nearest this date", which is the same question the app asks on the plugin's
       * behalf anyway.
       *
       * Deliberate, and worth knowing rather than assuming: a plugin CAN now cause a key-gated source
       * to spend the user's key on a request it did not initiate. The surface is narrow, three scalars
       * that every implementation looks up rather than interpolates into a url, and the answer it gets
       * back is a media the app was going to fetch anyway. It is not nothing, which is why it is
       * written down here next to the code rather than in a commit message.
       */
      for await (const payload of await subscribe(undefined, args, { resolveSeason: resolveSeasonFrom(origin) })) {
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
      ...(subscription?.mediaSeason?.subscribe ? { mediaSeason: delegate('mediaSeason') } : {}),
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

  /**
   * Ask a subset of the sources again, with a question they can actually answer.
   *
   * A source identifies itself by finding its own handle inside the uri it is handed, and that uri is
   * captured once above. So a source whose id is contributed LATER by another source was asked before
   * that id existed, answered "not mine", and ended: its `Subscription.media` is a yield-once
   * generator with no retry (crunchyroll/extractor.ts:247-252). Re-asking is the only way it ever
   * fetches its own data on the click path, which is the whole of what a reload does differently.
   *
   * Deliberately NOT recorded in `fanout.joined`, which tracks the original variables so a source
   * registering mid-flight joins exactly once. These land in `subscriptions`, so the caller's
   * teardown collects them with the rest.
   */
  const askOrigins = (originIds: string[], variables: SubscriptionArgs[1]) => {
    for (const extractor of extractors) {
      if (!originIds.includes(extractor.extractor.origin)) continue
      try {
        fanout.subscriptions.push(
          extractor.client.subscription(fanout.query, variables).subscribe(() => {})
        )
      } catch (error) {
        console.error(new Error(`Extractor ${extractor.name} failed to re-join the fan-out`, { cause: error }))
      }
    }
  }

  return {
    subscriptions: fanout.subscriptions,
    insertedUris: fanout.insertedUris,
    askOrigins,
    // stop accepting late joiners; the caller still unsubscribes what it holds
    /** stop accepting late joiners; the caller still unsubscribes what it holds */
    close: () => { fanouts.delete(fanout) },
  }
}
