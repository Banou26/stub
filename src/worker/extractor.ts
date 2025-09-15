import type { YogaInitialContext } from 'graphql-yoga'

import type { Episode, Media, Resolvers } from '../generated/schema/types.generated'
import type { CreateAggregatedMediaEpisodes } from './drizzle/schema'

import { useOnResolve } from '@envelop/on-resolve'
import { createSchema, createYoga, useErrorHandler } from 'graphql-yoga'
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'
import { Client, fetchExchange } from 'urql'
import { getNamedType } from 'graphql'
import DataLoader from 'dataloader'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import * as extractorDefinitions from './extractor/index'
import { merge } from '../utils/merge'
import { fetch } from './worker'
import database from './drizzle'
import {
  insertManyMedia,
  insertManyEpisode,
  findAllMedia,
  findAllAggregatedMedia,
  aggregateMediaHandles,
  insertManyAggregatedMedia,
  aggregateEpisodeHandles,
  findAllAggregatedEpisode,
  findAllEpisode,
  insertManyAggregatedEpisode,
} from './drizzle/utils'
import { aggregatedMediaEpisodesTable } from './drizzle/schema'
import groupAllRelatedMedia from './drizzle/sql/groupAllRelatedMedia'
import groupAllRelatedEpisodes from './drizzle/sql/groupAllRelatedEpisodes'

export type ExtractorServerContext = YogaInitialContext & {
  fetch: typeof fetch
}

export type ExtractorUserContext = {

}

const mediaInserter = new DataLoader<Media, Media>(async (medias) => {
  await database.transaction(async (tx) => {
    await insertManyMedia(tx, medias as Media[])
    const allMedia = await findAllMedia(tx)
    const allAggregatedMedia = await findAllAggregatedMedia(tx)

    const groups = await tx.all(groupAllRelatedMedia) as [string, number, string][]
    const allUpdatedAggregatedMedia = groups.map(([_, __, urisString]) => {
      const uris = urisString.split(',').map(uri => uri.trim())
      const medias =
        uris
          .map(uri => allMedia.find(r => r?.uri === uri))
          .filter((media): media is NonNullable<typeof media> => media !== null && media !== undefined)

      const existingMatch = allAggregatedMedia.find(existing => {
        const existingUris = existing.uri.slice('ag:('.length, -1).split(',')
        return existingUris.some(existingUri => uris.includes(existingUri))
      })

      return aggregateMediaHandles(medias, existingMatch)
    })
    await insertManyAggregatedMedia(tx, allUpdatedAggregatedMedia)
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
      const episodes =
        uris
          .map(uri => allEpisode.find(r => r?.uri === uri))
          .filter((episode): episode is NonNullable<typeof episode> => episode !== null && episode !== undefined)

      const existingMatch = allAggregatedEpisode.find(existing => {
        const existingUris = existing.uri.slice('ag:('.length, -1).split(',')
        return existingUris.some(existingUri => uris.includes(existingUri))
      })

      return aggregateEpisodeHandles(episodes, existingMatch)
    })

    // Insert aggregated episodes
    await insertManyAggregatedEpisode(tx, allUpdatedAggregatedEpisode)

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
          const aggregatedEpisode = allUpdatedAggregatedEpisode.find(ae => {
            const aggregatedUris = ae.uri.slice('ag:('.length, -1).split(',')
            return aggregatedUris.includes(episode.uri)
          })

          if (aggregatedEpisode) {
            aggregatedMediaEpisodeRelations.push({
              aggregatedMediaId: aggregatedMedia._id,
              aggregatedEpisodeId: aggregatedEpisode._id
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
        maskedErrors: false,
        schema: createSchema<Omit<ExtractorServerContext, keyof YogaInitialContext>>({
          typeDefs,
          resolvers:
            merge(
              {
                Media: {
                  _id: (parent) => parent.uri,
                  handles: (parent) => parent.handles ?? [],
                  descriptions: (parent) => parent.descriptions ?? [],
                  shortDescriptions: (parent) => parent.shortDescriptions ?? [],
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
                  media: { subscribe: async function* (_parent) { } },
                  mediaPage: { subscribe: async function* (_parent) { return [] } }
                }
              } satisfies Resolvers,
              extractor.resolvers
            ) as Resolvers
        }),
        plugins: [
          useResponseCache({ session: () => null, ttl: 15 * 60 * 1000 }),
          useErrorHandler(({ errors, context }) => {
            for (const error of errors) {
              console.error(new Error(`GQLError occurred on request: ${context.operationName}`, { cause: error }))
            }
          }),
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
                  }
                }
              ))
            }
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
