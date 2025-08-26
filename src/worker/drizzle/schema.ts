import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums (SQLite doesn't have native enums, so we use text with check constraints)
export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const;
export type MediaType = typeof mediaTypeEnum[number];

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const;
export type MediaStatus = typeof mediaStatusEnum[number];

export const playbackSourceTypeEnum = ['IFRAME', 'CUSTOM', 'OTHER'] as const;
export type PlaybackSourceType = typeof playbackSourceTypeEnum[number];

// Media table with JSON fields for content
export const mediaTable = sqliteTable('media', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).default(false),
  type: text('type').$type<MediaType>(),
  status: text('status').$type<MediaStatus>(),
  titles: text('titles', { mode: 'json' }).$type<{ language: string; title: string }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string; description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string; shortDescription: string }[]>(),
  trailers: text('trailers', { mode: 'json' }).$type<{ uri: string; origin: string; id: string; url?: string; language: string; thumbnail?: string }[]>(),
  covers: text('covers', { mode: 'json' }).$type<{ language?: string; url: string; height?: number; width?: number; color?: string }[]>(),
  banners: text('banners', { mode: 'json' }).$type<{ language?: string; url: string; height?: number; width?: number; color?: string }[]>(),
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
}));

// Episode table with JSON fields for content
export const episodeTable = sqliteTable('episode', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).default(false).notNull(),
  titles: text('titles', { mode: 'json' }).$type<{ language: string; title: string }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string; description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string; shortDescription: string }[]>(),
  thumbnails: text('thumbnails', { mode: 'json' }).$type<{ language?: string; url: string; height?: number; width?: number; color?: string }[]>(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  relativeNumber: integer('relativeNumber'),
  absoluteNumber: integer('absoluteNumber'),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri),
  originIdIdx: index('episode_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('episode_origin_id_unique').on(table.origin, table.id),
}));

// PlaybackSource table
export const playbackSourceTable = sqliteTable('playbackSource', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  type: text('type').notNull().$type<PlaybackSourceType>(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
  episodeUri: text('episodeUri').references(() => episodeTable.uri),
}, (table) => ({
  uriIdx: index('playbackSource_uri_idx').on(table.uri),
  originIdIdx: index('playbackSource_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('playbackSource_origin_id_unique').on(table.origin, table.id),
}));

// Junction table for Media handles (self-referencing many-to-many)
export const mediaHandlesTable = sqliteTable('mediaHandles', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  handleUri: text('handleUri').notNull().references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.handleUri] }),
}));

// Relations
export const mediaRelations = relations(mediaTable, ({ many }) => ({
  episodes: many(episodeTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
}));

export const episodeRelations = relations(episodeTable, ({ one, many }) => ({
  media: one(mediaTable, {
    fields: [episodeTable.mediaUri],
    references: [mediaTable.uri],
  }),
  playbackSources: many(playbackSourceTable),
}));

export const playbackSourceRelations = relations(playbackSourceTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [playbackSourceTable.episodeUri],
    references: [episodeTable.uri],
  }),
}));

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
}));

// Type exports for better TypeScript support
export type Media = typeof mediaTable.$inferSelect;
export type CreateMedia = typeof mediaTable.$inferInsert;
export type Episode = typeof episodeTable.$inferSelect;
export type CreateEpisode = typeof episodeTable.$inferInsert;
export type PlaybackSource = typeof playbackSourceTable.$inferSelect;
export type CreatePlaybackSource = typeof playbackSourceTable.$inferInsert;
export type MediaHandles = typeof mediaHandlesTable.$inferSelect;
export type CreateMediaHandles = typeof mediaHandlesTable.$inferInsert;