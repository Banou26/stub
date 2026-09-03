import type { KeyingConfig } from '@urql/exchange-graphcache'
import type { Exchange } from 'urql'

import type {
  Episode, Media, MediaTrailer, PlaybackSource
} from './generated/schema/types.generated'

import { Client, fetchExchange, mapExchange } from 'urql'
import { devtoolsExchange } from '@urql/devtools'
import { cacheExchange } from '@urql/exchange-graphcache'

import { handleRequest } from './worker'
import introspection from './generated/graphql.schema.json'

export const keyResolvers = {
  Media: (media) => (media as Media)._id,
  // An EDGE has no identity of its own: it is a relation between two rows, and the row it points at is
  // keyed by its own `_id`. Null tells graphcache to embed it in its parent rather than normalise it.
  // Omitting these compiles, because `satisfies KeyingConfig` does not force exhaustiveness, and shows
  // up only as a dev-console warning while the cache invents keys for unkeyable objects.
  MediaHandle: () => null,
  EpisodeHandle: () => null,
  MediaTitle: () => null,
  MediaDescription: () => null,
  MediaShortDescription: () => null,
  MediaCover: () => null,
  MediaBanner: () => null,
  MediaTrailer: (trailer) => (trailer as MediaTrailer).uri,
  Episode: (episode) => (episode as Episode)._id,
  EpisodeTitle: () => null,
  EpisodeDescription: () => null,
  EpisodeShortDescription: () => null,
  EpisodeThumbnail: () => null,
  PlaybackSource: (playbackSource) => (playbackSource as PlaybackSource).uri,
} satisfies KeyingConfig

const cache = cacheExchange({
  schema: introspection,
  keys: keyResolvers,
  resolvers: {

  }
})

const client = new Client({
  url: 'http://d/graphql',
  exchanges: [
    mapExchange({
      onError(combinedError, operation) {
        for (const error of combinedError.graphQLErrors) {
          console.error(
            new Error(
              error.message,
              {
                cause:
                  `GQL Error originated from ${
                    operation
                      .query
                      .definitions
                      .find(def => def.kind === 'OperationDefinition')
                      ?.name
                      ?.value
                  }`
              }
            )
          )
        }
      }
    }),
    devtoolsExchange,
    cache as Exchange,
    fetchExchange,
  ],
  fetchSubscriptions: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => handleRequest(input, init)
})

export default client
