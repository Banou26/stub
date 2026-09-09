import type { ExtractorServerContext } from '../../extractor'
import type { Media, MediaPage, MediaPageResolvers, Resolvers, SubscriptionResolver, SubscriptionResolvers } from '../../../generated/schema/types.generated'

// @ts-expect-error
import _schema from './schema.gql?raw'
import { implementsSimilarMedia, proxyRequestToExtractors, similarOutcomeFrom } from '../../extractor'
import { resolveSimilarRuns } from '../../similar-consumer'
import { findAggregatedMedia, findAllAggregatedMedia, findAggregatedEpisodesForMedia, findMediaForPage, findRunEpisodes, hideAttachedContainers } from '../../store/db'
import { applyMediaFilters } from '../../store/filter'
import { fuzzyMergeMediaClusters } from '../../store/fuzzy-merge'
import { aggregateMedia, aggregateEpisode, sameAsHandleUris } from '../../store/aggregate'
import { listenMultipleIterator, debouncedListenIterator } from '../../store/events'
import { parseHTMLDescription, parseTextDescription } from '../utils'
import { searchRelevance } from '../../../sources/utils'
import { MediaDescriptionContentType } from '../../../generated/graphql'
import { decodeRouteUri, isAggregatedUri, isUri, originsOfUri } from '../../../utils/uri'

export const schema = _schema as string

// Drop search results whose title doesn't actually match the query - sources do loose, sometimes semantic, server-side matching (e.g. Apple returns "WondLa" for "frieren").
const SEARCH_RELEVANCE_THRESHOLD = 0.7

