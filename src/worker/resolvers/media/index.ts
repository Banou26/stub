import type { ExtractorServerContext } from '../../extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'

import { eq, asc, inArray } from 'drizzle-orm'

// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors, proxyRequestToExtractors } from '../../extractor'
import { findAggregatedMediaList, findMediaByUris, listenForMediaChanges, listenForMediaListChanges, normalizeGraphqlAggregatedEpisode, type DrizzleSQLiteTransaction } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'
import { parseHTMLDescription, parseTextDescription } from '../utils'
import { MediaDescriptionContentType } from '../../../generated/graphql'
import database from '../../drizzle'
import { aggregatedMediaEpisodesTable, aggregatedEpisodeTable } from '../../drizzle/schema'
import { isAggregatedUri, isUri } from '../../../utils/uri'
import { mergeAsyncIterators } from '../../../utils/async-iterator'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      resolve: (parent: Media) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.uri || !(isUri(args.input.uri) || isAggregatedUri(args.input.uri))) return
        const subscriptions = proxyRequestToExtractors(ctx)

        try {
          yield* listenForMediaChanges(
            { uri: args.input.uri },
            { abortSignal: ctx.request.signal }
          )
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    },
    mediaPage: {
      resolve: (parent: Media[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        const subscriptions = proxyRequestToExtractors(ctx)

        try {
          yield* listenForMediaListChanges(
            { sorts: args.input.sorts ?? undefined },
            { abortSignal: ctx.request.signal }
          )
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
        }
      }
    }
  },
  Media: {
    _id: (parent) => parent._id,
    episodes: async (parent) => {
      if (parent.uri.startsWith('ag:')) {
        const db = database as unknown as DrizzleSQLiteTransaction
        const episodeIds = await database
          .select({ id: aggregatedMediaEpisodesTable.aggregatedEpisodeId })
          .from(aggregatedMediaEpisodesTable)
          .where(eq(aggregatedMediaEpisodesTable.aggregatedMediaId, parent._id))
          .then(results => results.map(r => r.id))

        if (!episodeIds.length) return parent.episodes

        const episodes = await db.query.aggregatedEpisodeTable.findMany({
          where: inArray(aggregatedEpisodeTable._id, episodeIds),
          orderBy: asc(aggregatedEpisodeTable.episodeNumber),
          with: {
            handles: {
              with: {
                episode: true
              }
            }
          }
        })

        return episodes.length
          ? episodes.map(normalizeGraphqlAggregatedEpisode)
          : parent.episodes
      }
      return parent.episodes
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
    handles: async (parent) => {
      if (!parent.handles?.length) return []

      // Check if handles already have their nested handles populated
      const handlesNeedFetching = parent.handles.some(handle => !handle.handles?.length)
      if (!handlesNeedFetching) return parent.handles

      // Fetch handles with their nested handles from the database
      const handleUris = parent.handles.map(handle => handle.uri)
      const fetchedHandles = await findMediaByUris(undefined, handleUris)

      // Create a map for quick lookup
      const handleMap = new Map(fetchedHandles.map(h => [h.uri, h]))

      // Return handles in original order, using fetched data when available
      return parent.handles.map(handle => handleMap.get(handle.uri) ?? handle)
    },
  }
} satisfies Resolvers
