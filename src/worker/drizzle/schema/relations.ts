import { relations } from 'drizzle-orm'
import { mediaTable, aggregatedMediaTable } from './media'
import { episodeTable, aggregatedEpisodeTable } from './episodes'
import {
  mediaHandlesTable,
  mediaEpisodesTable,
  aggregatedMediaEpisodesTable,
  aggregatedMediaHandlesTable,
  episodeHandlesTable,
  aggregatedEpisodeHandlesTable
} from './junctions'

// Media relations
export const mediaRelations = relations(mediaTable, ({ many }) => ({
  episodes: many(mediaEpisodesTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
  aggregatedBy: many(aggregatedMediaHandlesTable),
}))

// Aggregated Media relations
export const aggregatedMediaRelations = relations(aggregatedMediaTable, ({ many }) => ({
  handles: many(aggregatedMediaHandlesTable),
  episodes: many(aggregatedMediaEpisodesTable),
}))

// Episode relations
export const episodeRelations = relations(episodeTable, ({ many }) => ({
  mediaEpisodes: many(mediaEpisodesTable),
  handles: many(episodeHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(episodeHandlesTable, {
    relationName: 'handleOf',
  }),
  aggregatedBy: many(aggregatedEpisodeHandlesTable),
}))

// Aggregated Episode relations
export const aggregatedEpisodeRelations = relations(aggregatedEpisodeTable, ({ many }) => ({
  handles: many(aggregatedEpisodeHandlesTable),
  aggregatedMediaEpisodes: many(aggregatedMediaEpisodesTable),
}))

// Media handles relations
export const mediaHandlesRelations = relations(mediaHandlesTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaHandlesTable.mediaUri],
    references: [mediaTable.uri],
    relationName: 'handles',
  }),
  handle: one(mediaTable, {
    fields: [mediaHandlesTable.handleUri],
    references: [mediaTable.uri],
    relationName: 'handleOf',
  }),
}))

// Media episodes relations
export const mediaEpisodesRelations = relations(mediaEpisodesTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaEpisodesTable.mediaUri],
    references: [mediaTable.uri],
  }),
  episode: one(episodeTable, {
    fields: [mediaEpisodesTable.episodeUri],
    references: [episodeTable.uri],
  }),
}))

// Aggregated media episodes relations
export const aggregatedMediaEpisodesRelations = relations(aggregatedMediaEpisodesTable, ({ one }) => ({
  aggregatedMedia: one(aggregatedMediaTable, {
    fields: [aggregatedMediaEpisodesTable.aggregatedMediaId],
    references: [aggregatedMediaTable._id],
  }),
  aggregatedEpisode: one(aggregatedEpisodeTable, {
    fields: [aggregatedMediaEpisodesTable.aggregatedEpisodeId],
    references: [aggregatedEpisodeTable._id],
  }),
}))

// Aggregated media handles relations
export const aggregatedMediaHandlesRelations = relations(aggregatedMediaHandlesTable, ({ one }) => ({
  aggregatedMedia: one(aggregatedMediaTable, {
    fields: [aggregatedMediaHandlesTable.aggregatedMediaId],
    references: [aggregatedMediaTable._id],
  }),
  media: one(mediaTable, {
    fields: [aggregatedMediaHandlesTable.mediaUri],
    references: [mediaTable.uri],
  }),
}))

// Episode handles relations
export const episodeHandlesRelations = relations(episodeHandlesTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeHandlesTable.episodeUri],
    references: [episodeTable.uri],
    relationName: 'handles',
  }),
  handle: one(episodeTable, {
    fields: [episodeHandlesTable.handleUri],
    references: [episodeTable.uri],
    relationName: 'handleOf',
  }),
}))

// Aggregated episode handles relations
export const aggregatedEpisodeHandlesRelations = relations(aggregatedEpisodeHandlesTable, ({ one }) => ({
  aggregatedEpisode: one(aggregatedEpisodeTable, {
    fields: [aggregatedEpisodeHandlesTable.aggregatedEpisodeId],
    references: [aggregatedEpisodeTable._id],
  }),
  episode: one(episodeTable, {
    fields: [aggregatedEpisodeHandlesTable.episodeUri],
    references: [episodeTable.uri],
  }),
}))