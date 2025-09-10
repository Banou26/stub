import type { YogaInitialContext } from 'graphql-yoga'

import type { Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga, useErrorHandler } from 'graphql-yoga'
import { Client, fetchExchange } from 'urql'
import { getNamedType } from 'graphql'

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
} from './drizzle/utils'
import groupAllRelatedMedia from './drizzle/sql/groupAllRelatedMedia'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
}

export type ExtractorUserContext = {

}

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
                async ({ result: _result }) => {
                  if (getNamedType(info.returnType).name === 'Media') {
                    const result = Array.isArray(_result) ? _result : [_result] as Media[]
                    await database.transaction(async (tx) => {
                      await insertManyMedia(tx, result)
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
                  } else if (getNamedType(info.returnType).name === 'Episode') {
                    await database.transaction(async (tx) => {
                    })
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
