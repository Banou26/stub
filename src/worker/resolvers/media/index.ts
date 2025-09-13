import type { ExtractorServerContext } from '../../extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findAggregatedMedia, findAggregatedMedias } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'
import { mergeAsyncIterators, parseHTMLDescription, parseTextDescription } from './utils'
import { MediaDescriptionContentType } from '../../../generated/graphql'
import database from '../../drizzle'
import { sql } from 'drizzle-orm'

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

        console.log('BEFORE aggregatedMedia', args.input.uri)
        const aggregatedMedia = await findAggregatedMedia(undefined, { uri: args.input.uri })
        console.log('aggregatedMedia', aggregatedMedia)
        yield aggregatedMedia

        const mediaListener = listenIterator(aggregatedMedia ? { table: 'media', columnId: '_id', ids: [aggregatedMedia._id] } : undefined)
        const episodeListener = listenIterator(aggregatedMedia ? { table: 'aggregatedEpisode', columnId: 'mediaUri' } : undefined)

        const listeners = mergeAsyncIterators(mediaListener, episodeListener)

        // todo: we can optimize even better by looping on all updates until we find an aggregated media, and then listen for that only media
        try {
          for await (const _ of listeners) {
            console.log('changes', _)
            const aggregatedMedia = await findAggregatedMedia(undefined, { uri: args.input.uri })
            console.log('aggregatedMedia', aggregatedMedia)
            yield aggregatedMedia
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

        try {
          for await (const _ of listenIterator()) {
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
    episodes: (parent) => parent.episodes ?? [],
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

      return shortDescriptions
    },
  }
} satisfies Resolvers
