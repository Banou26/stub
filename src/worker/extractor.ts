import type { Resolvers } from '../generated/schema/types.generated'

import { createSchema, createYoga } from 'graphql-yoga'
import { Client, fetchExchange } from 'urql'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractors from '../extractor'
import { merge } from '../utils/merge'
import { fetch } from '../utils/fetch'

export type ExtractorServerContext = {
  fetch: typeof fetch
  client: Client
}

export type ExtractorUserContext = {

}

const clients =
  Object
    .entries(extractors)
    .map(([name, extractor]) => {
      const server = createYoga<ExtractorServerContext, ExtractorUserContext>({
        maskedErrors: false,
        schema: createSchema<ExtractorServerContext>({
          typeDefs,
          resolvers:
            merge(
              {
                Media: {
                  // episodes: (parent) => parent.episodes ?? []
                },
                Query: {
                },
                Mutation: {
                },
                Subscription: {
                  media: { subscribe: async function*() {} },
                  // mediaPage: { subscribe: async function*() {} },
                  // episode: { subscribe: async function*() {} },
                  // episodePage: { subscribe: async function*() {} },
                  // playbackSource: { subscribe: async function*() {} },
                  // playbackSourcePage: { subscribe: async function*() {} },
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        })
      })

      const client = new Client({
        url: 'http://d/graphql',
        exchanges: [fetchExchange],
        fetchSubscriptions: true,
        fetch: async (input: RequestInfo | URL, init?: RequestInit | undefined) =>
          server.handleRequest(
            new Request(input, init),
            { fetch, client }
          )
      })

      return {
        name: extractor.name,
        server,
        client,
        extractor
      }
    })

export default clients
