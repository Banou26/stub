import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media as GraphqlMedia, Episode as GraphqlEpisode, MediaSort } from '../../generated/schema/types.generated'
import type { Media as DrizzleMedia, Episode as DrizzleEpisode, AggregatedMedia as DrizzleAggregatedMedia, AggregatedEpisode as DrizzleAggregatedEpisode, CreateAggregatedMedia } from './schema'
import type {
  CreateMedia,
  CreateMediaHandles,
  CreateMediaEpisodes,
  CreateAggregatedMediaHandles
} from './schema'
import type { Database } from '.'

import { sql, eq, inArray, asc, desc, and, like } from 'drizzle-orm'

import {
  mediaTable,
  episodeTable,
  mediaHandlesTable,
  mediaEpisodesTable,
  aggregatedMediaTable,
  aggregatedMediaHandlesTable
} from './schema'
import database from '.'
import { getRoutePath, Route } from '../../router/path'

type RemoveSubstring<T extends string, Substring extends string> =
  T extends `${infer Before}${Substring}${infer After}`
    ? `${Before}${After}`
    : T

export type TableName = RemoveSubstring<keyof Database['query'], 'Table'>

export type DrizzleSQLiteTransaction = SQLiteTransaction<
  "async",
  SqliteRemoteResult<unknown>,
  typeof import("c:/dev/stub/src/worker/drizzle/schema"),
  ExtractTablesWithRelations<typeof import("c:/dev/stub/src/worker/drizzle/schema")>
>

function removeDuplicatesByField<T extends Record<string, any>>(field: keyof T, array: T[]): T[] {
  const seen = new Set<string | number>()
  const result: T[] = []

  for (const item of array) {
    if (!seen.has(item[field])) {
      seen.add(item[field])
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
  score: media.score ?? null,
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

export const normalizeDrizzleAggregatedMedia = (media: GraphqlMedia): CreateAggregatedMedia => ({
  ...normalizeDrizzleMedia(media),
    _id: media._id
})

const normalizeGraphqlMedia = (media: DrizzleMedia & { episodes?: { episode: DrizzleEpisode }[], handles?: { handle: DrizzleMedia }[] }): GraphqlMedia => ({
  _id: media.uri,
  uri: media.uri,
  origin: media.origin,
  id: media.id,
  url: media.url,
  score: media.score,
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
  episodeCount: media.episodeCount,
  episodes: media.episodes?.map(mediaEpisode => normalizeGraphqlEpisode(mediaEpisode.episode)),
  handles: media.handles?.map(mediaHandle => normalizeGraphqlMedia(mediaHandle.handle))
})

export const normalizeGraphqlAggregatedMedia = (
  media:
  DrizzleAggregatedMedia & {
    episodes?: { aggregatedEpisode: DrizzleAggregatedEpisode }[],
    handles?: { media: DrizzleMedia }[]
  }): GraphqlMedia => ({
  ...normalizeGraphqlMedia({
    ...media,
    episodes: media.episodes?.map(mediaEpisode => ({ episode: mediaEpisode.aggregatedEpisode })),
    handles: media.handles?.map(mediaHandle => ({ handle: mediaHandle.media }))
  }),
  _id: media._id
})

const mergeJsonArrays = (column: string) => sql`
    CASE
      WHEN excluded.${sql.raw(column)} IS NULL THEN ${sql.raw(column)}
      WHEN ${sql.raw(column)} IS NULL THEN excluded.${sql.raw(column)}
      ELSE (
        SELECT json_group_array(json(item))
        FROM (
          SELECT DISTINCT value as item
          FROM (
            SELECT value FROM json_each(${sql.raw(column)})
            UNION ALL
            SELECT value FROM json_each(excluded.${sql.raw(column)})
          )
        )
      )
    END
`

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, wrappedMedias: GraphqlMedia[]) => {
  const medias = removeDuplicatesByField('uri', wrappedMedias.flatMap(recursivelyUnwrapMediaHandles))
  const values = medias.map(normalizeDrizzleMedia)

  if (values.length) {
    await tx.insert(mediaTable)
        .values(values)
        .onConflictDoUpdate({
          target: mediaTable.uri,
          set: {
            status: sql`COALESCE(excluded.status, ${mediaTable.status})`,
            titles: mergeJsonArrays('titles'),
            trailers: mergeJsonArrays('trailers'),
            score: sql`COALESCE(excluded.score, ${mediaTable.score})`,
            descriptions: mergeJsonArrays('descriptions'),
            shortDescriptions: mergeJsonArrays('shortDescriptions'),
            covers: mergeJsonArrays('covers'),
            banners: mergeJsonArrays('banners'),
            startDate: sql`COALESCE(excluded.startDate, ${mediaTable.startDate})`,
            endDate: sql`COALESCE(excluded.endDate, ${mediaTable.endDate})`,
            averageScore: sql`COALESCE(excluded.averageScore, ${mediaTable.averageScore})`,
            episodeCount: sql`COALESCE(excluded.episodeCount, ${mediaTable.episodeCount})`,
            isAdult: sql`COALESCE(excluded.isAdult, ${mediaTable.isAdult})`,
            popularity: sql`COALESCE(excluded.popularity, ${mediaTable.popularity})`
          }
        })
  }

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
}

export const insertManyAggregatedMedia = async (tx: DrizzleSQLiteTransaction, medias: GraphqlMedia[]) => {
  const values = medias.map(normalizeDrizzleAggregatedMedia)

  if (values.length) {
    console.log('values', values)
    await tx.insert(aggregatedMediaTable)
        .values(values)
        .onConflictDoUpdate({
          target: aggregatedMediaTable._id,
          set: {
            uri: sql`COALESCE(excluded.uri, ${aggregatedMediaTable.uri})`,
            status: sql`COALESCE(excluded.status, ${aggregatedMediaTable.status})`,
            titles: mergeJsonArrays('titles'),
            trailers: mergeJsonArrays('trailers'),
            score: sql`COALESCE(excluded.score, ${aggregatedMediaTable.score})`,
            descriptions: mergeJsonArrays('descriptions'),
            shortDescriptions: mergeJsonArrays('shortDescriptions'),
            covers: mergeJsonArrays('covers'),
            banners: mergeJsonArrays('banners'),
            startDate: sql`COALESCE(excluded.startDate, ${aggregatedMediaTable.startDate})`,
            endDate: sql`COALESCE(excluded.endDate, ${aggregatedMediaTable.endDate})`,
            averageScore: sql`COALESCE(excluded.averageScore, ${aggregatedMediaTable.averageScore})`,
            episodeCount: sql`COALESCE(excluded.episodeCount, ${aggregatedMediaTable.episodeCount})`,
            isAdult: sql`COALESCE(excluded.isAdult, ${aggregatedMediaTable.isAdult})`,
            popularity: sql`COALESCE(excluded.popularity, ${aggregatedMediaTable.popularity})`
          }
        })
  }

  const aggregatedMediaHandles =
    medias
      .flatMap(media =>
        media.handles?.map(handle => ({
          aggregatedMediaId: media._id,
          mediaUri: handle.uri
        }) satisfies CreateAggregatedMediaHandles)
      )
      .filter((mediaHandle): mediaHandle is NonNullable<typeof mediaHandle> => mediaHandle !== null && mediaHandle !== undefined)

  if (aggregatedMediaHandles.length) {
    await tx.insert(aggregatedMediaHandlesTable)
      .values(aggregatedMediaHandles)
      .onConflictDoNothing()
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
      }
    }
  })

  const mappedMedia = results.map(normalizeGraphqlMedia)

  return removeDuplicatesByField('uri', mappedMedia.flatMap(recursivelyUnwrapMediaHandles))
}

