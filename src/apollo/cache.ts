import { InMemoryCache } from '@apollo/client'

export default new InMemoryCache({
  typePolicies: {
    Media: {
      keyFields: ['uri']
    }
  }
})
