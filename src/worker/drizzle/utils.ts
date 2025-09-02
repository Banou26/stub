import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media as GraphqlMedia, Episode as GraphqlEpisode, MediaSort } from '../../generated/schema/types.generated'
import type { Media as DrizzleMedia, Episode as DrizzleEpisode } from './schema'
import type {
  CreateMedia,
  CreateMediaHandles,
  CreateMediaEpisodes
} from './schema'
import type { Database } from '.'

import { create_custom_config, WasmMatcher } from 'frizbee-wasm'
import { sql, eq, inArray, asc, desc } from 'drizzle-orm'

// import { MediaSort } from '../../generated/graphql'
import {
  mediaTable,
  episodeTable,
  mediaHandlesTable,
  mediaEpisodesTable
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

const normalizeGraphqlMedia = (media: DrizzleMedia & { episodes?: { episode: DrizzleEpisode }[], handles?: { handle: DrizzleMedia }[] }): GraphqlMedia => ({
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
  episodeCount: media.episodeCount,
  episodes: media.episodes?.map(mediaEpisode => normalizeGraphqlEpisode(mediaEpisode.episode)),
  handles: media.handles?.map(mediaHandle => normalizeGraphqlMedia(mediaHandle.handle))
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
  const medias = removeDuplicatesByUri(wrappedMedias.flatMap(recursivelyUnwrapMediaHandles))
  const values = medias.map(normalizeDrizzleMedia)

  if (values.length) {
    await tx.insert(mediaTable)
        .values(values)
        .onConflictDoUpdate({
          target: mediaTable.uri,
          set: {
            status: sql`COALESCE(excluded.status, ${mediaTable.status})`,
            titles: mergeJsonArrays('titles'),
            descriptions: sql`COALESCE(excluded.descriptions, ${mediaTable.descriptions})`,
            shortDescriptions: sql`COALESCE(excluded.shortDescriptions, ${mediaTable.shortDescriptions})`,
            trailers: sql`COALESCE(excluded.trailers, ${mediaTable.trailers})`,
            covers: sql`COALESCE(excluded.covers, ${mediaTable.covers})`,
            banners: sql`COALESCE(excluded.banners, ${mediaTable.banners})`,
            startDate: sql`COALESCE(excluded.startDate, ${mediaTable.startDate})`,
            endDate: sql`COALESCE(excluded.endDate, ${mediaTable.endDate})`,
            averageScore: sql`COALESCE(excluded.averageScore, ${mediaTable.averageScore})`,
            episodeCount: sql`COALESCE(excluded.episodeCount, ${mediaTable.episodeCount})`,
            aggregated: sql`COALESCE(excluded.aggregated, ${mediaTable.aggregated})`,
            isAdult: sql`COALESCE(excluded.isAdult, ${mediaTable.isAdult})`,
            popularity: sql`COALESCE(excluded.popularity, ${mediaTable.popularity})`
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

  const mappedMedia = results.map(normalizeGraphqlMedia)

  return removeDuplicatesByUri(mappedMedia.flatMap(recursivelyUnwrapMediaHandles))
}

export const findAggregatedMedia = async(
  tx: DrizzleSQLiteTransaction = database as unknown as DrizzleSQLiteTransaction,
  { sorts }: { sorts?: MediaSort[] } = {}
) =>
  (await tx.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
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
  .map(media => normalizeGraphqlMedia(media))

const normalizeGraphqlEpisode = (episode: DrizzleEpisode): GraphqlEpisode => ({
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

const matcher = new WasmMatcher()
const config = create_custom_config(false, undefined, true, undefined)

export const aggregateMediaHandles = (medias: GraphqlMedia[]) => {
  const id = `(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`
  const uri = `ag:${id}`
  const aggregatedMedia = medias.reduce((acc, media) => ({
    ...media,
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []],
    descriptions: [...acc.descriptions ?? [], ...media.descriptions ?? []],
    shortDescriptions: [...acc.shortDescriptions ?? [], ...media.shortDescriptions ?? []],
    covers: [...acc.covers ?? [], ...media.covers ?? []],
    banners: [...acc.banners ?? [], ...media.banners ?? []]
  }), {
    uri,
    id,
    origin: 'ag',
    url: `${location.origin}/${getRoutePath(Route.TITLE, { uri })}`,
    aggregated: true,
    handles: removeDuplicatesByUri(medias.flatMap(recursivelyUnwrapMediaHandles))
  } as GraphqlMedia)

  const titleComparisons =
    aggregatedMedia.titles?.length
      // todo: check if the input length issue is fixed by frizbee at some point and remove the workaround
      ? matcher.compareAll(aggregatedMedia.titles.map(mediaTitle => mediaTitle.title.slice(0, 75).toLocaleLowerCase()), config)
      : undefined

  const titleScores = titleComparisons?.map(comparison => comparison.score)
  const maxTitleScore = titleScores?.length ? Math.max(...titleScores) : undefined

  return {
    ...aggregatedMedia,
    titles:
      aggregatedMedia.titles?.map((mediaTitle, index) => {
        const comparison = titleComparisons?.find(comparison => comparison.needle_index === index)

        return {
          ...mediaTitle,
          score:
            comparison && maxTitleScore
              ? comparison.score / maxTitleScore
              : 0
        }
      })
  }
}

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