export const findAllAggregatedMedia = async (tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction) => {
  const results = await tx.query.aggregatedMediaTable.findMany({
    with: {
      episodes: {
        with: {
          aggregatedEpisode: true
        }
      },
      handles: {
        with: {
          media: {
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
  })

  return results.map(normalizeGraphqlAggregatedMedia)
}

export const findAggregatedMedia = async(
  tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction,
  { uri }: { uri: string }
) =>
  tx.query.aggregatedMediaTable.findFirst({
    where: uri ? eq(mediaTable.uri, uri) : undefined,
    with: {
      episodes: {
        with: {
          aggregatedEpisode: true
        }
      },
      handles: {
        with: {
          media: {
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
  })
  .then(media => media && normalizeGraphqlAggregatedMedia(media))

export const findAggregatedMedias = async(
  tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction,
  { sorts }: { sorts?: MediaSort[] } = {}
) =>
  (await tx.query.aggregatedMediaTable.findMany({
    orderBy:
      sorts
        ?.map(sort =>
          sort === 'POPULARITY' ? desc(mediaTable.popularity)
          : sort === 'POPULARITY_DESC' ? asc(mediaTable.popularity)
          : undefined
        )
        .filter((sort): sort is NonNullable<typeof sort> => sort !== undefined),
    with: {
      episodes: {
        with: {
          aggregatedEpisode: true
        }
      },
      handles: {
        with: {
          media: {
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
  .map(media => normalizeGraphqlAggregatedMedia(media))

const normalizeGraphqlEpisode = (episode: DrizzleEpisode): GraphqlEpisode => ({
  ...episode,
  _id: episode.uri,
  url: episode.url ?? null,
  mediaUri: episode.mediaUri,
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
  seasonNumber: episode.seasonNumber ?? null,
  episodeNumber: episode.episodeNumber ?? null,
  absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
})

const normalizeDrizzleEpisode = (episode: GraphqlEpisode): DrizzleEpisode => ({
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
  seasonNumber: episode.seasonNumber ?? null,
  episodeNumber: episode.episodeNumber ?? null,
  absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
})

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
            mediaUri: sql`excluded.mediaUri`,
            titles: sql`excluded.titles`,
            descriptions: sql`excluded.descriptions`,
            shortDescriptions: sql`excluded.shortDescriptions`,
            thumbnails: sql`excluded.thumbnails`,
            releaseDate: sql`excluded.releaseDate`,
            seasonNumber: sql`excluded.seasonNumber`,
            episodeNumber: sql`excluded.episodeNumber`,
            absoluteEpisodeNumber: sql`excluded.absoluteEpisodeNumber`
          }
        })
  }

  // Create media-episode relationships
  const mediaEpisodeRelations = episodes.map(episode => ({
    mediaUri: episode.mediaUri,
    episodeUri: episode.uri
  }) satisfies CreateMediaEpisodes)

  if (mediaEpisodeRelations.length) {
    await tx.insert(mediaEpisodesTable)
      .values(mediaEpisodeRelations)
      .onConflictDoNothing()
  }
}

export const aggregateMediaHandles = (medias: GraphqlMedia[], existingAggregatedMedia?: GraphqlMedia) => {
  const id = `(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`
  const uri = `ag:${id}`

  const sortedMediaBasedOnQualityScore = medias.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const _id = existingAggregatedMedia?._id ?? crypto.randomUUID()

  const aggregatedMedia = sortedMediaBasedOnQualityScore.reduce((acc, media) => ({
    ...media,
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []],
    descriptions: [...acc.descriptions ?? [], ...media.descriptions ?? []],
    shortDescriptions: [...acc.shortDescriptions ?? [], ...media.shortDescriptions ?? []],
    covers: [...acc.covers ?? [], ...media.covers ?? []],
    banners: [...acc.banners ?? [], ...media.banners ?? []],
    trailers: [...acc.trailers ?? [], ...media.trailers ?? []]
  }), {
    _id,
    uri,
    id,
    origin: 'ag',
    url: `${location.origin}/${getRoutePath(Route.MEDIA, { uri }).replace(/^\//, '')}`,
    aggregated: true,
    score: Math.max(...medias.map(m => m.score ?? 0)),
    handles: removeDuplicatesByField('_id', sortedMediaBasedOnQualityScore.flatMap(recursivelyUnwrapMediaHandles))
  } as GraphqlMedia)

  if (aggregatedMedia?.episodes?.length) {
    console.log('-----------------', aggregatedMedia)
  }

  return {
    ...aggregatedMedia,
    titles: removeDuplicatesByField('title', aggregatedMedia?.titles?.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) ?? []),
    trailers: removeDuplicatesByField('uri', aggregatedMedia?.trailers ?? [])
  }
}


export const aggregateEpisodeHandles = (episodes: GraphqlMedia[], existingAggregatedEpisode?: GraphqlMedia) => {
  const id = `(${episodes.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`
  const uri = `ag:${id}`

  const sortedMediaBasedOnQualityScore = episodes.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const _id = existingAggregatedEpisode?._id ?? crypto.randomUUID()

  const aggregatedMedia = sortedMediaBasedOnQualityScore.reduce((acc, media) => ({
    ...media,
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []],
    descriptions: [...acc.descriptions ?? [], ...media.descriptions ?? []],
    shortDescriptions: [...acc.shortDescriptions ?? [], ...media.shortDescriptions ?? []],
    covers: [...acc.covers ?? [], ...media.covers ?? []],
    banners: [...acc.banners ?? [], ...media.banners ?? []],
    trailers: [...acc.trailers ?? [], ...media.trailers ?? []]
  }), {
    _id,
    uri,
    id,
    origin: 'ag',
    url: `${location.origin}/${getRoutePath(Route.MEDIA, { uri }).replace(/^\//, '')}`,
    aggregated: true,
    score: Math.max(...episodes.map(m => m.score ?? 0)),
    handles: removeDuplicatesByField('_id', sortedMediaBasedOnQualityScore.flatMap(recursivelyUnwrapMediaHandles))
  } as GraphqlMedia)

  if (aggregatedMedia?.episodes?.length) {
    console.log('-----------------', aggregatedMedia)
  }

  return {
    ...aggregatedMedia,
    titles: removeDuplicatesByField('title', aggregatedMedia?.titles?.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) ?? []),
    trailers: removeDuplicatesByField('uri', aggregatedMedia?.trailers ?? [])
  }
}
