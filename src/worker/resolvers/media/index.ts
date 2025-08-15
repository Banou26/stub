import type { ExtractorServerContext } from '../../../worker/extractor'
import type { Media, Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../../worker/extractor'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    mediaPage: {
      subscribe: async function* (_parent, { input }, ctx: ExtractorServerContext) {
        const responses = await Promise.all(
          extractors.map(extractor =>
            extractor.client.subscription(ctx.params.query!, ctx.params.variables)
          )
        )
        return yield {
          mediaPage: {
            nodes: responses.flatMap(response => response.data.mediaPage.nodes)
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
