import type { YogaInitialContext } from 'graphql-yoga'
import type { Exchange } from 'urql'

import type { Episode, Media, MediaPage as GQLMediaPage, Origin, Resolvers } from '../generated/schema/types.generated'
import type { CreateAggregatedMediaEpisodes } from './drizzle/schema'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga } from 'graphql-yoga'
import { useErrorHandler } from '@envelop/core'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { Client, fetchExchange, getOperationName } from 'urql'
import { getNamedType, GraphQLError } from 'graphql'
import DataLoader from 'dataloader'
import { pipe, tap } from 'wonka'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from './extractor/index'
import { merge } from '../utils/merge'
import { fetch } from './fetch'
import database from './drizzle'
import {
  insertManyMedia,
  insertManyEpisode,
  findAllMedia,
  findAllAggregatedMedia,
  findAggregatedMedia,
  aggregateMediaHandles,
  insertManyAggregatedMedia,
  aggregateEpisodeHandles,
  findAllAggregatedEpisode,
  findAllEpisode,
  insertManyAggregatedEpisode,
  insertManyOrigins,
  normalizeDrizzleOrigin,
  reAggregateEpisodesForMedia,
} from './drizzle/utils'
import { aggregatedMediaEpisodesTable, aggregatedMediaHandlesTable, aggregatedMediaTable, aggregatedEpisodeTable, aggregatedEpisodeHandlesTable } from './drizzle/schema'
import { inArray, sql } from 'drizzle-orm'
import groupAllRelatedMedia from './drizzle/sql/groupAllRelatedMedia'
import groupAllRelatedEpisodes from './drizzle/sql/groupAllRelatedEpisodes'
import { listenIterator } from './drizzle/notifications'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
  findAggregatedMedia: (uri: string) => Promise<Media | undefined>
  listenForMediaChanges: (options?: { abort?: AbortSignal }) => ReturnType<typeof listenIterator>
}

export type ExtractorUserContext = {

}

