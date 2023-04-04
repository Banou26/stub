import { ApolloClient, InMemoryCache } from '@apollo/client'

import cache from './cache'
import { link } from './server'

const client = new ApolloClient({
  cache,
  // @ts-expect-error
  link
})

export default client
