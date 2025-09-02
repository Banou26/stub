import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, real } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// Enums (SQLite doesn't have native enums, so we use text with check constraints)
export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export type MediaType = typeof mediaTypeEnum[number]

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const
export type MediaStatus = typeof mediaStatusEnum[number]

export const playbackSourceTypeEnum = ['IFRAME', 'CUSTOM', 'OTHER'] as const
export type PlaybackSourceType = typeof playbackSourceTypeEnum[number]

export const notifyTable = sqliteTable('notify', {
  id: integer('id').primaryKey().unique().notNull(),
  tableName: text('tableName').notNull(),
  rowId: text('rowId').notNull(),
  operation: text('operation').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull()
})

// Media table with JSON fields for content
export const mediaTable = sqliteTable('media', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  score: real('uri'),
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
  originIdIdx: index('media_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('media_origin_id_unique').on(table.origin, table.id),
}))

// Episode table with JSON fields for content
export const episodeTable = sqliteTable('episode', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).notNull(),
  titles: text('titles', { mode: 'json' }).$type<{ language: string, title: string }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string, description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string, shortDescription: string }[]>(),
  thumbnails: text('thumbnails', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  relativeNumber: integer('relativeNumber'),
  absoluteNumber: integer('absoluteNumber'),
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri),
  originIdIdx: index('episode_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('episode_origin_id_unique').on(table.origin, table.id),
}))

// PlaybackSource table
export const playbackSourceTable = sqliteTable('playbackSource', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  type: text('type').notNull().$type<PlaybackSourceType>(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
}, (table) => ({
  uriIdx: index('playbackSource_uri_idx').on(table.uri),
  originIdIdx: index('playbackSource_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('playbackSource_origin_id_unique').on(table.origin, table.id),
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

// Junction table for Episode<->PlaybackSource many-to-many
export const episodePlaybackSourcesTable = sqliteTable('episodePlaybackSources', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  playbackSourceUri: text('playbackSourceUri').notNull().references(() => playbackSourceTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.playbackSourceUri] }),
  episodeIdx: index('episodePlaybackSources_episodeUri_idx').on(table.episodeUri),
  playbackSourceIdx: index('episodePlaybackSources_playbackSourceUri_idx').on(table.playbackSourceUri),
}))

// Junction table for Media handles (self-referencing many-to-many)
export const mediaHandlesTable = sqliteTable('mediaHandles', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  handleUri: text('handleUri').notNull().references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.handleUri] }),
}))

// Relations
export const mediaRelations = relations(mediaTable, ({ many }) => ({
  episodes: many(mediaEpisodesTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
}))

export const episodeRelations = relations(episodeTable, ({ many }) => ({
  mediaEpisodes: many(mediaEpisodesTable),
  episodePlaybackSources: many(episodePlaybackSourcesTable),
}))

export const playbackSourceRelations = relations(playbackSourceTable, ({ many }) => ({
  episodePlaybackSources: many(episodePlaybackSourcesTable),
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

export const episodePlaybackSourcesRelations = relations(episodePlaybackSourcesTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodePlaybackSourcesTable.episodeUri],
    references: [episodeTable.uri],
  }),
  playbackSource: one(playbackSourceTable, {
    fields: [episodePlaybackSourcesTable.playbackSourceUri],
    references: [playbackSourceTable.uri],
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

// Type exports for better TypeScript support
export type ChangeNotification = typeof notifyTable.$inferSelect
export type Media = typeof mediaTable.$inferSelect
export type CreateMedia = typeof mediaTable.$inferInsert
export type Episode = typeof episodeTable.$inferSelect
export type CreateEpisode = typeof episodeTable.$inferInsert
export type PlaybackSource = typeof playbackSourceTable.$inferSelect
export type CreatePlaybackSource = typeof playbackSourceTable.$inferInsert
export type MediaEpisodes = typeof mediaEpisodesTable.$inferSelect
export type CreateMediaEpisodes = typeof mediaEpisodesTable.$inferInsert
export type EpisodePlaybackSources = typeof episodePlaybackSourcesTable.$inferSelect
export type CreateEpisodePlaybackSources = typeof episodePlaybackSourcesTable.$inferInsert
export type MediaHandles = typeof mediaHandlesTable.$inferSelect
export type CreateMediaHandles = typeof mediaHandlesTable.$inferInsert
