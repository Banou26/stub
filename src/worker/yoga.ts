import type { YogaInitialContext } from 'graphql-yoga'

import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga, useExecutionCancellation } from 'graphql-yoga'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'

export type ServerContext = YogaInitialContext & {

}

export type UserContext = {

}

export const schema = createSchema<Omit<ServerContext, keyof YogaInitialContext>>({
  typeDefs,
  resolvers
})

export const yoga = createYoga<Omit<ServerContext, keyof YogaInitialContext>, UserContext>({
  schema,
  maskedErrors: false,
  plugins: [
    useDeferStream(),
    useExecutionCancellation()
  ]
})
