import type { ExtractorServerContext } from '../../extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findAggregatedMedia, findAggregatedMedias, normalizeGraphqlAggregatedEpisode } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'
import { mergeAsyncIterators, parseHTMLDescription, parseTextDescription } from '../utils'
import { MediaDescriptionContentType } from '../../../generated/graphql'
import database from '../../drizzle'
import { aggregatedMediaEpisodesTable, aggregatedEpisodeTable } from '../../drizzle/schema'
import { eq, asc } from 'drizzle-orm'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      resolve: (parent: Media) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.uri) return
        const subscriptions =
          extractors.map(extractor =>
            extractor.client.subscription(
              ctx.params.query!,
              ctx.params.variables
            ).subscribe(() => {})
          )

        yield findAggregatedMedia(undefined, { uri: args.input.uri })

        const mediaListener = listenIterator({ table: 'aggregatedMedia' })
        const episodeListener = listenIterator({ table: 'aggregatedMediaEpisodes' })

        const listeners = mergeAsyncIterators(mediaListener, episodeListener)

        // todo: we can optimize even better by looping on all updates until we find an aggregated media, and then listen for that only media
        try {
          for await (const _ of listeners) {
            yield await findAggregatedMedia(undefined, { uri: args.input.uri })
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          return yield findAggregatedMedia(undefined, { uri: args.input.uri })
        }
      }
    },
    mediaPage: {
      resolve: (parent: Media[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        const subscriptions =
          extractors.map(extractor =>
            extractor.client.subscription(
              ctx.params.query!,
              ctx.params.variables
            ).subscribe(() => {})
          )

        const mediaListener = listenIterator({ table: 'aggregatedMedia' })
        const episodeListener = listenIterator({ table: 'aggregatedMediaEpisodes' })

        const listeners = mergeAsyncIterators(mediaListener, episodeListener)

        try {
          for await (const _ of listeners) {
            yield findAggregatedMedias(undefined, { sorts: args.input.sorts ?? undefined })
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          return yield findAggregatedMedias(undefined, { sorts: args.input.sorts ?? undefined })
        }
      }
    }
  },
  Media: {
    _id: (parent) => parent._id,
    episodes: async (parent) => {
      if (parent.uri.startsWith('ag:')) {
        const episodes = await database
          .select()
          .from(aggregatedMediaEpisodesTable)
          .innerJoin(aggregatedEpisodeTable, eq(aggregatedMediaEpisodesTable.aggregatedEpisodeId, aggregatedEpisodeTable._id))
          .where(eq(aggregatedMediaEpisodesTable.aggregatedMediaId, parent._id))
          .orderBy(asc(aggregatedEpisodeTable.episodeNumber))
          .then(results =>
            results.map(({ aggregatedEpisode }) => normalizeGraphqlAggregatedEpisode(aggregatedEpisode))
          )

        return episodes?.length ? episodes : parent.episodes
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
  }
} satisfies Resolvers
