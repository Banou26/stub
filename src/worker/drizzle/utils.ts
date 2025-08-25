import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media, Episode } from '../../generated/schema/types.generated'
import type {
  CreateMedia,
  CreateMediaBanner,
  CreateMediaCover,
  CreateMediaDescription,
  CreateMediaShortDescription,
  CreateMediaTitle,
  CreateMediaTrailer,
  CreateEpisode,
  CreateEpisodeTitle,
  CreateEpisodeDescription,
  CreateEpisodeShortDescription,
  CreateEpisodeThumbnail,
  CreateMediaHandles
} from './schema'

import {
  mediaBannerTable,
  mediaCoverTable,
  mediaDescriptionTable,
  mediaShortDescriptionTable,
  mediaTable,
  mediaTitleTable,
  mediaTrailerTable,
  episodeTable,
  episodeTitleTable,
  episodeDescriptionTable,
  episodeShortDescriptionTable,
  episodeThumbnailTable,
  mediaHandlesTable
} from './schema'
import { sql, eq, inArray } from 'drizzle-orm'
import database from '.'

export type DrizzleSQLiteTransaction = SQLiteTransaction<
  "async",
  SqliteRemoteResult<unknown>,
  typeof import("c:/dev/stub/src/worker/drizzle/schema"),
  ExtractTablesWithRelations<typeof import("c:/dev/stub/src/worker/drizzle/schema")>
>
export const recursivelyUnwrapMediaHandles = (media: Media): Media[] =>
  media.handles
    ? [
      media,
      ...media
        .handles
        .flatMap(recursivelyUnwrapMediaHandles)
    ]
    : [media]

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, wrappedMedias: Media[]) => {
  const medias = wrappedMedias.flatMap(recursivelyUnwrapMediaHandles)
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

  // Handle the many-to-many handles relationship
  const mediaHandles =
    medias
      .flatMap(media =>
        media.handles?.map(handle => ({
          mediaUri: media.uri,
          handleUri: handle.uri
        }) satisfies CreateMediaHandles)
      )
      .filter((mediaHandle): mediaHandle is NonNullable<typeof mediaHandle> => mediaHandle !== null && mediaHandle !== undefined)

  if (mediaHandles.length) {
    await tx.insert(mediaHandlesTable)
      .values(mediaHandles)
      .onConflictDoNothing()
  }

  // Handle episodes for all media
  const allEpisodes = medias.flatMap(media =>
    media.episodes?.map(episode => ({
      ...episode,
      mediaUri: media.uri // Ensure the relation to the parent media
    })) || []
  )

  if (allEpisodes.length) {
    await insertManyEpisode(tx, allEpisodes)
  }
}

export const findAllMedia = async () => {
  const results = await database.query.mediaTable.findMany({
    with: {
      titles: true,
      descriptions: true,
      shortDescriptions: true,
      trailers: true,
      covers: true,
      banners: true,
      episodes: true,
      handles: {
        with: {
          handle: true
        }
      },
      handleOf: {
        with: {
          media: true
        }
      }
    }
  })

  // Transform the results to include actual Media objects in handles
  const mappedMedia = results.map(media => ({
    ...media,
    handles: [
      ...media.handles.map(h => h.handle),
      ...media.handleOf.map(h => h.media)
    ].filter(Boolean),
    handleOf: undefined // Remove the intermediate relation
  }))

  const unwrappedMedia = mappedMedia.flatMap(recursivelyUnwrapMediaHandles)

  // Filter out duplicates based on URI
  const uniqueMedia = unwrappedMedia.filter((media, index, self) =>
    index === self.findIndex(m => m.uri === media.uri)
  )

  return uniqueMedia
}

export const findAggregatedMedia = async () => {
  const results = await database.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      titles: true,
      descriptions: true,
      shortDescriptions: true,
      trailers: true,
      covers: true,
      banners: true,
      episodes: true,
      handles: {
        with: {
          handle: true
        }
      },
      handleOf: {
        with: {
          media: true
        }
      }
    }
  })

  // Transform the results to include actual Media objects in handles
  const mappedMedia = results.map(media => ({
    ...media,
    handles: [
      ...media.handles.map(h => h.handle),
      ...media.handleOf.map(h => h.media)
    ].filter(Boolean),
    handleOf: undefined // Remove the intermediate relation
  }))

  return mappedMedia
}

