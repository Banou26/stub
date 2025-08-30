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
      subscribe: async function* (_parent, { input }, ctx: ExtractorServerContext) {
        const subscriptions =
          extractors.map(extractor =>
            extractor.client.subscription(
              ctx.params.query!,
              ctx.params.variables
            ).subscribe(() => {})
          )

        for await (const _ of listenIterator()) {
          if (ctx.request.signal.aborted) {
            subscriptions.forEach(subscription => subscription.unsubscribe())
            break
          }
          yield {
            mediaPage: {
              nodes: await findAggregatedMedia()
            }
          }
        }

        return yield {
          mediaPage: {
            nodes: await findAggregatedMedia()
          }
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
