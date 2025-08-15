import { Media, Resolvers } from 'src/generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      subscribe: async function* (_parent, { input }, ctx) {
        console.log('query media', _parent, input, ctx)
        throw new Error('Not implemented')
      }
    }
  },
  Media: {
    uid: (parent) => parent.uid,
    origin: (parent) => parent.origin,
    language: (parent) => parent.language,
    id: (parent) => parent.id,
    url: (parent) => parent.url,
  }
} satisfies Resolvers
