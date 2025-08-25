import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media } from '../../generated/schema/types.generated'
import type {
  CreateMedia,
  CreateMediaBanner,
  CreateMediaCover,
  CreateMediaDescription,
  CreateMediaShortDescription,
  CreateMediaTitle,
  CreateMediaTrailer
} from './schema'

import database from '.'
import {
  mediaBannerTable,
  mediaCoverTable,
  mediaDescriptionTable,
  mediaShortDescriptionTable,
  mediaTable,
  mediaTitleTable,
  mediaTrailerTable
} from './schema'
import { sql } from 'drizzle-orm'

export type DrizzleSQLiteTransaction = SQLiteTransaction<
  "async",
  SqliteRemoteResult<unknown>,
  typeof import("c:/dev/stub/src/worker/drizzle/schema"),
  ExtractTablesWithRelations<typeof import("c:/dev/stub/src/worker/drizzle/schema")>
>

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, medias: Media[]) => {
  const values = medias.map(media => ({
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
    medias
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
    medias
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
    medias
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
    medias
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
    medias
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
    medias
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
}
