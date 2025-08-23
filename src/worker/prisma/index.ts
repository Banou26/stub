import type { Media } from 'src/generated/schema/types.generated'

import { PrismaWASqliteAdapterFactory } from './wa-sqlite-adapter'
// @ts-expect-error
import SQLSchema from '../../../prisma/migrations/0_init/migration.sql?raw'
import { Prisma, PrismaClient } from './generated/client'
import { unwrapHandles } from './utils'
import { inferColumnType } from './conversion'

const esc = (str: string) => str.replace(/'/g, "''")

const adapter = new PrismaWASqliteAdapterFactory()
const prismaClient =
  new PrismaClient({
    adapter,
    omit: {
      mediaTitle: {
        mediaUri: true
      },
      mediaShortDescription: {
        mediaUri: true
      },
      mediaDescription: {
        mediaUri: true
      },
      mediaTrailer: {
        mediaUri: true
      },
      mediaCover: {
        mediaUri: true
      },
      mediaBanner: {
        mediaUri: true
      },
      episode: {
        mediaUri: true
      },
      episodeTitle: {
        episodeUri: true
      },
      episodeShortDescription: {
        episodeUri: true
      },
      episodeDescription: {
        episodeUri: true
      },
      episodeThumbnail: {
        episodeUri: true
      },
      playbackSource: {
        episodeUri: true
      }
    } as const
  })
    .$extends({
      model: {
        mediaTitle: {
          async bulkRelationUpdate<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const allTitleUpdates =
              sanitizedResult.flatMap(media =>
                media.titles.map(title => ({
                  mediaUri: media.uri,
                  language: title.language,
                  title: title.title
                }))
              )
            if (allTitleUpdates.length) {
              await (context.$parent as typeof prismaClient).$executeRawUnsafe(`
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
            return true
          }
        },
        mediaBanner: {
          async bulkRelationUpdate<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const allBannerUpdates =
              sanitizedResult.flatMap(media =>
                media.banners.map(banner => ({
                  mediaUri: media.uri,
                  language: banner.language,
                  url: banner.url
                }))
              )
            if (allBannerUpdates.length) {
              await (context.$parent as typeof prismaClient).$executeRawUnsafe(`
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
            return true
          }
        },
        mediaCover: {
          async bulkRelationUpdate<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const allCoverUpdates =
              sanitizedResult.flatMap(media =>
                media.covers.map(cover => ({
                  mediaUri: media.uri,
                  language: cover.language,
                  url: cover.url
                }))
              )
            if (allCoverUpdates.length) {
              await (context.$parent as typeof prismaClient).$executeRawUnsafe(`
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
            return true
          }
        },
        mediaDescription: {
          async bulkRelationUpdate<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const allDescUpdates =
              sanitizedResult.flatMap(media =>
                media.descriptions.map(desc => ({
                  mediaUri: media.uri,
                  language: desc.language,
                  description: desc.description
                }))
              )
            if (allDescUpdates.length) {
              await (context.$parent as typeof prismaClient).$executeRawUnsafe(`
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
            return true
          }
        },
        mediaShortDescription: {
          async bulkRelationUpdate<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const allShortDescUpdates =
              sanitizedResult.flatMap(media =>
                media.shortDescriptions.map(desc => ({
                  mediaUri: media.uri,
                  language: desc.language,
                  shortDescription: desc.shortDescription
                }))
              )
            if (allShortDescUpdates.length) {
              await (context.$parent as typeof prismaClient).$executeRawUnsafe(`
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
            return true
          }
        },
        media: {
          async bulkCreateWithRelatedEntities<T>(this: T, medias: Media[]) {
            const context = Prisma.getExtensionContext(this)
            const sanitizedResult = medias.flatMap(unwrapHandles)
            const client = (context.$parent as typeof prismaClient)
            // await client.mediaTitle.createMany({ data: sanitizedResult.flatMap(media => media.titles) })
            // await client.mediaDescription.createMany({ data: sanitizedResult.flatMap(media => media.descriptions) })
            // await client.mediaShortDescription.createMany({ data: sanitizedResult.flatMap(media => media.shortDescriptions) })
            // await client.mediaTrailer.createMany({ data: sanitizedResult.flatMap(media => media.trailers) })
            // await client.mediaCover.createMany({ data: sanitizedResult.flatMap(media => media.covers) })
            // await client.mediaBanner.createMany({ data: sanitizedResult.flatMap(media => media.banners) })


            const mediaItems = sanitizedResult.map(media => ({
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

            const values =
              mediaItems.flatMap((item) =>
                [
                  item.uri,
                  item.origin,
                  item.id,
                  item.url,
                  item.aggregated,
                  item.type,
                  item.status,
                  item.averageScore,
                  item.popularity,
                  item.isAdult,
                  item.episodeCount
                ]
              )
            // inferColumnType
            // await adapter.performIO({
            //   sql: `INSERT INTO media (uri, origin, id, url, aggregated, type, status, averageScore, popularity, isAdult, episodeCount)
            //     VALUES ${mediaItems.map(() =>`(${Array(11).fill(undefined).map(() => '?').join(',')})`)}
            //     ON CONFLICT(uri) DO UPDATE SET
            //       url = excluded.url,
            //       aggregated = excluded.aggregated,
            //       type = excluded.type,
            //       status = excluded.status,
            //       averageScore = excluded.averageScore,
            //       popularity = excluded.popularity,
            //       isAdult = excluded.isAdult,
            //       episodeCount = excluded.episodeCount`,
            //   argTypes: values.map(value => inferColumnType(value ?? null)),
            //   args: values
            // })

            await client.$executeRawUnsafe(
              `INSERT INTO media (uri, origin, id, url, aggregated, type, status, averageScore, popularity, isAdult, episodeCount)
                VALUES ${mediaItems.map(() =>`(${Array(11).fill(undefined).map(() => '?').join(',')})`)}
                ON CONFLICT(uri) DO UPDATE SET
                  url = excluded.url,
                  aggregated = excluded.aggregated,
                  type = excluded.type,
                  status = excluded.status,
                  averageScore = excluded.averageScore,
                  popularity = excluded.popularity,
                  isAdult = excluded.isAdult,
                  episodeCount = excluded.episodeCount`,
              ...mediaItems.flatMap((item) =>
                [
                  item.uri,
                  item.origin,
                  item.id,
                  item.url,
                  item.aggregated,
                  item.type,
                  item.status,
                  item.averageScore,
                  item.popularity,
                  item.isAdult,
                  item.episodeCount
                ]
              )
            )
          }
        },
      },
      result: {
        media: {
          uri: {
            needs: { origin: true, id: true },
            compute: (media) => `${media.origin}:${media.id}`
          }
        },
        episode: {
          uri: {
            needs: { origin: true, id: true },
            compute: (episode) => `${episode.origin}:${episode.id}`
          }
        },
        playbackSource: {
          uri: {
            needs: { origin: true, id: true },
            compute: (playbackSource) => `${playbackSource.origin}:${playbackSource.id}`
          }
        }
      }
    } as const)
await prismaClient.$executeRawUnsafe(SQLSchema as string)

export default prismaClient
