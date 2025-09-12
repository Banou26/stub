import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, real } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// Enums (SQLite doesn't have native enums, so we use text with check constraints)
export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export type MediaType = typeof mediaTypeEnum[number]

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const
export type MediaStatus = typeof mediaStatusEnum[number]

export const notifyTable = sqliteTable('notify', {
  id: integer('id').primaryKey().unique().notNull(),
  tableName: text('tableName').notNull(),
  columnId: text('columnId').notNull(),
  rowId: text('rowId').notNull(),
  operation: text('operation').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull()
})

const mediaBaseSchema = {
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  score: real('score'),
  type: text('type').$type<MediaType>(),
  status: text('status').$type<MediaStatus>(),
  titles: text('titles', { mode: 'json' }).$type<{ language: string, title: string, score?: number | null }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string, description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string, shortDescription: string }[]>(),
  trailers: text('trailers', { mode: 'json' }).$type<{ uri: string, origin: string, id: string, url?: string, language?: string, thumbnail?: string }[]>(),
  covers: text('covers', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  banners: text('banners', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  externalLinks: text('externalLinks'),
  averageScore: integer('averageScore'),
  popularity: integer('popularity'),
  startDate: integer('startDate', { mode: 'timestamp' }),
  endDate: integer('endDate', { mode: 'timestamp' }),
  isAdult: integer('isAdult', { mode: 'boolean' }),
  episodeCount: integer('episodeCount'),
} satisfies Record<string, SQLiteColumnBuilderBase>

// Media table with JSON fields for content
export const mediaTable = sqliteTable('media', {
  ...mediaBaseSchema,
  uri: text('uri').primaryKey().unique().notNull()
}, (table) => ({
  uriIdx: index('media_uri_idx').on(table.uri)
}))

// Aggregated Media table with _id as primary key
export const aggregatedMediaTable = sqliteTable('aggregatedMedia', {
  ...mediaBaseSchema,
  _id: text('_id').primaryKey().unique().notNull(),
  uri: text('uri').notNull()
}, (table) => ({
  _idIdx: index('aggregatedMedia_id_idx').on(table._id),
  uriIdx: index('aggregatedMedia_uri_idx').on(table.uri)
}))

// Junction table for Media handles (self-referencing many-to-many)
export const mediaHandlesTable = sqliteTable('mediaHandles', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  handleUri: text('handleUri').notNull().references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.handleUri] }),
  mediaUriIdx: index('mediaHandles_mediaUri_idx').on(table.mediaUri),
  handleUriIdx: index('mediaHandles_handleUri_idx').on(table.handleUri),
  // Composite index for bi-directional lookups
  handleMediaIdx: index('mediaHandles_handle_media_idx').on(table.handleUri, table.mediaUri),
}))

// Media relations
export const mediaRelations = relations(mediaTable, ({ many }) => ({
  episodes: many(mediaEpisodesTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
}))

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

const episodeBaseSchema = {
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  titles: text('titles', { mode: 'json' }).$type<{ language: string, title: string }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string, description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string, shortDescription: string }[]>(),
  thumbnails: text('thumbnails', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  seasonNumber: integer('seasonNumber'),
  episodeNumber: integer('episodeNumber'),
  absoluteEpisodeNumber: integer('absoluteEpisodeNumber')
}

// Episode table with JSON fields for content
export const episodeTable = sqliteTable('episode', {
  ...episodeBaseSchema,
  uri: text('uri').primaryKey().unique().notNull()
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri)
}))

// Aggregated Episode table with _id as primary key
export const aggregatedEpisodeTable = sqliteTable('aggregatedEpisode', {
    ...episodeBaseSchema,
  _id: text('_id').primaryKey().unique().notNull(),
  uri: text('uri').notNull()
}, (table) => ({
  _idIdx: index('aggregatedEpisode_id_idx').on(table._id),
  uriIdx: index('aggregatedEpisode_uri_idx').on(table.uri)
}))