const mediaInserter = new DataLoader<Media, Media>(async (medias) => {
  await database.transaction(async (tx) => {
    await insertManyMedia(tx, medias as Media[])
    const allMedia = await findAllMedia(tx)
    const allAggregatedMedia = await findAllAggregatedMedia(tx)

    const groups = await tx.all(groupAllRelatedMedia) as [string, number, string][]

    const processedGroups = groups.map(([_, __, urisString]) => {
      const uris = urisString.split(',').map(uri => uri.trim())
      const medias =
        uris
          .map(uri => allMedia.find(r => r?.uri === uri))
          .filter((media): media is NonNullable<typeof media> => media !== null && media !== undefined)

      // Find ALL matching aggregated medias, not just the first
      const existingMatches = allAggregatedMedia.filter(existing => {
        const existingUris = existing.uri.slice('ag:('.length, -1).split(',')
        return existingUris.some(existingUri => uris.includes(existingUri))
      })

      const primaryMatch = existingMatches[0]
      const secondaryIds = existingMatches.slice(1).map(m => m._id)

      return {
        aggregatedMedia: aggregateMediaHandles(medias, primaryMatch),
        primaryId: primaryMatch?._id,
        secondaryIds
      }
    })

    // Migrate episode relations and clean up orphaned aggregated medias before inserting the merged ones
    const mergedPrimaryIds: string[] = []
    for (const { primaryId, secondaryIds } of processedGroups) {
      if (!primaryId || secondaryIds.length === 0) continue
      mergedPrimaryIds.push(primaryId)

      // Copy episode relations from secondaries to primary
      await tx.run(sql`
        INSERT OR IGNORE INTO aggregatedMediaEpisodes (aggregatedMediaId, aggregatedEpisodeId)
        SELECT ${primaryId}, aggregatedEpisodeId
        FROM aggregatedMediaEpisodes
        WHERE aggregatedMediaId IN (${sql.join(secondaryIds.map(id => sql`${id}`), sql`, `)})
      `)

      // Clean up secondary aggregated media data
      await tx.delete(aggregatedMediaEpisodesTable)
        .where(inArray(aggregatedMediaEpisodesTable.aggregatedMediaId, secondaryIds))
      await tx.delete(aggregatedMediaHandlesTable)
        .where(inArray(aggregatedMediaHandlesTable.aggregatedMediaId, secondaryIds))
      await tx.delete(aggregatedMediaTable)
        .where(inArray(aggregatedMediaTable._id, secondaryIds))
    }

    // Insert/update the merged aggregated medias
    await insertManyAggregatedMedia(tx, processedGroups.map(g => g.aggregatedMedia))

    // Re-aggregate episodes for merged medias (aggregatedMediaHandles is now up to date)
    if (mergedPrimaryIds.length > 0) {
      await reAggregateEpisodesForMedia(tx, mergedPrimaryIds)
    }
  })
  return medias
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

const episodeInserter = new DataLoader<Episode, Episode>(async (episodes) => {
  await database.transaction(async (tx) => {
    await insertManyEpisode(tx, episodes as Episode[])
    const allEpisode = await findAllEpisode(tx)
    const allAggregatedEpisode = await findAllAggregatedEpisode(tx)
    const allAggregatedMedia = await findAllAggregatedMedia(tx)

    const groups = await tx.all(groupAllRelatedEpisodes) as [string, number, string, number][]

    const allUpdatedAggregatedEpisode = groups.map(([_, __, urisString]) => {
      const uris = urisString.split(',').map(uri => uri.trim())
      const groupEpisodes =
        uris
          .map(uri => allEpisode.find(r => r?.uri === uri))
          .filter((episode): episode is NonNullable<typeof episode> => episode !== null && episode !== undefined)

      // Find ALL matching aggregated episodes, not just the first
      const existingMatches = allAggregatedEpisode.filter(existing => {
        const existingUris = existing.uri.slice('ag:('.length, -1).split(',')
        return existingUris.some(existingUri => uris.includes(existingUri))
      })

      const primaryMatch = existingMatches[0]
      const secondaryIds = existingMatches.slice(1).map(e => e._id)

      return {
        aggregatedEpisode: aggregateEpisodeHandles(groupEpisodes, primaryMatch),
        secondaryIds
      }
    })

    // Clean up orphaned secondary aggregated episodes before inserting
    const allSecondaryEpisodeIds = allUpdatedAggregatedEpisode.flatMap(g => g.secondaryIds)
    if (allSecondaryEpisodeIds.length > 0) {
      // Migrate media-episode relations from secondaries to their primaries
      for (const { aggregatedEpisode, secondaryIds } of allUpdatedAggregatedEpisode) {
        if (secondaryIds.length === 0) continue

        await tx.run(sql`
          INSERT OR IGNORE INTO aggregatedMediaEpisodes (aggregatedMediaId, aggregatedEpisodeId)
          SELECT aggregatedMediaId, ${aggregatedEpisode._id}
          FROM aggregatedMediaEpisodes
          WHERE aggregatedEpisodeId IN (${sql.join(secondaryIds.map(id => sql`${id}`), sql`, `)})
        `)
      }

      // Delete secondary episode data
      await tx.delete(aggregatedMediaEpisodesTable)
        .where(inArray(aggregatedMediaEpisodesTable.aggregatedEpisodeId, allSecondaryEpisodeIds))
      await tx.delete(aggregatedEpisodeHandlesTable)
        .where(inArray(aggregatedEpisodeHandlesTable.aggregatedEpisodeId, allSecondaryEpisodeIds))
      await tx.delete(aggregatedEpisodeTable)
        .where(inArray(aggregatedEpisodeTable._id, allSecondaryEpisodeIds))
    }

    // Insert aggregated episodes
    await insertManyAggregatedEpisode(tx, allUpdatedAggregatedEpisode.map(g => g.aggregatedEpisode))

    // Group episodes by their mediaUri to update aggregated media
    const episodesByMediaUri = new Map<string, Episode[]>()
    for (const episode of episodes as Episode[]) {
      const mediaUri = episode.mediaUri
      if (!episodesByMediaUri.has(mediaUri)) {
        episodesByMediaUri.set(mediaUri, [])
      }
      episodesByMediaUri.get(mediaUri)!.push(episode)
    }

    // Find corresponding aggregated media and create relations
    const aggregatedMediaEpisodeRelations: CreateAggregatedMediaEpisodes[] = []
    for (const [mediaUri, mediaEpisodes] of episodesByMediaUri) {
      // Find the aggregated media that contains this media URI
      const aggregatedMedia = allAggregatedMedia.find(am => {
        const aggregatedUris = am.uri.slice('ag:('.length, -1).split(',')
        return aggregatedUris.includes(mediaUri)
      })

      if (aggregatedMedia) {
        // Find corresponding aggregated episodes for these episodes
        for (const episode of mediaEpisodes) {
          const aggregatedEpisode = allUpdatedAggregatedEpisode.find(({ aggregatedEpisode: ae }) => {
            const aggregatedUris = ae.uri.slice('ag:('.length, -1).split(',')
            return aggregatedUris.includes(episode.uri)
          })

          if (aggregatedEpisode) {
            aggregatedMediaEpisodeRelations.push({
              aggregatedMediaId: aggregatedMedia._id,
              aggregatedEpisodeId: aggregatedEpisode.aggregatedEpisode._id
            } satisfies CreateAggregatedMediaEpisodes)
          }
        }
      }
    }

    // Insert aggregated media-episode relations
    if (aggregatedMediaEpisodeRelations.length) {
      await tx.insert(aggregatedMediaEpisodesTable)
        .values(aggregatedMediaEpisodeRelations)
        .onConflictDoNothing()
    }
  })
  return episodes
}, {
  cache: false,
  batch: true,
  maxBatchSize: 250,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})

export const extractors =
  Object
    .entries(extractorDefinitions)
    .map(([name, extractor]) => {
      const server = createYoga<Omit<ExtractorServerContext, keyof YogaInitialContext>, ExtractorUserContext>({
        schema: createSchema<Omit<ExtractorServerContext, keyof YogaInitialContext>>({
          typeDefs,
          resolvers:
            merge(
              {
                Media: {
                  _id: (parent) => parent.uri,
                  handles: (parent) => parent.handles ?? [],
                  titles: (parent) => parent.titles ?? [],
                  descriptions: (parent) => parent.descriptions ?? [],
                  shortDescriptions: (parent) => parent.shortDescriptions ?? [],
                  covers: (parent) => parent.covers ?? [],
                  banners: (parent) => parent.banners ?? [],
                  trailers: (parent) => parent.trailers ?? [],
                  episodes: (parent) => parent.episodes ?? [],
                },
                Episode: {
                  _id: (parent) => parent.uri,
                  handles: (parent) => parent.handles ?? [],
                  descriptions: (parent) => parent.descriptions ?? [],
                  shortDescriptions: (parent) => parent.shortDescriptions ?? []
                },
                Query: {
                },
                Mutation: {
                },
                Subscription: {
                  origin: {
                    resolve: () => normalizeDrizzleOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl }),
                    subscribe: async function*() { return yield normalizeDrizzleOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl }) }
                  },
                  originPage: {
                    resolve: () => ({ nodes: [normalizeDrizzleOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl })] }),
                    subscribe: async function* () { yield [normalizeDrizzleOrigin({ ...extractor, id: extractor.origin, url: extractor.originUrl })] }
                  },
                  media: { subscribe: async function* (_parent) { yield { media: null } } },
                  mediaPage: { subscribe: async function* (_parent) { yield { mediaPage: { nodes: [] } } } }
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
          useResponseCache({ session: () => null, ttl: 15 * 60 * 1000 }),
          {
            onPluginInit: ({ addPlugin }) => {
              addPlugin(useOnResolve(({ info }) =>
                async ({ result }) => {
                  if (getNamedType(info.returnType).name === 'Media') {
                    if (Array.isArray(result)) {
                      await mediaInserter.loadMany(result as Media[])
                    } else if (result) {
                      await mediaInserter.load(result as Media)
                    }
                  } else if (getNamedType(info.returnType).name === 'Episode') {
                    if (Array.isArray(result)) {
                      await episodeInserter.loadMany(result as Episode[])
                    } else if (result) {
                      await episodeInserter.load(result as Episode)
                    }
                  } else if (getNamedType(info.returnType).name === 'Origin') {
                    if (Array.isArray(result)) {
                      await originInserter.loadMany(result as Origin[])
                    } else if (result) {
                      await originInserter.load(result as Origin)
                    }
                  }
                }
              ))
            }
          }
        ],
        maskedErrors: {
          maskError(error, message, isDev) {
            console.error(`Server Extractor ${extractor.name} GQLError occurred:`, error)
            return new GraphQLError((error as Error).message)
          },
        }
      })
      
      const errorExchange: Exchange = ({ forward }) => (ops$) => {
        return pipe(
          forward(ops$),
          tap((result) => {
            if (result.error) {
              if (result.error.networkError) {
                console.error(new Error(`Client Extractor ${extractor.name} Network error on ${getOperationName(result.operation.query)}:`, { cause: result.error.networkError }))
              }
              if (result.error.graphQLErrors?.length) {
                result.error.graphQLErrors.forEach((err) => {
                  console.error(new Error(`Client Extractor ${extractor.name} GraphQL error on ${getOperationName(result.operation.query)}:`, { cause: err }))
                })
              }
            }
          })
        )
      }

      const client = new Client({
        url: 'http://d/graphql',
        exchanges: [errorExchange, fetchExchange],
        fetchSubscriptions: true,
        fetch: async (input: Parameters<typeof globalThis.fetch>[0], init: Parameters<typeof globalThis.fetch>[1]) =>
          server.handleRequest(
            new Request(input, init),
            {
              fetch,
              findAggregatedMedia: (uri: string) => findAggregatedMedia(undefined, { uri }),
              listenForMediaChanges: (options?: { abort?: AbortSignal }) => listenIterator({ ...options, table: 'aggregatedMedia' }),
            }
          )
      })

      return {
        name: extractor.name,
        server,
        client,
        extractor
      }
    })

const originInserter = new DataLoader<Origin, Origin>(async (origins) => {
  await database.transaction(async (tx) => {
    await insertManyOrigins(tx, origins as Origin[])
  })
  return origins
}, {
  cache: false,
  batch: true,
  maxBatchSize: 50,
  batchScheduleFn: (callback) => setTimeout(callback, 50)
})
