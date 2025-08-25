import type { YogaInitialContext } from 'graphql-yoga'

import type { Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { Client, fetchExchange } from 'urql'
import { getNamedType } from 'graphql'
import { sql } from 'drizzle-orm'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from '../extractor'
import { merge } from '../utils/merge'
import { fetch } from './utils'
import database from './drizzle'
import { insertManyMedia, findAllMedia, aggregateMediaHandles, cleanupDuplicateAggregatedMedia, findAggregatedMedia } from './drizzle/utils'
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
                  // media: { subscribe: async function*() {} },
                  // mediaPage: { subscribe: async function*() {} },
                  // episode: { subscribe: async function*() {} },
                  // episodePage: { subscribe: async function*() {} },
                  // playbackSource: { subscribe: async function*() {} },
                  // playbackSourcePage: { subscribe: async function*() {} },
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
          {
            onPluginInit: ({ addPlugin }) => {
              addPlugin(useOnResolve(({ info }) => {
                if (getNamedType(info.returnType).name === 'Media') {
                  return async ({ result }: { result: Media | Media[] }) => {
                    if (Array.isArray(result)) {
                      try {
                        await database.transaction((tx) => insertManyMedia(tx, result))
                        const insertedMedia = await findAllMedia()
                        const groups = await database.all(groupAllRelatedMedia) as [string, number, string][]
                        const aggregatedMedia = groups.map(([_, __, urisString]) => {
                          const uris = urisString.split(',').map(uri => uri.trim())
                          const medias =
                            uris
                              .map(uri => insertedMedia.find(r => r?.uri === uri))
                              .filter((media): media is NonNullable<typeof media> => media !== null && media !== undefined)
                          return aggregateMediaHandles(medias)
                        })
                        await database.transaction((tx) => insertManyMedia(tx, aggregatedMedia))
                        await cleanupDuplicateAggregatedMedia()
                        const finalResults = await findAggregatedMedia()
                        console.log('finalResults', finalResults)
                      } catch (err) {
                        console.error(err)
                        throw err
                      }
                    } else {
                      // await resolveMedia(result as Media)
                    }
                  }
                }
              }))
            },
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
