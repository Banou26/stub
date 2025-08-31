import type { ExtractorServerContext } from '../../extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findAggregatedMedia } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    mediaPage: {
      resolve: (parent: Media[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, _, ctx: ExtractorServerContext) {
        const subscriptions =
          extractors.map(extractor =>
            extractor.client.subscription(
              ctx.params.query!,
              ctx.params.variables
            ).subscribe(() => {})
          )

        try {
          for await (const _ of listenIterator()) {
            yield findAggregatedMedia()
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          return yield findAggregatedMedia()
        }
      }
    }
  },
  Media: {
    uri: (parent) => parent.uri,
    origin: (parent) => parent.origin,
    id: (parent) => parent.id,
    url: (parent) => parent.url,
  }
} satisfies Resolvers
