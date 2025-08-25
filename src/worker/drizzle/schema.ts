import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums (SQLite doesn't have native enums, so we use text with check constraints)
export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const;
export type MediaType = typeof mediaTypeEnum[number];

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const;
export type MediaStatus = typeof mediaStatusEnum[number];

export const playbackSourceTypeEnum = ['IFRAME', 'CUSTOM', 'OTHER'] as const;
export type PlaybackSourceType = typeof playbackSourceTypeEnum[number];

// Media table
export const mediaTable = sqliteTable('media', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).default(false),
  type: text('type').$type<MediaType>(),
  status: text('status').$type<MediaStatus>(),
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

// MediaTitle table
export const mediaTitleTable = sqliteTable('mediaTitle', {
  language: text('language').notNull(),
  title: text('title').notNull(),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.title] }),
}));

// MediaShortDescription table
export const mediaShortDescriptionTable = sqliteTable('mediaShortDescription', {
  language: text('language').notNull(),
  shortDescription: text('shortDescription').notNull(),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.shortDescription] }),
}));

// MediaDescription table
export const mediaDescriptionTable = sqliteTable('mediaDescription', {
  language: text('language').notNull(),
  description: text('description').notNull(),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.description] }),
}));

// MediaTrailer table
export const mediaTrailerTable = sqliteTable('mediaTrailer', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  language: text('language').notNull(),
  thumbnail: text('thumbnail'),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
});

// MediaCover table
export const mediaCoverTable = sqliteTable('mediaCover', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
}));

// MediaBanner table
export const mediaBannerTable = sqliteTable('mediaBanner', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
}));

// Episode table
export const episodeTable = sqliteTable('episode', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).default(false).notNull(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  relativeNumber: integer('relativeNumber'),
  absoluteNumber: integer('absoluteNumber'),
  mediaUri: text('mediaUri').references(() => mediaTable.uri),
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri),
  originIdIdx: index('episode_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('episode_origin_id_unique').on(table.origin, table.id),
}));

// EpisodeTitle table
export const episodeTitleTable = sqliteTable('episodeTitle', {
  language: text('language').notNull(),
  title: text('title').notNull(),
  episodeUri: text('episodeUri').references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.title] }),
}));

// EpisodeShortDescription table
export const episodeShortDescriptionTable = sqliteTable('episodeShortDescription', {
  language: text('language').notNull(),
  shortDescription: text('shortDescription').notNull(),
  episodeUri: text('episodeUri').references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.shortDescription] }),
}));

// EpisodeDescription table
export const episodeDescriptionTable = sqliteTable('episodeDescription', {
  language: text('language').notNull(),
  description: text('description').notNull(),
  episodeUri: text('episodeUri').references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.description] }),
}));

// EpisodeThumbnail table
export const episodeThumbnailTable = sqliteTable('episodeThumbnail', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  episodeUri: text('episodeUri').references(() => episodeTable.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
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
  titles: many(mediaTitleTable),
  shortDescriptions: many(mediaShortDescriptionTable),
  descriptions: many(mediaDescriptionTable),
  trailers: many(mediaTrailerTable),
  covers: many(mediaCoverTable),
  banners: many(mediaBannerTable),
  episodes: many(episodeTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
}));

export const mediaTitleRelations = relations(mediaTitleTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaTitleTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const mediaShortDescriptionRelations = relations(mediaShortDescriptionTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaShortDescriptionTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const mediaDescriptionRelations = relations(mediaDescriptionTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaDescriptionTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const mediaTrailerRelations = relations(mediaTrailerTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaTrailerTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const mediaCoverRelations = relations(mediaCoverTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaCoverTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const mediaBannerRelations = relations(mediaBannerTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaBannerTable.mediaUri],
    references: [mediaTable.uri],
  }),
}));

export const episodeRelations = relations(episodeTable, ({ one, many }) => ({
  media: one(mediaTable, {
    fields: [episodeTable.mediaUri],
    references: [mediaTable.uri],
  }),
  titles: many(episodeTitleTable),
  shortDescriptions: many(episodeShortDescriptionTable),
  descriptions: many(episodeDescriptionTable),
  thumbnails: many(episodeThumbnailTable),
  playbackSources: many(playbackSourceTable),
}));

export const episodeTitleRelations = relations(episodeTitleTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeTitleTable.episodeUri],
    references: [episodeTable.uri],
  }),
}));

export const episodeShortDescriptionRelations = relations(episodeShortDescriptionTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeShortDescriptionTable.episodeUri],
    references: [episodeTable.uri],
  }),
}));

export const episodeDescriptionRelations = relations(episodeDescriptionTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeDescriptionTable.episodeUri],
    references: [episodeTable.uri],
  }),
}));

export const episodeThumbnailRelations = relations(episodeThumbnailTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeThumbnailTable.episodeUri],
    references: [episodeTable.uri],
  }),
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
export type MediaTitle = typeof mediaTitleTable.$inferSelect;
export type CreateMediaTitle = typeof mediaTitleTable.$inferInsert;
export type MediaDescription = typeof mediaDescriptionTable.$inferSelect;
export type CreateMediaDescription = typeof mediaDescriptionTable.$inferInsert;
export type MediaShortDescription = typeof mediaShortDescriptionTable.$inferSelect;
export type CreateMediaShortDescription = typeof mediaShortDescriptionTable.$inferInsert;
export type MediaTrailer = typeof mediaTrailerTable.$inferSelect;
export type CreateMediaTrailer = typeof mediaTrailerTable.$inferInsert;
export type MediaCover = typeof mediaCoverTable.$inferSelect;
export type CreateMediaCover = typeof mediaCoverTable.$inferInsert;
export type MediaBanner = typeof mediaBannerTable.$inferSelect;
export type CreateMediaBanner = typeof mediaBannerTable.$inferInsert;
export type Episode = typeof episodeTable.$inferSelect;
export type CreateEpisode = typeof episodeTable.$inferInsert;
export type EpisodeTitle = typeof episodeTitleTable.$inferSelect;
export type CreateEpisodeTitle = typeof episodeTitleTable.$inferInsert;
export type EpisodeDescription = typeof episodeDescriptionTable.$inferSelect;
export type CreateEpisodeDescription = typeof episodeDescriptionTable.$inferInsert;
export type EpisodeShortDescription = typeof episodeShortDescriptionTable.$inferSelect;
export type CreateEpisodeShortDescription = typeof episodeShortDescriptionTable.$inferInsert;
export type EpisodeThumbnail = typeof episodeThumbnailTable.$inferSelect;
export type CreateEpisodeThumbnail = typeof episodeThumbnailTable.$inferInsert;
export type PlaybackSource = typeof playbackSourceTable.$inferSelect;
export type CreatePlaybackSource = typeof playbackSourceTable.$inferInsert;
