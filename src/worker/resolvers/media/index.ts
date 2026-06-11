import type { ExtractorServerContext } from '../../extractor'
import type { Media, MediaPage, MediaPageResolvers, Resolvers, SubscriptionResolver, SubscriptionResolvers } from '../../../generated/schema/types.generated'

// @ts-expect-error
import _schema from './schema.gql?raw'
import { proxyRequestToExtractors } from '../../extractor'
import { findAggregatedMedia, findAllAggregatedMedia, findAggregatedEpisodesForMedia, findMediaByAggregatedId } from '../../store/db'
import { fuzzyMergeMediaClusters } from '../../store/fuzzy-merge'
import { aggregateMedia, aggregateEpisode } from '../../store/aggregate'
import { listenMultipleIterator, debouncedListenIterator } from '../../store/events'
import { parseHTMLDescription, parseTextDescription } from '../utils'
import { searchRelevance } from '../../../sources/utils'
import { MediaDescriptionContentType } from '../../../generated/graphql'
import { isAggregatedUri, isUri, fromAggregatedUri, type AggregatedUri } from '../../../utils/uri'

export const schema = _schema as string

// Drop search results whose title doesn't actually match the query - sources do loose,
// sometimes semantic, server-side matching (e.g. Apple returns "WondLa" for "frieren").
// Lenient on purpose: only the clearly-irrelevant is dropped, the user picks from the rest.
const SEARCH_RELEVANCE_THRESHOLD = 0.7

const findAggregatedMediaForUri = async (uri: string) => {
  let cluster = await findAggregatedMedia(uri)
  if (cluster.length) return cluster

  cluster = await findMediaByAggregatedId(uri)
  if (cluster.length) return cluster

  if (isAggregatedUri(uri)) {
    const parsed = fromAggregatedUri(uri as AggregatedUri)
    for (const handleUri of parsed?.handleUris ?? []) {
      cluster = await findAggregatedMedia(handleUri)
      if (cluster.length) return cluster
    }
  }

  return []
}

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      resolve: (parent: Media) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.uri || !(isUri(args.input.uri) || isAggregatedUri(args.input.uri))) return
        const { subscriptions } = proxyRequestToExtractors(ctx)
        const iterator = listenMultipleIterator(['media:changed', 'episode:changed'], { abortSignal: ctx.request.signal })

        try {
          const cluster = await findAggregatedMediaForUri(args.input.uri)
          if (cluster.length) {
            yield aggregateMedia(cluster, location.origin)
          }

          for await (const _ of iterator) {
            const cluster = await findAggregatedMediaForUri(args.input.uri)
            if (cluster.length) {
              yield aggregateMedia(cluster, location.origin)
            }
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    },
    mediaPage: {
      resolve: (parent: Media[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        const { subscriptions, insertedUris } =
          proxyRequestToExtractors(
            ctx,
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
          let clusters = await findAllAggregatedMedia(uris.length ? uris : undefined)
          if (await fuzzyMergeMediaClusters(clusters)) {
            clusters = await findAllAggregatedMedia(uris.length ? uris : undefined)
          }
          let aggregated = clusters.map(cluster => aggregateMedia(cluster, location.origin))

          const categories = args.input.categories
          if (categories && categories.length) {
            aggregated = aggregated.filter(media => media.categories.some(category => categories.includes(category)))
          }

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
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    }
  },
  Media: {
    _id: (parent) => parent._id,
    categories: (parent) => parent.categories ?? [],
    episodes: async (parent) => {
      const handleUris = parent.handles?.map(h => h.uri) ?? []
      if (!handleUris.length) return parent.episodes ?? []

      const episodeGroups = await findAggregatedEpisodesForMedia(handleUris)
      if (!episodeGroups.length) return parent.episodes ?? []

      // Flatten all episodes, filter out specials (no episodeNumber),
      // then group by episodeNumber only
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
