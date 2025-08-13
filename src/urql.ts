import type { KeyingConfig } from '@urql/exchange-graphcache'
import type { Exchange } from 'urql'

import type { Episode, Media, MediaTrailer, PlaybackSource } from './generated/graphql'

import { Client, fetchExchange } from 'urql'
import { devtoolsExchange } from '@urql/devtools'
import { cacheExchange } from '@urql/exchange-graphcache'

import { handleRequest } from './worker'
// @ts-expect-error
import introspection from './generated/graphql.schema.json'

export const keyResolvers = {
  Media: (media) => (media as Media).uid,
  Episode: (episode) => (episode as Episode).uid,
  PlaybackSource: (playbackSource) => (playbackSource as PlaybackSource).uid,
} satisfies KeyingConfig

const cache = cacheExchange({
  schema: introspection,
  keys: keyResolvers,
  resolvers: {

  }
})

const client = new Client({
  url: 'http://d/graphql',
  exchanges: [devtoolsExchange, cache as Exchange, fetchExchange],
  fetchSubscriptions: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { body, headers } = await handleRequest(input, init)
    return new Response(body, { headers })
  }
})

export default client
