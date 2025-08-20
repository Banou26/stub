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
              addPlugin(useOnResolve(({ info }) => {
                if (getNamedType(info.returnType).name === 'Media') {
                  return async ({ result }: { result: Media | Media[] }) => {
                    if (Array.isArray(result)) {
                      const makeMediaNonNullable = (media: Media) => ({
                        ...media,
                        titles: filterNonNullable(media.titles?.filter(mediaTitle => mediaTitle.language && mediaTitle.title) ?? []),
                        trailers: filterNonNullable(media.trailers?.filter(mediaTitle => mediaTitle.uri) ?? []),
                        shortDescriptions: filterNonNullable(media.shortDescriptions?.filter(mediaShortDescription => mediaShortDescription.language && mediaShortDescription.shortDescription) ?? []),
                        descriptions: filterNonNullable(media.descriptions?.filter(mediaDescription => mediaDescription.language && mediaDescription.description) ?? []),
                        covers: filterNonNullable(media.covers?.filter(mediaCovers => mediaCovers.language && mediaCovers.url) ?? []),
                        banners: filterNonNullable(media.banners?.filter(mediaBanners => mediaBanners.language && mediaBanners.url) ?? []),
                      })
                      const unwrapHandles = (media: Media): ReturnType<typeof makeMediaNonNullable>[] => [
                        makeMediaNonNullable(media),
                        ...media.handles?.flatMap(media => unwrapHandles(media)) ?? []
                      ]
                      const sanitizedResult = result.flatMap(unwrapHandles)

                      try {
                        await prismaClient.mediaTitle.createMany({ data: sanitizedResult.flatMap(media => media.titles) })
                        await prismaClient.mediaDescription.createMany({ data: sanitizedResult.flatMap(media => media.descriptions) })
                        await prismaClient.mediaShortDescription.createMany({ data: sanitizedResult.flatMap(media => media.shortDescriptions) })
                        await prismaClient.mediaTrailer.createMany({ data: sanitizedResult.flatMap(media => media.trailers) })
                        await prismaClient.mediaCover.createMany({ data: sanitizedResult.flatMap(media => media.covers) })
                        await prismaClient.mediaBanner.createMany({ data: sanitizedResult.flatMap(media => media.banners) })
                        await prismaClient.media.createMany({
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

                        // Update relations using raw SQL
                        // Collect ALL updates across all media items
                        const esc = (str: string) => str.replace(/'/g, "''")

                        const allTitleUpdates =
                          sanitizedResult.flatMap(media =>
                            media.titles.map(title => ({
                              mediaUri: media.uri,
                              language: title.language,
                              title: title.title
                            }))
                          )
                        if (allTitleUpdates.length) {
                          await prismaClient.$executeRawUnsafe(`
                            UPDATE mediaTitle
                            SET mediaUri = CASE
                              ${allTitleUpdates.map(u =>
                                `WHEN language = '${esc(u.language)}' AND title = '${esc(u.title)}' THEN '${esc(u.mediaUri)}'`
                              ).join(' ')}
                              ELSE mediaUri
                            END
                            WHERE mediaUri IS NULL
                              AND (${allTitleUpdates.map(u =>
                                `(language = '${esc(u.language)}' AND title = '${esc(u.title)}')`
                              ).join(' OR ')})
                          `)
                        }

                        const allShortDescUpdates =
                          sanitizedResult.flatMap(media =>
                            media.shortDescriptions.map(desc => ({
                              mediaUri: media.uri,
                              language: desc.language,
                              shortDescription: desc.shortDescription
                            }))
                          )
                        if (allShortDescUpdates.length) {
                          await prismaClient.$executeRawUnsafe(`
                            UPDATE mediaShortDescription
                            SET mediaUri = CASE
                              ${allShortDescUpdates.map(u =>
                                `WHEN language = '${esc(u.language)}' AND shortDescription = '${esc(u.shortDescription)}' THEN '${esc(u.mediaUri)}'`
                              ).join(' ')}
                              ELSE mediaUri
                            END
                            WHERE mediaUri IS NULL
                              AND (${allShortDescUpdates.map(u =>
                                `(language = '${esc(u.language)}' AND shortDescription = '${esc(u.shortDescription)}')`
                              ).join(' OR ')})
                          `)
                        }

                        const allDescUpdates =
                          sanitizedResult.flatMap(media =>
                            media.descriptions.map(desc => ({
                              mediaUri: media.uri,
                              language: desc.language,
                              description: desc.description
                            }))
                          )
                        if (allDescUpdates.length) {
                          await prismaClient.$executeRawUnsafe(`
                            UPDATE mediaDescription
                            SET mediaUri = CASE
                              ${allDescUpdates.map(u =>
                                `WHEN language = '${esc(u.language)}' AND description = '${esc(u.description)}' THEN '${esc(u.mediaUri)}'`
                              ).join(' ')}
                              ELSE mediaUri
                            END
                            WHERE mediaUri IS NULL
                              AND (${allDescUpdates.map(u =>
                                `(language = '${esc(u.language)}' AND description = '${esc(u.description)}')`
                              ).join(' OR ')})
                          `)
                        }

                        const allCoverUpdates =
                          sanitizedResult.flatMap(media =>
                            media.covers.map(cover => ({
                              mediaUri: media.uri,
                              language: cover.language,
                              url: cover.url
                            }))
                          )
                        if (allCoverUpdates.length) {
                          await prismaClient.$executeRawUnsafe(`
                            UPDATE mediaCover
                            SET mediaUri = CASE
                              ${allCoverUpdates.map(u =>
                                `WHEN language = '${esc(u.language)}' AND url = '${esc(u.url)}' THEN '${esc(u.mediaUri)}'`
                              ).join(' ')}
                              ELSE mediaUri
                            END
                            WHERE mediaUri IS NULL
                              AND (${allCoverUpdates.map(u =>
                                `(language = '${esc(u.language)}' AND url = '${esc(u.url)}')`
                              ).join(' OR ')})
                          `)
                        }

                        const allBannerUpdates =
                          sanitizedResult.flatMap(media =>
                            media.banners.map(banner => ({
                              mediaUri: media.uri,
                              language: banner.language,
                              url: banner.url
                            }))
                          )
                        if (allBannerUpdates.length) {
                          await prismaClient.$executeRawUnsafe(`
                            UPDATE mediaBanner
                            SET mediaUri = CASE
                              ${allBannerUpdates.map(u =>
                                `WHEN language = '${esc(u.language)}' AND url = '${esc(u.url)}' THEN '${esc(u.mediaUri)}'`
                              ).join(' ')}
                              ELSE mediaUri
                            END
                            WHERE mediaUri IS NULL
                              AND (${allBannerUpdates.map(u =>
                                `(language = '${esc(u.language)}' AND url = '${esc(u.url)}')`
                              ).join(' OR ')})
                          `)
                        }

                        await prismaClient.media.findMany({
                          include: {
                            titles: true
                          }
                        })
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
