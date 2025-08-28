import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media as GraphqlMedia, Episode as GraphqlEpisode } from '../../generated/schema/types.generated'
import type { Media as DrizzleMedia, Episode as DrizzleEpisode } from './schema'
import type {
  CreateMedia,
  CreateEpisode,
  CreateMediaHandles,
  CreateMediaEpisodes
} from './schema'

import {
  mediaTable,
  episodeTable,
  mediaHandlesTable,
  mediaEpisodesTable
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

const unwrapCache = new WeakMap<GraphqlMedia, GraphqlMedia[]>()
export const recursivelyUnwrapMediaHandles = (media: GraphqlMedia): GraphqlMedia[] => {
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

const normalizeDrizzleMedia = (media: GraphqlMedia): CreateMedia => ({
  uri: media.uri,
  origin: media.origin,
  id: media.id,
  url: media.url ?? null,
  aggregated: media.aggregated ?? null,
  type: media.type ?? null,
  status: media.status ?? null,
  titles: media.titles || [],
  descriptions: media.descriptions || [],
  shortDescriptions: media.shortDescriptions || [],
  trailers:
    media
      .trailers
      ?.map(trailer => ({
        ...trailer,
        url: trailer.url ?? undefined,
        language: trailer.language ?? undefined,
        thumbnail: trailer.thumbnail ?? undefined
      }))
    ?? [],
  covers:
    media
      .covers
      ?.map(cover => ({
        ...cover,
        language: cover.language ?? undefined,
        url: cover.url ?? undefined,
        height: cover.height ?? undefined,
        width: cover.width ?? undefined,
        color: cover.color ?? undefined
      }))
    ?? [],
  banners:
    media
      .banners
      ?.map(banner => ({
        ...banner,
        language: banner.language ?? undefined,
        url: banner.url ?? undefined,
        height: banner.height ?? undefined,
        width: banner.width ?? undefined,
        color: banner.color ?? undefined
      }))
    ?? [],
  externalLinks: media.externalLinks ?? null,
  averageScore: media.averageScore ?? null,
  popularity: media.popularity ?? null,
  startDate: media.startDate ? new Date(media.startDate) : null,
  endDate: media.endDate ? new Date(media.endDate) : null,
  isAdult: media.isAdult ?? null,
  episodeCount: media.episodeCount ?? null
})

const normalizeGraphqlMedia = (media: CreateMedia): GraphqlMedia => ({
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
  trailers:
    media
      .trailers
      ?.map(trailer => ({
        ...trailer,
        url: trailer.url ?? undefined,
        thumbnail: trailer.thumbnail ?? undefined
      }))
    ?? [],
  covers:
    media
      .covers
      ?.map(cover => ({
        ...cover,
        language: cover.language ?? undefined,
        url: cover.url ?? undefined,
        height: cover.height ?? undefined,
        width: cover.width ?? undefined,
        color: cover.color ?? undefined
      }))
    ?? [],
  banners:
    media
      .banners
      ?.map(banner => ({
        ...banner,
        url: banner.url ?? undefined,
        height: banner.height ?? undefined,
        width: banner.width ?? undefined,
        color: banner.color ?? undefined
      }))
    ?? [],
  externalLinks: media.externalLinks,
  averageScore: media.averageScore,
  popularity: media.popularity,
  startDate: media.startDate?.toUTCString(),
  endDate: media.endDate?.toUTCString(),
  isAdult: media.isAdult,
  episodeCount: media.episodeCount
})

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, wrappedMedias: GraphqlMedia[]) => {
  const medias = removeDuplicatesByUri(wrappedMedias.flatMap(recursivelyUnwrapMediaHandles))
  const values = medias.map(normalizeDrizzleMedia)

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
  const allEpisodes = removeDuplicatesByUri(
    medias.flatMap(media => media.episodes || [])
  )

  if (allEpisodes.length) {
    await insertManyEpisode(tx, allEpisodes)

    // Create media-episode relationships
    const mediaEpisodeRelations = medias.flatMap(media =>
      media.episodes?.map(episode => ({
        mediaUri: media.uri,
        episodeUri: episode.uri
      }) satisfies CreateMediaEpisodes) || []
    )

    if (mediaEpisodeRelations.length) {
      await tx.insert(mediaEpisodesTable)
        .values(mediaEpisodeRelations)
        .onConflictDoNothing()
    }
  }
}

export const findAllMedia = async (tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction) => {
  const results = await tx.query.mediaTable.findMany({
    with: {
      episodes: {
        with: {
          episode: true
        }
      },
      handles: {
        with: {
          handle: {
            with: {
              episodes: {
                with: {
                  episode: true
                }
              }
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

  const mappedMedia =
    results
      .map(media => ({
        ...media,
        episodes: media.episodes.map(me => me.episode),
        handles: media.handles.map(h => ({
          ...h.handle,
          episodes: h.handle.episodes.map(me => me.episode)
        }))
      }))
      .map(normalizeGraphqlMedia)

  return removeDuplicatesByUri(mappedMedia.flatMap(recursivelyUnwrapMediaHandles))
}

export const findAggregatedMedia = async(tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction) =>
  (await tx.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      episodes: {
        with: {
          episode: true
        }
      },
      handles: {
        with: {
          handle: {
            with: {
              episodes: {
                with: {
                  episode: true
                }
              }
            }
          }
        }
      }
    }
  }))
  .map(media => ({
    ...media,
    episodes: media.episodes.map(me => me.episode),
    handles: media.handles.map(mediaHandle => ({
      ...mediaHandle.handle,
      episodes: mediaHandle.handle.episodes.map(me => me.episode)
    }))
  }))

const normalizeGraphqlEpisode = (episode: CreateEpisode): GraphqlEpisode => ({
  ...episode,
  url: episode.url ?? null,
  titles: episode.titles || [],
  descriptions: episode.descriptions || [],
  shortDescriptions: episode.shortDescriptions || [],
  thumbnails:
    episode
      .thumbnails
      ?.map(thumbnail => ({
        ...thumbnail,
        height: thumbnail.height ?? undefined,
        width: thumbnail.width ?? undefined,
        color: thumbnail.color ?? undefined
      }))
    ?? [],
  releaseDate: episode.releaseDate?.toUTCString(),
  relativeNumber: episode.relativeNumber ?? null,
  absoluteNumber: episode.absoluteNumber ?? null,
});

const normalizeDrizzleEpisode = (episode: GraphqlEpisode): CreateEpisode => ({
  ...episode,
  url: episode.url ?? null,
  titles: episode.titles || [],
  descriptions: episode.descriptions || [],
  shortDescriptions: episode.shortDescriptions || [],
  thumbnails:
    episode
      .thumbnails
      ?.map(thumbnail => ({
        ...thumbnail,
        language: thumbnail.language ?? undefined,
        height: thumbnail.height ?? undefined,
        width: thumbnail.width ?? undefined,
        color: thumbnail.color ?? undefined
      }))
    ?? [],
  releaseDate: episode.releaseDate ? new Date(episode.releaseDate) : null,
  relativeNumber: episode.relativeNumber ?? null,
  absoluteNumber: episode.absoluteNumber ?? null,
});

export const insertManyEpisode = async (tx: DrizzleSQLiteTransaction, episodes: GraphqlEpisode[]) => {
  const values = episodes.map(normalizeDrizzleEpisode)

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
            absoluteNumber: sql`excluded.absoluteNumber`
          }
        })
  }
}

export const aggregateMediaHandles = (medias: GraphqlMedia[]) =>
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
  } as GraphqlMedia)

