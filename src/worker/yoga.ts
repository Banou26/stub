import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga } from 'graphql-yoga'

import { typeDefs } from '../generated/schema/typeDefs.generated'

export type ServerContext = {

}

const schema = createSchema<ServerContext>({
  typeDefs,
  resolvers: {

  }
})

const yoga = createYoga<ServerContext>({
  schema,
  maskedErrors: false,
  plugins: [useDeferStream()]
})

console.log('yoga', yoga)
