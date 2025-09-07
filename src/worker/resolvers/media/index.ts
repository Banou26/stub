import type { ExtractorServerContext } from '../../extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findAggregatedMedia, findAggregatedMedias } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'
import { ellipseText, parseTextDescription } from './utils'

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

        const aggregatedMedia = await findAggregatedMedia(undefined, { uri: args.input.uri })
        yield aggregatedMedia

        // todo: we can optimize even better by looping on all updates until we find an aggregated media, and then listen for that only media
        try {
          for await (const _ of listenIterator(aggregatedMedia ? { table: 'media', columnId: '_id', ids: [aggregatedMedia._id] } : undefined)) {
            yield findAggregatedMedia(undefined, { uri: args.input.uri })
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
    uri: (parent) => parent.uri,
    origin: (parent) => parent.origin,
    id: (parent) => parent.id,
    url: (parent) => parent.url,
    _id: (parent) => parent._id,
  },
  MediaShortDescription: {
    shortDescription: (parent) => {
      const parsedText = parseTextDescription(parent.shortDescription)
      const ellipsedText = ellipseText(parsedText, 225)
      return ellipsedText
    }
  }
} satisfies Resolvers
