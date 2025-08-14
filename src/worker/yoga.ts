import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga } from 'graphql-yoga'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'

export type ServerContext = {

}

export type UserContext = {

}

const schema = createSchema<ServerContext>({
  typeDefs,
  resolvers
})

const yoga = createYoga<ServerContext, UserContext>({
  schema,
  maskedErrors: false,
  plugins: [useDeferStream()]
})

export default yoga
