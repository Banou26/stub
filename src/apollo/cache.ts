import type { FieldFunctionOptions } from '@apollo/client'
import { InMemoryCache } from '@apollo/client'

export default new InMemoryCache({
  typePolicies: {
    Page: {
      keyFields: [],
    },
    Media: {
      keyFields: ['uri'],
      fields: {
        coverImage: {
          merge: (existing, incoming, { args, toReference }: FieldFunctionOptions<Record<string, any>, Record<string, any>>) =>
            [...existing ?? [], ...incoming ?? []]
        }
      }
    },
    Episode: {
      keyFields: ['uri']
    },
    PlaybackSource: {
      keyFields: ['uri']
    },
    Origin: {
      keyFields: ['id']
    },
    Query: {
      fields: {
        Page: {
          merge: (existing, incoming, { args, toReference }: FieldFunctionOptions<Record<string, any>, Record<string, any>>) =>
            incoming ?? existing
        }
      }
    }
  }
})