// Junction table for Media<->Episode many-to-many
export const mediaEpisodesTable = sqliteTable('mediaEpisodes', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.episodeUri] }),
  mediaIdx: index('mediaEpisodes_mediaUri_idx').on(table.mediaUri),
  episodeIdx: index('mediaEpisodes_episodeUri_idx').on(table.episodeUri),
}))

// Junction table for AggregatedMedia<->AggregatedEpisode many-to-many
export const aggregatedMediaEpisodesTable = sqliteTable('aggregatedMediaEpisodes', {
  aggregatedMediaId: text('aggregatedMediaId').notNull().references(() => aggregatedMediaTable._id),
  aggregatedEpisodeId: text('aggregatedEpisodeId').notNull().references(() => aggregatedEpisodeTable._id),
}, (table) => ({
  pk: primaryKey({ columns: [table.aggregatedMediaId, table.aggregatedEpisodeId] }),
  mediaIdx: index('aggregatedMediaEpisodes_aggregatedMediaId_idx').on(table.aggregatedMediaId),
  episodeIdx: index('aggregatedMediaEpisodes_aggregatedEpisodeId_idx').on(table.aggregatedEpisodeId),
}))

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

// Junction table for aggregatedEpisode -> episode handles
export const episodeHandlesTable = sqliteTable('episodeHandles', {
  aggregatedEpisodeId: text('aggregatedEpisodeId').notNull().references(() => aggregatedEpisodeTable._id),
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.aggregatedEpisodeId, table.episodeUri] }),
  aggregatedEpisodeIdIdx: index('episodeHandles_aggregatedEpisodeId_idx').on(table.aggregatedEpisodeId),
  episodeUriIdx: index('episodeHandles_episodeUri_idx').on(table.episodeUri),
  // Composite index for bi-directional lookups
  handleEpisodeIdx: index('episodeHandles_handle_episode_idx').on(table.episodeUri, table.aggregatedEpisodeId),
}))

export const episodeRelations = relations(episodeTable, ({ many }) => ({
  mediaEpisodes: many(mediaEpisodesTable),
  aggregatedEpisodes: many(episodeHandlesTable),
}))

// Aggregated Episode relations
export const aggregatedEpisodeRelations = relations(aggregatedEpisodeTable, ({ many }) => ({
  handles: many(episodeHandlesTable),
  aggregatedMediaEpisodes: many(aggregatedMediaEpisodesTable),
}))

export const episodeHandlesRelations = relations(episodeHandlesTable, ({ one }) => ({
  aggregatedEpisode: one(aggregatedEpisodeTable, {
    fields: [episodeHandlesTable.aggregatedEpisodeId],
    references: [aggregatedEpisodeTable._id],
  }),
  episode: one(episodeTable, {
    fields: [episodeHandlesTable.episodeUri],
    references: [episodeTable.uri],
  }),
}))

// Type exports for better TypeScript support
export type ChangeNotification = typeof notifyTable.$inferSelect
export type Media = typeof mediaTable.$inferSelect
export type CreateMedia = typeof mediaTable.$inferInsert
export type AggregatedMedia = typeof aggregatedMediaTable.$inferSelect
export type CreateAggregatedMedia = typeof aggregatedMediaTable.$inferInsert
export type Episode = typeof episodeTable.$inferSelect
export type CreateEpisode = typeof episodeTable.$inferInsert
export type AggregatedEpisode = typeof aggregatedEpisodeTable.$inferSelect
export type CreateAggregatedEpisode = typeof aggregatedEpisodeTable.$inferInsert
export type MediaEpisodes = typeof mediaEpisodesTable.$inferSelect
export type CreateMediaEpisodes = typeof mediaEpisodesTable.$inferInsert
export type AggregatedMediaEpisodes = typeof aggregatedMediaEpisodesTable.$inferSelect
export type CreateAggregatedMediaEpisodes = typeof aggregatedMediaEpisodesTable.$inferInsert
export type MediaHandles = typeof mediaHandlesTable.$inferSelect
export type CreateMediaHandles = typeof mediaHandlesTable.$inferInsert
export type EpisodeHandles = typeof episodeHandlesTable.$inferSelect
export type CreateEpisodeHandles = typeof episodeHandlesTable.$inferInsert
