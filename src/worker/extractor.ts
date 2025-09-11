import type { YogaInitialContext } from 'graphql-yoga'

import type { Episode, Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga, useErrorHandler } from 'graphql-yoga'
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
  findAllMedia,
  aggregateMediaHandles,
  cleanupDuplicateAggregatedMedia,
  insertManyEpisode,
} from './drizzle/utils'
import groupAllRelatedMedia from './drizzle/sql/groupAllRelatedMedia'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
}

export type ExtractorUserContext = {

}

const mediaInserter = new DataLoader<Media, Media>(async (medias) => {
  await database.transaction(async (tx) => {
    await insertManyMedia(tx, medias as Media[])
    const allMedias = await findAllMedia(tx)
    const existingAggregated = allMedias.filter(media => media.aggregated)

    const groups = await tx.all(groupAllRelatedMedia) as [string, number, string][]
    const aggregatedMedia = groups.map(([_, __, urisString]) => {
      const uris = urisString.split(',').map(uri => uri.trim())
      const medias =
        uris
          .map(uri => allMedias.find(r => r?.uri === uri))
          .filter((media): media is NonNullable<typeof media> => media !== null && media !== undefined)

      const existingMatch = existingAggregated.find(existing => {
        const existingUris = existing.uri.slice('ag:('.length, -1).split(',')
        return existingUris.some(existingUri => uris.includes(existingUri))
      })

      return aggregateMediaHandles(medias, existingMatch)
    })
    await insertManyMedia(tx, aggregatedMedia)
    await cleanupDuplicateAggregatedMedia(tx)
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
                  // episodes: (parent) => parent.episodes ?? []
                },
                Query: {
                },
                Mutation: {
                },
                Subscription: {
                  mediaPage: { subscribe: async function* (_parent) { return [] } }
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
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
                    } else {
                      await mediaInserter.load(result as Media)
                    }
                  } else if (getNamedType(info.returnType).name === 'Episode') {
                    if (Array.isArray(result)) {
                      await episodeInserter.loadMany(result as Episode[])
                    } else {
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
