import { Resolvers } from 'src/generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {},
  Media: {
    uid: (parent) => parent.uid,
    origin: (parent) => parent.origin,
    language: (parent) => parent.language,
    id: (parent) => parent.id,
    url: (parent) => parent.url,
  }
} satisfies Resolvers
