import type { YogaInitialContext } from 'graphql-yoga'

import type { Media, Resolvers } from '../generated/schema/types.generated'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { Client, fetchExchange } from 'urql'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from '../extractor'
import { merge } from '../utils/merge'
import { fetch, filterNonNullable } from './utils'
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
                  return async ({ result }: { result: Media | Media[] }) => {
                    const resolveMedia = async (media: Media) => {
                      try {
                        if (!media.titles?.at(0)?.title) return
                        const upsertedMedia = await prismaClient.media.create({
                          data: {
                            ...media,
                            startDate: media.startDate ? new Date(media.startDate) : undefined,
                            endDate: media.endDate ? new Date(media.endDate) : undefined,
                            // startDate: media.startDate ? new Date(Temporal.PlainDateTime.from(media.startDate).toLocaleString()) : undefined,
                            // endDate: media.endDate ? new Date(Temporal.PlainDateTime.from(media.endDate).toLocaleString()) : undefined,
                            titles: {
                              connectOrCreate:
                                media.titles.map(mediaTitle => ({
                                  where: {
                                    id: {
                                      language: mediaTitle.language,
                                      title: mediaTitle.title
                                    }
                                  },
                                  create: {
                                    language: mediaTitle.language,
                                    title: mediaTitle.title
                                  }
                                }))
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
                        return upsertedMedia
                        console.log('upsertedMedia', upsertedMedia)
                      } catch (error) {
                        console.error('Error upserting media', error)
                      }
                    }
                    if (Array.isArray(result)) {
                      const sanitizedResult =
                        result
                          .map(media => ({
                            ...media,
                            titles: filterNonNullable(media.titles?.filter(mediaTitle => mediaTitle.language && mediaTitle.title) ?? []),
                            trailers: filterNonNullable(media.trailers?.filter(mediaTitle => mediaTitle.uri) ?? []),
                            shortDescriptions: filterNonNullable(media.shortDescriptions?.filter(mediaShortDescription => mediaShortDescription.language && mediaShortDescription.shortDescription) ?? []),
                            descriptions: filterNonNullable(media.descriptions?.filter(mediaDescription => mediaDescription.language && mediaDescription.description) ?? []),
                            covers: filterNonNullable(media.covers?.filter(mediaCovers => mediaCovers.language && mediaCovers.url) ?? []),
                            banners: filterNonNullable(media.banners?.filter(mediaBanners => mediaBanners.language && mediaBanners.url) ?? []),
                          }))
                      // const p = performance.now()
                      // await Promise.all(
                      //   sanitizedResult.map(resolveMedia)
                      // )
                      // console.log('time', performance.now() - p)
                      // return

                      try {
                        const p = performance.now()
                        const sanitizedMediaTitles = sanitizedResult.flatMap(media => media.titles)
                        const mediaTitles = await prismaClient.mediaTitle.createMany({ data: sanitizedMediaTitles })
                        const sanitizedMediaDescriptions = sanitizedResult.flatMap(media => media.descriptions)
                        const mediaDescriptions = await prismaClient.mediaDescription.createMany({ data: sanitizedMediaDescriptions })
                        const sanitizedMediaShortDescriptions = sanitizedResult.flatMap(media => media.shortDescriptions)
                        const mediaShortDescriptions = await prismaClient.mediaShortDescription.createMany({ data: sanitizedMediaShortDescriptions })
                        const sanitizedMediaTrailers = sanitizedResult.flatMap(media => media.trailers)
                        const mediaTrailers = await prismaClient.mediaTrailer.createMany({ data: sanitizedMediaTrailers })
                        const sanitizedMediaCovers = sanitizedResult.flatMap(media => media.covers)
                        const mediaCovers = await prismaClient.mediaCover.createMany({ data: sanitizedMediaCovers })
                        const sanitizedMediaBanners = sanitizedResult.flatMap(media => media.banners)
                        const mediaBanners = await prismaClient.mediaBanner.createMany({ data: sanitizedMediaBanners })
                        const medias = await prismaClient.media.createMany({
                          data: sanitizedResult.map(media => ({
                            ...media,
                            startDate: media.startDate ? new Date(media.startDate) : undefined,
                            endDate: media.endDate ? new Date(media.endDate) : undefined,
                            titles: undefined,
                            shortDescriptions: undefined,
                            descriptions: undefined,
                            handles: undefined,
                            handleOf: undefined,
                            trailers: undefined,
                            covers: undefined,
                            banners: undefined,
                            episodes: undefined
                          }))
                        })

                        console.log('time', performance.now() - p)
                        const connectP = performance.now()
                        const updateResults = await Promise.all(
                          sanitizedResult.map(media =>
                            prismaClient.media.update({
                              where: {
                                uri: media.uri
                              },
                              data: {
                                titles: {
                                  connect:
                                    media.titles.map(mediaTitle => ({
                                      id: {
                                        language: mediaTitle.language,
                                        title: mediaTitle.title
                                      }
                                    }))
                                },
                                shortDescriptions: {
                                  connect:
                                    media.shortDescriptions.map(mediaShortDescription => ({
                                      id: {
                                        language: mediaShortDescription.language,
                                        shortDescription: mediaShortDescription.shortDescription
                                      }
                                    }))
                                },
                                descriptions: {
                                  connect:
                                    media.descriptions.map(mediaDescription => ({
                                      id: {
                                        language: mediaDescription.language,
                                        description: mediaDescription.description
                                      }
                                    }))
                                },
                                covers: {
                                  connect:
                                    media.covers.map(mediaCover => ({
                                      id: {
                                        language: mediaCover.language,
                                        url: mediaCover.url
                                      }
                                    }))
                                },
                                banners: {
                                  connect:
                                    media.banners.map(mediaBanner => ({
                                      id: {
                                        language: mediaBanner.language,
                                        url: mediaBanner.url
                                      }
                                    }))
                                }
                              }
                            })
                          )
                        )
                        console.log('connectP time', performance.now() - connectP)
                        console.log('updateResults', updateResults)

                        console.log('time', performance.now() - p)

                        const mediaAfterConnect = await prismaClient.media.findMany({
                          include: {
                            titles: true
                          }
                        })

                        console.log('mediaAfterConnect', mediaAfterConnect)
                        // for (const media of result) {
                        //   await resolveMedia(media)
                        // }
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
