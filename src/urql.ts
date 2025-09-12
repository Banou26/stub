import type { KeyingConfig } from '@urql/exchange-graphcache'
import type { Exchange } from 'urql'

import type {
  Episode, Media, MediaTrailer, PlaybackSource
} from './generated/schema/types.generated'

import { Client, fetchExchange, mapExchange } from 'urql'
import { devtoolsExchange } from '@urql/devtools'
import { cacheExchange } from '@urql/exchange-graphcache'

import { handleRequest } from './worker'
// @ts-expect-error
import introspection from './generated/graphql.schema.json'

export const keyResolvers = {
  Media: (media) => (media as Media)._id,
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
          console.error(error)
        }
      }
    }),
    devtoolsExchange,
    cache as Exchange,
    fetchExchange,
  ],
  fetchSubscriptions: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { body, headers } = await handleRequest(input, init)
    return new Response(body, { headers })
  }
})

export default client
