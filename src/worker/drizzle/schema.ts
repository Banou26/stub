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
export const media = sqliteTable('media', {
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
export const mediaTitle = sqliteTable('mediaTitle', {
  language: text('language').notNull(),
  title: text('title').notNull(),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.title] }),
}));

// MediaShortDescription table
export const mediaShortDescription = sqliteTable('mediaShortDescription', {
  language: text('language').notNull(),
  shortDescription: text('shortDescription').notNull(),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.shortDescription] }),
}));

// MediaDescription table
export const mediaDescription = sqliteTable('mediaDescription', {
  language: text('language').notNull(),
  description: text('description').notNull(),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.description] }),
}));

// MediaTrailer table
export const mediaTrailer = sqliteTable('mediaTrailer', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  language: text('language').notNull(),
  thumbnail: text('thumbnail'),
  mediaUri: text('mediaUri').references(() => media.uri),
});

// MediaCover table
export const mediaCover = sqliteTable('mediaCover', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
}));

// MediaBanner table
export const mediaBanner = sqliteTable('mediaBanner', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
}));

// Episode table
export const episode = sqliteTable('episode', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  aggregated: integer('aggregated', { mode: 'boolean' }).default(false).notNull(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  relativeNumber: integer('relativeNumber'),
  absoluteNumber: integer('absoluteNumber'),
  mediaUri: text('mediaUri').references(() => media.uri),
}, (table) => ({
  uriIdx: index('episode_uri_idx').on(table.uri),
  originIdIdx: index('episode_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('episode_origin_id_unique').on(table.origin, table.id),
}));

// EpisodeTitle table
export const episodeTitle = sqliteTable('episodeTitle', {
  language: text('language').notNull(),
  title: text('title').notNull(),
  episodeUri: text('episodeUri').references(() => episode.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.title] }),
}));

// EpisodeShortDescription table
export const episodeShortDescription = sqliteTable('episodeShortDescription', {
  language: text('language').notNull(),
  shortDescription: text('shortDescription').notNull(),
  episodeUri: text('episodeUri').references(() => episode.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.shortDescription] }),
}));

// EpisodeDescription table
export const episodeDescription = sqliteTable('episodeDescription', {
  language: text('language').notNull(),
  description: text('description').notNull(),
  episodeUri: text('episodeUri').references(() => episode.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.description] }),
}));

// EpisodeThumbnail table
export const episodeThumbnail = sqliteTable('episodeThumbnail', {
  language: text('language').notNull(),
  url: text('url').notNull(),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
  episodeUri: text('episodeUri').references(() => episode.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.language, table.url] }),
}));

// PlaybackSource table
export const playbackSource = sqliteTable('playbackSource', {
  uri: text('uri').primaryKey().unique().notNull(),
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  type: text('type').notNull().$type<PlaybackSourceType>(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
  episodeUri: text('episodeUri').references(() => episode.uri),
}, (table) => ({
  uriIdx: index('playbackSource_uri_idx').on(table.uri),
  originIdIdx: index('playbackSource_origin_id_idx').on(table.origin, table.id),
  originIdUnique: uniqueIndex('playbackSource_origin_id_unique').on(table.origin, table.id),
}));

// Junction table for Media handles (self-referencing many-to-many)
export const mediaHandles = sqliteTable('mediaHandles', {
  mediaUri: text('mediaUri').notNull().references(() => media.uri),
  handleUri: text('handleUri').notNull().references(() => media.uri),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.handleUri] }),
}));

// Relations
export const mediaRelations = relations(media, ({ many }) => ({
  titles: many(mediaTitle),
  shortDescriptions: many(mediaShortDescription),
  descriptions: many(mediaDescription),
  trailers: many(mediaTrailer),
  covers: many(mediaCover),
  banners: many(mediaBanner),
  episodes: many(episode),
  handles: many(mediaHandles, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandles, {
    relationName: 'handleOf',
  }),
}));

export const mediaTitleRelations = relations(mediaTitle, ({ one }) => ({
  media: one(media, {
    fields: [mediaTitle.mediaUri],
    references: [media.uri],
  }),
}));

export const mediaShortDescriptionRelations = relations(mediaShortDescription, ({ one }) => ({
  media: one(media, {
    fields: [mediaShortDescription.mediaUri],
    references: [media.uri],
  }),
}));

export const mediaDescriptionRelations = relations(mediaDescription, ({ one }) => ({
  media: one(media, {
    fields: [mediaDescription.mediaUri],
    references: [media.uri],
  }),
}));

export const mediaTrailerRelations = relations(mediaTrailer, ({ one }) => ({
  media: one(media, {
    fields: [mediaTrailer.mediaUri],
    references: [media.uri],
  }),
}));

export const mediaCoverRelations = relations(mediaCover, ({ one }) => ({
  media: one(media, {
    fields: [mediaCover.mediaUri],
    references: [media.uri],
  }),
}));

export const mediaBannerRelations = relations(mediaBanner, ({ one }) => ({
  media: one(media, {
    fields: [mediaBanner.mediaUri],
    references: [media.uri],
  }),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  media: one(media, {
    fields: [episode.mediaUri],
    references: [media.uri],
  }),
  titles: many(episodeTitle),
  shortDescriptions: many(episodeShortDescription),
  descriptions: many(episodeDescription),
  thumbnails: many(episodeThumbnail),
  playbackSources: many(playbackSource),
}));

export const episodeTitleRelations = relations(episodeTitle, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeTitle.episodeUri],
    references: [episode.uri],
  }),
}));

export const episodeShortDescriptionRelations = relations(episodeShortDescription, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeShortDescription.episodeUri],
    references: [episode.uri],
  }),
}));

export const episodeDescriptionRelations = relations(episodeDescription, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeDescription.episodeUri],
    references: [episode.uri],
  }),
}));

export const episodeThumbnailRelations = relations(episodeThumbnail, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeThumbnail.episodeUri],
    references: [episode.uri],
  }),
}));

export const playbackSourceRelations = relations(playbackSource, ({ one }) => ({
  episode: one(episode, {
    fields: [playbackSource.episodeUri],
    references: [episode.uri],
  }),
}));

export const mediaHandlesRelations = relations(mediaHandles, ({ one }) => ({
  media: one(media, {
    fields: [mediaHandles.mediaUri],
    references: [media.uri],
    relationName: 'handles',
  }),
  handle: one(media, {
    fields: [mediaHandles.handleUri],
    references: [media.uri],
    relationName: 'handleOf',
  }),
}));

// Type exports for better TypeScript support
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Episode = typeof episode.$inferSelect;
export type NewEpisode = typeof episode.$inferInsert;
export type PlaybackSource = typeof playbackSource.$inferSelect;
export type NewPlaybackSource = typeof playbackSource.$inferInsert;