// the app's own asks of `similarMedia`, budgeted under one caller like any source's
const askSimilar = similarOutcomeFrom('app')

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      resolve: (parent: Media) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        const requestedUri = decodeRouteUri(args.input.uri ?? undefined)
        if (!requestedUri || !(isUri(requestedUri) || isAggregatedUri(requestedUri))) {
          // a refused page and a slow one are indistinguishable from outside the worker without this
          console.warn(`media: refused '${args.input.uri}', which names no uri`)
          return
        }
        const { subscriptions, close, askOrigins, root } = proxyRequestToExtractors(ctx, 'MEDIA')
        const iterator = listenMultipleIterator(['media:changed', 'episode:changed'], { abortSignal: ctx.request.signal })

        /**
         * The uri the sources were asked about is the one the caller had at subscribe time, and a card
         * on the home page links to a narrow one: the listing builds its media without running the
         * mappers that mint a `cr:` handle (sources/anilist/extractor.ts:320 against :295). A source
         * can only recognise itself by finding its own handle in the uri it is handed, so every source
         * missing from that narrow uri answered "not mine" and ENDED, milliseconds before another
         * source contributed its id.
         *
         * So track which origins have been asked with a uri that actually named them, and re-ask the
         * ones that only just became addressable. Asking the newly named origins rather than re-running
         * the whole fan-out matters: nothing caches this path (@envelop/response-cache hooks onExecute
         * and skips subscriptions), so a blanket re-fan would re-hit every upstream on every merge.
         *
         * Terminates: an origin enters the set once and never leaves, and the cluster only ever gains
         * members (union-find unions, it never splits), so each source is asked at most twice.
         */
        const askedOrigins = new Set(originsOfUri(requestedUri))
        const askUnasked = (mediaUri: string) => {
          const unasked = originsOfUri(mediaUri).filter(origin => !askedOrigins.has(origin))
          if (!unasked.length) return
          for (const origin of unasked) askedOrigins.add(origin)
          const variables = ctx.params.variables as { input?: Record<string, unknown> } | undefined
          askOrigins(unasked, { ...variables, input: { ...variables?.input, uri: mediaUri } })
        }

        const read = async () => {
          // A show whose run is in the store is shown as that run: see `preferAttachedRun` in
          // store/db.ts, where the choice lives so it can be pinned (this module reaches urql and
          // cannot load under vitest).
          const cluster = await findMediaForPage(requestedUri)
          if (!cluster.length) return undefined
          const media = aggregateMedia(cluster, location.origin)
          askUnasked(media.uri)
          // a MEDIA root by construction: only this resolver runs it, so a listing never asks
          void resolveSimilarRuns(cluster, root, { ask: askSimilar, implemented: implementsSimilarMedia })
          return media
        }

        try {
          const first = await read()
          if (first) yield first

          for await (const _ of iterator) {
            const next = await read()
            if (next) yield next
          }
        } finally {
          close()
          await Promise.allSettled(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    },
    mediaPage: {
      resolve: (parent: Media[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        const { subscriptions, insertedUris, close } =
          proxyRequestToExtractors(
            ctx,
            'MEDIA_PAGE',
            (result: { data: { mediaPage: MediaPage } }) =>
              result
                ?.data
                ?.mediaPage
                ?.nodes
                ?.map(({ uri }) => uri)
          )
        const iterator = debouncedListenIterator(['media:changed'], 100, { abortSignal: ctx.request.signal })

        const getPage = async () => {
          const uris = [...insertedUris]
          // THE WHOLE-STORE FALLBACK IS LOAD BEARING, and it does not look it.
          //
          // `insertedUris` is empty until a source answers, so this is the first yield's only content.
          // Refusing it and answering [] instead is the obvious way to keep a filtered page from
          // opening on the previous page's results, and it BREAKS the page outright: this generator
          // only re-runs on `media:changed`, and a second subscription over a warm store changes
          // nothing, because `graph.set` is idempotent (tests/unit/worker/store/edge-idempotence.test.ts).
          // So no event ever fires and the page stays empty. Measured 2026-09-06 on the search page:
          // picking a format on a loaded season sat at 0 cards for 60 seconds, where the same url
          // opened cold answered 24.
          //
          // What keeps the fallback honest is `applyMediaFilters` below, which runs on it like any
          // other page: a stale row from an earlier query only survives if it genuinely matches the
          // season, format, genres and tags now being asked for.
          let clusters = await findAllAggregatedMedia(uris.length ? uris : undefined)
          if (await fuzzyMergeMediaClusters(clusters)) {
            clusters = await findAllAggregatedMedia(uris.length ? uris : undefined)
          }
          clusters = hideAttachedContainers(clusters)
          let aggregated = clusters.map(cluster => aggregateMedia(cluster, location.origin))

          // Everything decidable from the aggregated row, in one pinned place. It runs AFTER
          // `hideAttachedContainers` above: dropping a run cluster before that leaves its container
          // behind as an orphan card, because a container is only hidden when a run cluster in the
          // same list points at it.
          aggregated = applyMediaFilters(aggregated, args.input)

          const search = args.input.search
          if (search) {
            const scored = await Promise.all(
              aggregated.map(async media => ({
                media,
                score: await searchRelevance(search, (media.titles ?? []).map(title => title.title))
              }))
            )
            aggregated =
              scored
                .filter(entry => entry.score >= SEARCH_RELEVANCE_THRESHOLD)
                .sort((a, b) => b.score - a.score || (b.media.popularity ?? 0) - (a.media.popularity ?? 0))
                .map(entry => entry.media)
          }

          const sorts = args.input.sorts ?? []
          for (const sort of sorts) {
            if (sort === 'POPULARITY') {
              aggregated.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
            } else if (sort === 'POPULARITY_DESC') {
              aggregated.sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0))
            }
          }
          return aggregated
        }

        try {
          yield await getPage()
          for await (const _ of iterator) {
            yield await getPage()
          }
        } finally {
          close()
          await Promise.allSettled(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    }
  },
  Media: {
    _id: (parent) => parent._id,
    categories: (parent) => parent.categories ?? [],
    episodes: async (parent) => {
      // SAME_AS ONLY. See `sameAsHandleUris`, which carries the reasoning and the test: this module
      // cannot be imported under vitest, so the rule lives where it can be pinned.
      const handleUris = sameAsHandleUris(parent.handles)
      if (!handleUris.length) return parent.episodes ?? []

      // findRunEpisodes, not the bare walk: a member that packages this run inside a longer season
      // brings that season's whole list with it, and only the part of it that fits the run is this
      // run's. See store/consensus.ts.
      //
      // The cluster is read from the FIRST HANDLE, not from `parent.uri` through findMediaForPage:
      // that one falls back through handles and prefers an attached run, so it can answer with a
      // different set from the one whose episodes are being walked, and the counts deciding the trim
      // have to come from exactly the rows that supplied the episodes.
      // the FIRST handle that resolves, not the first handle. They all reach the same cluster, but a
      // uri whose row has not landed yet resolves to nothing, and taking that as "no cluster" dropped
      // the page onto the unwindowed walk, where a lent season's whole 24 episodes are drawn
      let cluster: Awaited<ReturnType<typeof findAggregatedMedia>> = []
      for (const uri of handleUris) {
        cluster = await findAggregatedMedia(uri)
        if (cluster.length) break
      }
      const episodeGroups = cluster.length
        ? await findRunEpisodes(cluster)
        : await findAggregatedEpisodesForMedia(handleUris)
      if (!episodeGroups.length) return parent.episodes ?? []

      const allEpisodes = episodeGroups.flat()
        .filter(ep => ep.episodeNumber != null)
      const grouped = new Map<number, typeof allEpisodes>()
      for (const ep of allEpisodes) {
        if (!grouped.has(ep.episodeNumber!)) grouped.set(ep.episodeNumber!, [])
        grouped.get(ep.episodeNumber!)!.push(ep)
      }

      return [...grouped.values()]
        .map(group => aggregateEpisode(group, location.origin))
        .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
    },
    descriptions: (parent, args) => {
      const descriptions =
        parent
          .descriptions
          ?.slice(0, args.input?.count ? args.input.count : undefined)
          .map(mediaDescription => {
            const parsed =
              args.input?.type === MediaDescriptionContentType.Html ? parseHTMLDescription(mediaDescription.description)
              : args.input?.type === MediaDescriptionContentType.Text ? parseTextDescription(mediaDescription.description)
              : parseTextDescription(mediaDescription.description)

            return {
              ...mediaDescription,
              shortDescription: parsed
            }
          })

      return descriptions
    },
    shortDescriptions: (parent, args) => {
      const shortDescriptions =
        parent
          .shortDescriptions
          ?.slice(0, args.input?.count ? args.input.count : undefined)
          ?.map(mediaShortDescription => {
            const parsed =
              args.input?.type === MediaDescriptionContentType.Html ? parseHTMLDescription(mediaShortDescription.shortDescription)
              : args.input?.type === MediaDescriptionContentType.Text ? parseTextDescription(mediaShortDescription.shortDescription)
              : parseTextDescription(mediaShortDescription.shortDescription)

            return {
              ...mediaShortDescription,
              shortDescription: parsed
            }
          })
          .filter((mediaShortDescription): mediaShortDescription is NonNullable<typeof mediaShortDescription> => Boolean(mediaShortDescription))

      return shortDescriptions
    },
    handles: (parent) => parent.handles ?? [],
  }
} satisfies Resolvers