export const insertManyEpisode = async (tx: DrizzleSQLiteTransaction, episodes: Episode[]) => {
  const values = episodes.map(episode => ({
    ...episode,
    releaseDate: episode.releaseDate ? new Date(episode.releaseDate) : null
  } satisfies CreateEpisode))

  if (values.length) {
    await tx.insert(episodeTable)
        .values(values)
        .onConflictDoUpdate({
          target: episodeTable.uri,
          set: {
            origin: sql`excluded.origin`,
            id: sql`excluded.id`,
            url: sql`excluded.url`,
            aggregated: sql`excluded.aggregated`,
            releaseDate: sql`excluded.releaseDate`,
            relativeNumber: sql`excluded.relativeNumber`,
            absoluteNumber: sql`excluded.absoluteNumber`,
            mediaUri: sql`excluded.mediaUri`
          }
        })
  }

  const episodeTitles =
    episodes
      .flatMap(episode =>
        episode.titles?.map(title => ({
          episodeUri: episode.uri,
          language: title.language,
          title: title.title
        }) satisfies CreateEpisodeTitle)
      )
      .filter((title): title is NonNullable<typeof title> => title !== null && title !== undefined)
      .filter(title => title.title?.length > 0)

  if (episodeTitles.length) {
    await tx.insert(episodeTitleTable)
      .values(episodeTitles)
      .onConflictDoNothing()
  }

  const episodeDescriptions =
    episodes
      .flatMap(episode =>
        episode.descriptions?.map(episodeDescription => ({
          episodeUri: episode.uri,
          language: episodeDescription.language,
          description: episodeDescription.description
        }) satisfies CreateEpisodeDescription)
      )
      .filter((episodeDescription): episodeDescription is NonNullable<typeof episodeDescription> => episodeDescription !== null && episodeDescription !== undefined)
      .filter(episodeDescription => episodeDescription.description?.length > 0)

  if (episodeDescriptions.length) {
    await tx.insert(episodeDescriptionTable)
      .values(episodeDescriptions)
      .onConflictDoNothing()
  }

  const episodeShortDescriptions =
    episodes
      .flatMap(episode =>
        episode.shortDescriptions?.map(episodeShortDescription => ({
          episodeUri: episode.uri,
          language: episodeShortDescription.language,
          shortDescription: episodeShortDescription.shortDescription
        }) satisfies CreateEpisodeShortDescription)
      )
      .filter((episodeShortDescription): episodeShortDescription is NonNullable<typeof episodeShortDescription> => episodeShortDescription !== null && episodeShortDescription !== undefined)
      .filter(episodeShortDescription => episodeShortDescription.shortDescription?.length > 0)

  if (episodeShortDescriptions.length) {
    await tx.insert(episodeShortDescriptionTable)
      .values(episodeShortDescriptions)
      .onConflictDoNothing()
  }

  const episodeThumbnails =
    episodes
      .flatMap(episode =>
        episode.thumbnails?.map(episodeThumbnail => ({
          episodeUri: episode.uri,
          language: episodeThumbnail.language,
          url: episodeThumbnail.url,
          height: episodeThumbnail.height,
          width: episodeThumbnail.width,
          color: episodeThumbnail.color
        }) satisfies CreateEpisodeThumbnail)
      )
      .filter((episodeThumbnail): episodeThumbnail is NonNullable<typeof episodeThumbnail> => episodeThumbnail !== null && episodeThumbnail !== undefined)
      .filter(episodeThumbnail => episodeThumbnail.url?.length > 0)

  if (episodeThumbnails.length) {
    await tx.insert(episodeThumbnailTable)
      .values(episodeThumbnails)
      .onConflictDoNothing()
  }
}

export const aggregateMediaHandles = (medias: Media[]) =>
  medias.reduce((acc, media) => ({
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []]
  }), {
    uri: `ag:(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    id: `(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    origin: 'ag',
    url: undefined,
    aggregated: true,
    handles: medias.flatMap(recursivelyUnwrapMediaHandles)
  } as Media)

export const cleanupDuplicateAggregatedMedia = async () => {
  // Find all aggregated media (origin = 'ag')
  const aggregatedMedia = await database.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      handles: {
        with: {
          handle: true
        }
      }
    }
  })

  // console.log(`Found ${aggregatedMedia.length} aggregated media to check for subsets`)

  // Extract URIs for each aggregated media
  const mediaWithUris = aggregatedMedia.map(media => {
    const match = media.uri.match(/^ag:\((.*)\)$/)
    if (!match) {
      // console.log(`Skipping media with invalid ag: format: ${media.uri}`)
      return null
    }

    const urisSet = new Set(match[1].split(','))
    return { media, urisSet }
  }).filter((item): item is NonNullable<typeof item> => item !== null)

  // Find subsets: if media A contains all URIs of media B, then B is a subset of A
  const toDelete: string[] = []

  for (let i = 0; i < mediaWithUris.length; i++) {
    const { media: mediaA, urisSet: urisA } = mediaWithUris[i]

    for (let j = 0; j < mediaWithUris.length; j++) {
      if (i === j) continue

      const { media: mediaB, urisSet: urisB } = mediaWithUris[j]

      // Check if B is a subset of A (A contains all URIs of B)
      const isSubset = [...urisB].every(uri => urisA.has(uri))

      if (isSubset && urisB.size < urisA.size) {
        // B is a proper subset of A, mark B for deletion
        // console.log(`${mediaB.uri} (${urisB.size} URIs) is a subset of ${mediaA.uri} (${urisA.size} URIs)`)
        if (!toDelete.includes(mediaB.uri)) {
          toDelete.push(mediaB.uri)
        }
      }
    }
  }

  // Delete the duplicate aggregated media
  if (toDelete.length > 0) {
    // console.log(`Deleting ${toDelete.length} duplicate aggregated media:`, toDelete)

    await database.transaction(async (tx) => {
      // Delete related data first (due to foreign key constraints)
      await tx.delete(mediaTitleTable).where(inArray(mediaTitleTable.mediaUri, toDelete))
      await tx.delete(mediaDescriptionTable).where(inArray(mediaDescriptionTable.mediaUri, toDelete))
      await tx.delete(mediaShortDescriptionTable).where(inArray(mediaShortDescriptionTable.mediaUri, toDelete))
      await tx.delete(mediaTrailerTable).where(inArray(mediaTrailerTable.mediaUri, toDelete))
      await tx.delete(mediaCoverTable).where(inArray(mediaCoverTable.mediaUri, toDelete))
      await tx.delete(mediaBannerTable).where(inArray(mediaBannerTable.mediaUri, toDelete))
      await tx.delete(mediaHandlesTable).where(
        sql`${mediaHandlesTable.mediaUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)}) OR ${mediaHandlesTable.handleUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)})`
      )
      await tx.delete(episodeTable).where(inArray(episodeTable.mediaUri, toDelete))

      // Finally delete the media itself
      await tx.delete(mediaTable).where(inArray(mediaTable.uri, toDelete))
    })
  }

  return toDelete.length
}
