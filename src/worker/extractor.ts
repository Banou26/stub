import type { YogaInitialContext } from 'graphql-yoga'

import type { Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { Client, fetchExchange } from 'urql'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from '../extractor'
import { merge } from '../utils/merge'
import { fetch } from './utils'
import { getNamedType } from 'graphql'
import prismaClient from './prisma'
import { MediaCreateInput } from './prisma/generated/models'

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
              addPlugin(useOnResolve(({ args, context, info }) => {
                if (getNamedType(info.returnType).name === 'Media') {
                  return async ({ result }) => {
                    const resolveMedia = async (media: Media) => {
                      console.log('media', media)
                      try {
                        const upsertedMedia = await prismaClient.media.create({
                          data: {
                            ...media,
                            startDate: media.startDate ? new Date(Temporal.PlainDateTime.from(media.startDate).toLocaleString()) : undefined,
                            endDate: media.endDate ? new Date(Temporal.PlainDateTime.from(media.endDate).toLocaleString()) : undefined,
                            titles: {
                              connectOrCreate: {
                                where: {
                                  id: {
                                    language: media.titles?.at(0)?.language!,
                                    title: media.titles?.at(0)?.title!
                                  }
                                },
                                create: {
                                  language: media.titles?.at(0)?.language!,
                                  title: media.titles?.at(0)?.title!
                                }
                              }
                            },
                            shortDescriptions: undefined,
                            descriptions: undefined,
                            handles: undefined,
                            handleOf: undefined,
                            trailers: undefined,
                            covers: undefined,
                            banners: undefined,
                            episodes: undefined
                          },
                          include: {
                            titles: true,
                            episodes: true,
                            handles: true,
                          }
                        })
                        console.log('upsertedMedia', upsertedMedia)
                      } catch (error) {
                        console.error('Error upserting media', error)
                      }
                    }
                    if (Array.isArray(result)) {
                      // Process sequentially to avoid memory issues with wa-sqlite
                      for (const media of result.slice(0, 2)) {
                        await resolveMedia(media)
                        await new Promise(resolve => setTimeout(resolve, 1000))
                      }
                    } else {
                      await resolveMedia(result as Media)
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
