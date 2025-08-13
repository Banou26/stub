import type { Resolvers } from '../../generated/schema/types.generated'

import prismaSchema from '../../../prisma/gql-schema'
import { resolvers as mediaResolvers, schema as mediaSchema } from './media'

export const schema = [prismaSchema, mediaSchema].join('\n\n')

export const resolvers = {
  ...mediaResolvers,
  Query: {
    ...mediaResolvers.Query,
  },
  Mutation: {
    ...mediaResolvers.Mutation,
  },
  Subscription: {
    ...mediaResolvers.Subscription,
  },
} satisfies Resolvers
