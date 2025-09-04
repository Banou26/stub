import type { Resolvers } from '../../generated/schema/types.generated'

// @ts-expect-error
import baseSchema from '../schema.gql?raw'
import { resolvers as mediaResolvers, schema as mediaSchema } from './media'
import { resolvers as episodeResolvers, schema as episodeSchema } from './episode'
import { resolvers as playbackSourceResolvers, schema as playbackSourceSchema } from './playback-source'

export const schema = [baseSchema, episodeSchema, playbackSourceSchema, mediaSchema].join('\n\n')

export const resolvers = {
  ...mediaResolvers,
  ...episodeResolvers,
  ...playbackSourceResolvers,
  Query: {
    ...mediaResolvers.Query,
    ...episodeResolvers.Query,
    ...playbackSourceResolvers.Query,
  },
  Mutation: {
    ...mediaResolvers.Mutation,
    ...episodeResolvers.Mutation,
    ...playbackSourceResolvers.Mutation,
  },
  Subscription: {
    ...mediaResolvers.Subscription,
    ...episodeResolvers.Subscription,
    ...playbackSourceResolvers.Subscription,
  },
} satisfies Resolvers