export const cleanupDuplicateAggregatedMedia = async (tx: DrizzleSQLiteTransaction) => {
  const aggregatedMedia = await tx.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      handles: {
        with: {
          handle: true
        }
      }
    }
  })

  const aggregatedMediaUris =
    aggregatedMedia
      .map(media => ({
        media,
        urisSet: new Set(media.uri.slice('ag:('.length, -1).split(','))
      }))

  const toDelete: string[] = []
  for (const mediaA of aggregatedMediaUris) {
    const urisA = mediaA.urisSet
    for (const mediaB of aggregatedMediaUris) {
      if (mediaA === mediaB) continue
      const urisB = mediaB.urisSet
      const isSubset = [...urisB].every(uri => urisA.has(uri))
      if (isSubset && urisB.size < urisA.size) {
        if (!toDelete.includes(mediaB.media.uri)) {
          toDelete.push(mediaB.media.uri)
        }
      }
    }
  }

  if (toDelete.length > 0) {
    await tx.delete(mediaHandlesTable).where(
      sql`${mediaHandlesTable.mediaUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)}) OR ${mediaHandlesTable.handleUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)})`
    )
    await tx.delete(mediaEpisodesTable).where(inArray(mediaEpisodesTable.mediaUri, toDelete))
    await tx.delete(mediaTable).where(inArray(mediaTable.uri, toDelete))
  }

  return toDelete.length
}
