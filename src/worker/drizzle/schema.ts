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

// Media table with JSON fields for content
export const mediaTable = sqliteTable('media', {
  _id: text('_id').notNull().default(sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`),
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  score: real('score'),
  aggregated: integer('aggregated', { mode: 'boolean' }),
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
}, (table) => ({
  uriIdx: index('media_uri_idx').on(table.uri),
  originIdx: index('media_origin_idx').on(table.origin),
  originIdIdx: index('media_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('media_origin_id_unique').on(table.origin, table.id),
  aggregatedIdx: index('media_aggregated_idx').on(table.aggregated),
  _idIdx: index('media_stable_id_idx').on(table._id),
  // _idUnique: uniqueIndex('media_stable_id_unique').on(table._id),
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

// Episode table with JSON fields for content
export const episodeTable = sqliteTable('episode', {
  _id: text('_id').notNull().default(sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`),
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  mediaUri: text('mediaUri').notNull(),
  aggregated: integer('aggregated', { mode: 'boolean' }),
  titles: text('titles', { mode: 'json' }).$type<{ language: string, title: string }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string, description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string, shortDescription: string }[]>(),
  thumbnails: text('thumbnails', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  seasonNumber: integer('seasonNumber'),
  episodeNumber: integer('episodeNumber'),
  absoluteEpisodeNumber: integer('absoluteEpisodeNumber')
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri),
  originIdx: index('episode_origin_idx').on(table.origin),
  originIdIdx: index('episode_origin_id_idx').on(table.origin, table.id),
  aggregatedIdx: index('episode_aggregated_idx').on(table.aggregated),
  originIdUnique: uniqueIndex('episode_origin_id_unique').on(table.origin, table.id),
  _idIdx: index('episode_stable_id_idx').on(table._id),
  mediaUriIdx: index('episode_media_uri_idx').on(table.mediaUri),
  // _idUnique: uniqueIndex('episode_stable_id_unique').on(table._id),
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

// Junction table for Media handles (self-referencing many-to-many)
export const episodeHandlesTable = sqliteTable('episodeHandles', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  handleUri: text('handleUri').notNull().references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.handleUri] }),
  episodeUriIdx: index('episodeHandles_episodeUri_idx').on(table.episodeUri),
  handleUriIdx: index('episodeHandles_handleUri_idx').on(table.handleUri),
  // Composite index for bi-directional lookups
  handleMediaIdx: index('episodeHandles_handle_episode_idx').on(table.handleUri, table.episodeUri),
}))

export const episodeRelations = relations(episodeTable, ({ many }) => ({
  mediaEpisodes: many(mediaEpisodesTable),
  handles: many(episodeHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(episodeHandlesTable, {
    relationName: 'handleOf',
  }),
}))

// Type exports for better TypeScript support
export type ChangeNotification = typeof notifyTable.$inferSelect
export type Media = typeof mediaTable.$inferSelect
export type CreateMedia = typeof mediaTable.$inferInsert
export type Episode = typeof episodeTable.$inferSelect
export type CreateEpisode = typeof episodeTable.$inferInsert
export type MediaEpisodes = typeof mediaEpisodesTable.$inferSelect
export type CreateMediaEpisodes = typeof mediaEpisodesTable.$inferInsert
export type MediaHandles = typeof mediaHandlesTable.$inferSelect
export type CreateMediaHandles = typeof mediaHandlesTable.$inferInsert
