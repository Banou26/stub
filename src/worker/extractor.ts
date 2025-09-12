import type { YogaInitialContext } from 'graphql-yoga'

import type { Episode, Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga, useErrorHandler } from 'graphql-yoga'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { Client, fetchExchange } from 'urql'
import { getNamedType } from 'graphql'
import DataLoader from 'dataloader'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from './extractor/index'
import { merge } from '../utils/merge'
import { fetch } from './utils'
import database from './drizzle'
import {
  insertManyMedia,
  insertManyEpisode,
} from './drizzle/utils'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
}

export type ExtractorUserContext = {

}

const mediaInserter = new DataLoader<Media, Media>(async (medias) => {
  await database.transaction(async (tx) => {
    await insertManyMedia(tx, medias as Media[])
  })
  return medias
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

const episodeInserter = new DataLoader<Episode, Episode>(async (episodes) => {
  await database.transaction(async (tx) => {
    await insertManyEpisode(tx, episodes as Episode[])
  })
  return episodes
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

export const extractors =
  Object
    .entries(extractorDefinitions)
    .map(([name, extractor]) => {
      const server = createYoga<Omit<ExtractorServerContext, keyof YogaInitialContext>, ExtractorUserContext>({
        maskedErrors: false,
        schema: createSchema<Omit<ExtractorServerContext, keyof YogaInitialContext>>({
          typeDefs,
          resolvers:
            merge(
              {
                Media: {
                  _id: (parent) => parent.uri
                },
                Episode: {
                  _id: (parent) => parent.uri,
                },
                Query: {
                },
                Mutation: {
                },
                Subscription: {
                  media: { subscribe: async function* (_parent) { } },
                  mediaPage: { subscribe: async function* (_parent) { return [] } }
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
          useResponseCache({ session: () => null, ttl: 15 * 60 * 1000 }),
          useErrorHandler(({ errors, context }) => {
            for (const error of errors) {
              console.error(new Error(`GQLError occurred on request: ${context.operationName}`, { cause: error }))
            }
          }),
          {
            onPluginInit: ({ addPlugin }) => {
              addPlugin(useOnResolve(({ info }) =>
                async ({ result }) => {
                  if (getNamedType(info.returnType).name === 'Media') {
                    if (Array.isArray(result)) {
                      await mediaInserter.loadMany(result as Media[])
                    } else if (result) {
                      await mediaInserter.load(result as Media)
                    }
                  } else if (getNamedType(info.returnType).name === 'Episode') {
                    if (Array.isArray(result)) {
                      await episodeInserter.loadMany(result as Episode[])
                    } else if (result) {
                      await episodeInserter.load(result as Episode)
                    }
                  }
                }
              ))
            }
          }
        ]
      })

      const client = new Client({
        url: 'http://d/graphql',
        exchanges: [fetchExchange],
        fetchSubscriptions: true,
        fetch: async (input: Parameters<typeof globalThis.fetch>[0], init: Parameters<typeof globalThis.fetch>[1]) =>
          server.handleRequest(
            new Request(input, init),
            { fetch }
          )
      })

      return {
        name: extractor.name,
        server,
        client,
        extractor
      }
    })
