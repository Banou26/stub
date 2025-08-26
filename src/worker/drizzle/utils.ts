import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media, Episode } from '../../generated/schema/types.generated'
import type {
  CreateMedia,
  CreateEpisode,
  CreateMediaHandles
} from './schema'

import {
  mediaTable,
  episodeTable,
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

function removeDuplicatesByUri<T extends { uri: string }>(array: T[]): T[] {
  const seen = new Set<string | number>()
  const result: T[] = []

  for (const item of array) {
    if (!seen.has(item.uri)) {
      seen.add(item.uri)
      result.push(item)
    }
  }

  return result
}

const unwrapCache = new WeakMap<Media, Media[]>()
export const recursivelyUnwrapMediaHandles = (media: Media): Media[] => {
  if (unwrapCache.has(media)) {
    return unwrapCache.get(media)!
  }

  const unwrappedResult =
    media.handles
      ? [
        media,
        ...media
          .handles
          .flatMap(recursivelyUnwrapMediaHandles)
      ]
      : [media]

  if (media.handles) {
    unwrapCache.set(media, unwrappedResult)
  }

  return unwrappedResult
}

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, wrappedMedias: Media[]) => {
  const medias = removeDuplicatesByUri(wrappedMedias.flatMap(recursivelyUnwrapMediaHandles))
  const values = medias.map(media => ({
    uri: media.uri,
    origin: media.origin,
    id: media.id,
    url: media.url,
    aggregated: media.aggregated,
    type: media.type,
    status: media.status,
    titles: media.titles || [],
    descriptions: media.descriptions || [],
    shortDescriptions: media.shortDescriptions || [],
    trailers: media.trailers || [],
    covers: media.covers || [],
    banners: media.banners || [],
    externalLinks: media.externalLinks,
    averageScore: media.averageScore,
    popularity: media.popularity,
    startDate: media.startDate ? new Date(media.startDate) : null,
    endDate: media.endDate ? new Date(media.endDate) : null,
    isAdult: media.isAdult,
    episodeCount: media.episodeCount
  } satisfies CreateMedia))

  if (values.length) {
    await tx.insert(mediaTable)
        .values(values)
        .onConflictDoUpdate({
          target: mediaTable.uri,
          set: {
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            titles: sql`excluded.titles`,
            descriptions: sql`excluded.descriptions`,
            shortDescriptions: sql`excluded.shortDescriptions`,
            trailers: sql`excluded.trailers`,
            covers: sql`excluded.covers`,
            banners: sql`excluded.banners`,
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
      episodes: true,
      handles: {
        with: {
          handle: {
            with: {
              episodes: true
            }
          }
        }
      },
      handleOf: {
        with: {
          media: true
        }
      }
    }
  })

  const mappedMedia = results.map(media => ({
    ...media,
    handles: media.handles.map(h => h.handle)
  }))

  return removeDuplicatesByUri(mappedMedia.flatMap(recursivelyUnwrapMediaHandles))
}

export const findAggregatedMedia = async() =>
  (await database.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      episodes: true,
      handles: {
        with: {
          handle: {
            with: {
              episodes: true
            }
          }
        }
      }
    }
  }))
  .map(media => ({
    ...media,
    handles: media.handles.map(mediaHandle => mediaHandle.handle)
  }))

export const insertManyEpisode = async (tx: DrizzleSQLiteTransaction, episodes: Episode[]) => {
  const values = episodes.map(episode => ({
    uri: episode.uri,
    origin: episode.origin,
    id: episode.id,
    url: episode.url,
    aggregated: episode.aggregated,
    titles: episode.titles || [],
    descriptions: episode.descriptions || [],
    shortDescriptions: episode.shortDescriptions || [],
    thumbnails: episode.thumbnails || [],
    releaseDate: episode.releaseDate ? new Date(episode.releaseDate) : null,
    relativeNumber: episode.relativeNumber,
    absoluteNumber: episode.absoluteNumber,
    mediaUri: episode.mediaUri
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
            titles: sql`excluded.titles`,
            descriptions: sql`excluded.descriptions`,
            shortDescriptions: sql`excluded.shortDescriptions`,
            thumbnails: sql`excluded.thumbnails`,
            releaseDate: sql`excluded.releaseDate`,
            relativeNumber: sql`excluded.relativeNumber`,
            absoluteNumber: sql`excluded.absoluteNumber`,
            mediaUri: sql`excluded.mediaUri`
          }
        })
  }
}

export const aggregateMediaHandles = (medias: Media[]) =>
  medias.reduce((acc, media) => ({
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []],
    descriptions: [...acc.descriptions ?? [], ...media.descriptions ?? []],
    shortDescriptions: [...acc.shortDescriptions ?? [], ...media.shortDescriptions ?? []],
    covers: [...acc.covers ?? [], ...media.covers ?? []],
    banners: [...acc.banners ?? [], ...media.banners ?? []]
  }), {
    uri: `ag:(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    id: `(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    origin: 'ag',
    url: undefined,
    aggregated: true,
    handles: removeDuplicatesByUri(medias.flatMap(recursivelyUnwrapMediaHandles))
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

  // Extract URIs for each aggregated media
  const mediaWithUris = aggregatedMedia.map(media => {
    const match = media.uri.match(/^ag:\((.*)\)$/)
    if (!match) {
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
        if (!toDelete.includes(mediaB.uri)) {
          toDelete.push(mediaB.uri)
        }
      }
    }
  }

  // Delete the duplicate aggregated media
  if (toDelete.length > 0) {
    await database.transaction(async (tx) => {
      // Delete related data first (due to foreign key constraints)
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
