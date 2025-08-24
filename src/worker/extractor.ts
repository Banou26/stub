import type { YogaInitialContext } from 'graphql-yoga'

import type { Media, Resolvers } from '../generated/schema/types.generated'
import { CreateMediaBanner, CreateMediaCover, CreateMediaDescription, CreateMediaShortDescription, CreateMediaTitle, CreateMediaTrailer, mediaBannerTable, mediaCoverTable, mediaDescriptionTable, mediaShortDescriptionTable, mediaTable, mediaTitleTable, mediaTrailerTable, type CreateMedia } from './drizzle/schema'

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
                        await database.transaction(async (tx) => {
                          const values = result.map(media => ({
                            ...media,
                            startDate: media.startDate ? new Date(media.startDate) : null,
                            endDate: media.endDate ? new Date(media.endDate) : null
                          } satisfies CreateMedia))

                          if (values.length) {
                            await tx.insert(mediaTable)
                                .values(values)
                                .onConflictDoUpdate({
                                  target: mediaTable.uri,
                                  set: {
                                    type: sql`excluded.type`,
                                    status: sql`excluded.status`,
                                    startDate: sql`excluded.startDate`,
                                    endDate: sql`excluded.endDate`,
                                    averageScore: sql`excluded.averageScore`,
                                    episodeCount: sql`excluded.episodeCount`,
                                    aggregated: sql`excluded.aggregated`,
                                    isAdult: sql`excluded.isAdult`,
                                    popularity: sql`excluded.popularity`
                                  }
                                })
                          }

                          const mediaTitles =
                            result
                              .flatMap(media =>
                                media.titles?.map(title => ({
                                  mediaUri: media.uri,
                                  language: title.language,
                                  title: title.title
                                }) satisfies CreateMediaTitle)
                              )
                              .filter((title): title is NonNullable<typeof title> => title !== null && title !== undefined)
                              .filter(title => title.title?.length > 0)

                          if (mediaTitles.length) {
                            await tx.insert(mediaTitleTable)
                              .values(mediaTitles)
                              .onConflictDoNothing()
                          }

                          const mediaDescriptions =
                            result
                              .flatMap(media =>
                                media.descriptions?.map(mediaDescription => ({
                                  mediaUri: media.uri,
                                  language: mediaDescription.language,
                                  description: mediaDescription.description
                                }) satisfies CreateMediaDescription)
                              )
                              .filter((mediaDescription): mediaDescription is NonNullable<typeof mediaDescription> => mediaDescription !== null && mediaDescription !== undefined)
                              .filter(mediaDescription => mediaDescription.description?.length > 0)

                          if (mediaDescriptions.length) {
                            await tx.insert(mediaDescriptionTable)
                              .values(mediaDescriptions)
                              .onConflictDoNothing()
                          }

                          const mediaShortDescriptions =
                            result
                              .flatMap(media =>
                                media.shortDescriptions?.map(mediaShortDescription => ({
                                  mediaUri: media.uri,
                                  language: mediaShortDescription.language,
                                  shortDescription: mediaShortDescription.shortDescription
                                }) satisfies CreateMediaShortDescription)
                              )
                              .filter((mediaShortDescription): mediaShortDescription is NonNullable<typeof mediaShortDescription> => mediaShortDescription !== null && mediaShortDescription !== undefined)
                              .filter(mediaShortDescription => mediaShortDescription.shortDescription?.length > 0)

                          if (mediaShortDescriptions.length) {
                            await tx.insert(mediaShortDescriptionTable)
                              .values(mediaShortDescriptions)
                              .onConflictDoNothing()
                          }

                          const mediaTrailers =
                            result
                              .flatMap(media =>
                                media.trailers?.map(mediaTrailer => ({
                                  mediaUri: media.uri,
                                  uri: mediaTrailer.uri,
                                  origin: mediaTrailer.origin,
                                  id: mediaTrailer.id,
                                  url: mediaTrailer.url,
                                  language: mediaTrailer.language,
                                  thumbnail: mediaTrailer.thumbnail,
                                }) satisfies CreateMediaTrailer)
                              )
                              .filter((mediaTrailer): mediaTrailer is NonNullable<typeof mediaTrailer> => mediaTrailer !== null && mediaTrailer !== undefined)

                          if (mediaTrailers.length) {
                            await tx.insert(mediaTrailerTable)
                              .values(mediaTrailers)
                              .onConflictDoNothing()
                          }

                          const mediaCovers =
                            result
                              .flatMap(media =>
                                media.trailers?.map(mediaCover => ({
                                  mediaUri: media.uri,
                                  language: mediaCover.language,
                                  url: mediaCover.url!
                                }) satisfies CreateMediaCover)
                              )
                              .filter((mediaCover): mediaCover is NonNullable<typeof mediaCover> => mediaCover !== null && mediaCover !== undefined)
                              .filter(mediaCover => mediaCover.url !== null)

                          if (mediaCovers.length) {
                            await tx.insert(mediaCoverTable)
                              .values(mediaCovers)
                              .onConflictDoNothing()
                          }

                          const mediaBanners =
                            result
                              .flatMap(media =>
                                media.banners?.map(mediaBanner => ({
                                  mediaUri: media.uri,
                                  language: mediaBanner.language,
                                  url: mediaBanner.url!
                                }) satisfies CreateMediaBanner)
                              )
                              .filter((mediaBanner): mediaBanner is NonNullable<typeof mediaBanner> => mediaBanner !== null && mediaBanner !== undefined)
                              .filter(mediaBanner => mediaBanner.url !== null)

                          if (mediaBanners.length) {
                            await tx.insert(mediaBannerTable)
                              .values(mediaBanners)
                              .onConflictDoNothing()
                          }

                          const results = await tx.query.mediaTable.findMany({
                            with: {
                              titles: true,
                              descriptions: true,
                              shortDescriptions: true,
                              trailers: true,
                              covers: true,
                              banners: true
                            }
                          })
                          console.log('results', results)
                        })

                        // const sanitizedResult = result.flatMap(unwrapHandles)
                        // await prismaClient.media.bulkCreateWithRelatedEntities(result)
                        // await prismaClient.mediaTitle.bulkRelationUpdate(sanitizedResult)
                        // await prismaClient.mediaBanner.bulkRelationUpdate(sanitizedResult)
                        // await prismaClient.mediaCover.bulkRelationUpdate(sanitizedResult)
                        // await prismaClient.mediaDescription.bulkRelationUpdate(sanitizedResult)
                        // await prismaClient.mediaShortDescription.bulkRelationUpdate(sanitizedResult)
                        // const groupMedia = await prismaClient.$queryRawTyped(groupAllRelatedMedia())
                        // console.log('groupMedia', groupMedia)
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
