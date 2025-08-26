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

// Shared content tables that can be referenced by multiple media instances

// Titles table (shared across multiple media)
export const titlesTable = sqliteTable('titles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  language: text('language').notNull(),
  title: text('title').notNull(),
}, (table) => ({
  uniqueTitle: uniqueIndex('titles_language_title_unique').on(table.language, table.title),
}));

// MediaTitle junction table
export const mediaTitleTable = sqliteTable('mediaTitle', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  titleId: integer('titleId').notNull().references(() => titlesTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.titleId] }),
  mediaUriIdx: index('mediaTitle_mediaUri_idx').on(table.mediaUri),
  titleIdIdx: index('mediaTitle_titleId_idx').on(table.titleId),
}))

// Short descriptions table (shared across multiple media)
export const shortDescriptionsTable = sqliteTable('shortDescriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  language: text('language').notNull(),
  shortDescription: text('shortDescription').notNull(),
}, (table) => ({
  uniqueShortDesc: uniqueIndex('shortDescriptions_language_desc_unique').on(table.language, table.shortDescription),
}));

// MediaShortDescription junction table
export const mediaShortDescriptionTable = sqliteTable('mediaShortDescription', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  shortDescriptionId: integer('shortDescriptionId').notNull().references(() => shortDescriptionsTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.shortDescriptionId] }),
  mediaUriIdx: index('mediaShortDesc_mediaUri_idx').on(table.mediaUri),
  shortDescIdIdx: index('mediaShortDesc_shortDescId_idx').on(table.shortDescriptionId),
}))

// Descriptions table (shared across multiple media)
export const descriptionsTable = sqliteTable('descriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  language: text('language').notNull(),
  description: text('description').notNull(),
}, (table) => ({
  uniqueDesc: uniqueIndex('descriptions_language_desc_unique').on(table.language, table.description),
}));

// MediaDescription junction table
export const mediaDescriptionTable = sqliteTable('mediaDescription', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  descriptionId: integer('descriptionId').notNull().references(() => descriptionsTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.descriptionId] }),
  mediaUriIdx: index('mediaDesc_mediaUri_idx').on(table.mediaUri),
  descIdIdx: index('mediaDesc_descId_idx').on(table.descriptionId),
}))

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

// Images table (shared for covers, banners, thumbnails)
export const imagesTable = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  language: text('language'),
  height: integer('height'),
  width: integer('width'),
  color: text('color'),
}, (table) => ({
  uniqueImage: uniqueIndex('images_url_unique').on(table.url),
}));

// MediaCover junction table
export const mediaCoverTable = sqliteTable('mediaCover', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  imageId: integer('imageId').notNull().references(() => imagesTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.imageId] }),
  mediaUriIdx: index('mediaCover_mediaUri_idx').on(table.mediaUri),
  imageIdIdx: index('mediaCover_imageId_idx').on(table.imageId),
}))

// MediaBanner junction table
export const mediaBannerTable = sqliteTable('mediaBanner', {
  mediaUri: text('mediaUri').notNull().references(() => mediaTable.uri),
  imageId: integer('imageId').notNull().references(() => imagesTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.imageId] }),
  mediaUriIdx: index('mediaBanner_mediaUri_idx').on(table.mediaUri),
  imageIdIdx: index('mediaBanner_imageId_idx').on(table.imageId),
}))

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

// EpisodeTitle junction table (reuses titlesTable)
export const episodeTitleTable = sqliteTable('episodeTitle', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  titleId: integer('titleId').notNull().references(() => titlesTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.titleId] }),
  episodeUriIdx: index('episodeTitle_episodeUri_idx').on(table.episodeUri),
  titleIdIdx: index('episodeTitle_titleId_idx').on(table.titleId),
}))

// EpisodeShortDescription junction table (reuses shortDescriptionsTable)
export const episodeShortDescriptionTable = sqliteTable('episodeShortDescription', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  shortDescriptionId: integer('shortDescriptionId').notNull().references(() => shortDescriptionsTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.shortDescriptionId] }),
  episodeUriIdx: index('episodeShortDesc_episodeUri_idx').on(table.episodeUri),
  shortDescIdIdx: index('episodeShortDesc_shortDescId_idx').on(table.shortDescriptionId),
}))

// EpisodeDescription junction table (reuses descriptionsTable)
export const episodeDescriptionTable = sqliteTable('episodeDescription', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  descriptionId: integer('descriptionId').notNull().references(() => descriptionsTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.descriptionId] }),
  episodeUriIdx: index('episodeDesc_episodeUri_idx').on(table.episodeUri),
  descIdIdx: index('episodeDesc_descId_idx').on(table.descriptionId),
}))

// EpisodeThumbnail junction table (reuses imagesTable)
export const episodeThumbnailTable = sqliteTable('episodeThumbnail', {
  episodeUri: text('episodeUri').notNull().references(() => episodeTable.uri),
  imageId: integer('imageId').notNull().references(() => imagesTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.imageId] }),
  episodeUriIdx: index('episodeThumbnail_episodeUri_idx').on(table.episodeUri),
  imageIdIdx: index('episodeThumbnail_imageId_idx').on(table.imageId),
}))

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
  mediaTitles: many(mediaTitleTable),
  mediaShortDescriptions: many(mediaShortDescriptionTable),
  mediaDescriptions: many(mediaDescriptionTable),
  trailers: many(mediaTrailerTable),
  mediaCovers: many(mediaCoverTable),
  mediaBanners: many(mediaBannerTable),
  episodes: many(episodeTable),
  handles: many(mediaHandlesTable, {
    relationName: 'handles',
  }),
  handleOf: many(mediaHandlesTable, {
    relationName: 'handleOf',
  }),
}));

// Shared content relations
export const titlesRelations = relations(titlesTable, ({ many }) => ({
  mediaTitles: many(mediaTitleTable),
  episodeTitles: many(episodeTitleTable),
}));

export const shortDescriptionsRelations = relations(shortDescriptionsTable, ({ many }) => ({
  mediaShortDescriptions: many(mediaShortDescriptionTable),
  episodeShortDescriptions: many(episodeShortDescriptionTable),
}));

export const descriptionsRelations = relations(descriptionsTable, ({ many }) => ({
  mediaDescriptions: many(mediaDescriptionTable),
  episodeDescriptions: many(episodeDescriptionTable),
}));

export const imagesRelations = relations(imagesTable, ({ many }) => ({
  mediaCovers: many(mediaCoverTable),
  mediaBanners: many(mediaBannerTable),
  episodeThumbnails: many(episodeThumbnailTable),
}));

// Junction table relations
export const mediaTitleRelations = relations(mediaTitleTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaTitleTable.mediaUri],
    references: [mediaTable.uri],
  }),
  title: one(titlesTable, {
    fields: [mediaTitleTable.titleId],
    references: [titlesTable.id],
  }),
}))

export const mediaShortDescriptionRelations = relations(mediaShortDescriptionTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaShortDescriptionTable.mediaUri],
    references: [mediaTable.uri],
  }),
  shortDescription: one(shortDescriptionsTable, {
    fields: [mediaShortDescriptionTable.shortDescriptionId],
    references: [shortDescriptionsTable.id],
  }),
}))

export const mediaDescriptionRelations = relations(mediaDescriptionTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaDescriptionTable.mediaUri],
    references: [mediaTable.uri],
  }),
  description: one(descriptionsTable, {
    fields: [mediaDescriptionTable.descriptionId],
    references: [descriptionsTable.id],
  }),
}))

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
  image: one(imagesTable, {
    fields: [mediaCoverTable.imageId],
    references: [imagesTable.id],
  }),
}))

export const mediaBannerRelations = relations(mediaBannerTable, ({ one }) => ({
  media: one(mediaTable, {
    fields: [mediaBannerTable.mediaUri],
    references: [mediaTable.uri],
  }),
  image: one(imagesTable, {
    fields: [mediaBannerTable.imageId],
    references: [imagesTable.id],
  }),
}))

export const episodeRelations = relations(episodeTable, ({ one, many }) => ({
  media: one(mediaTable, {
    fields: [episodeTable.mediaUri],
    references: [mediaTable.uri],
  }),
  episodeTitles: many(episodeTitleTable),
  episodeShortDescriptions: many(episodeShortDescriptionTable),
  episodeDescriptions: many(episodeDescriptionTable),
  episodeThumbnails: many(episodeThumbnailTable),
  playbackSources: many(playbackSourceTable),
}))

export const episodeTitleRelations = relations(episodeTitleTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeTitleTable.episodeUri],
    references: [episodeTable.uri],
  }),
  title: one(titlesTable, {
    fields: [episodeTitleTable.titleId],
    references: [titlesTable.id],
  }),
}))

export const episodeShortDescriptionRelations = relations(episodeShortDescriptionTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeShortDescriptionTable.episodeUri],
    references: [episodeTable.uri],
  }),
  shortDescription: one(shortDescriptionsTable, {
    fields: [episodeShortDescriptionTable.shortDescriptionId],
    references: [shortDescriptionsTable.id],
  }),
}))

export const episodeDescriptionRelations = relations(episodeDescriptionTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeDescriptionTable.episodeUri],
    references: [episodeTable.uri],
  }),
  description: one(descriptionsTable, {
    fields: [episodeDescriptionTable.descriptionId],
    references: [descriptionsTable.id],
  }),
}))

export const episodeThumbnailRelations = relations(episodeThumbnailTable, ({ one }) => ({
  episode: one(episodeTable, {
    fields: [episodeThumbnailTable.episodeUri],
    references: [episodeTable.uri],
  }),
  image: one(imagesTable, {
    fields: [episodeThumbnailTable.imageId],
    references: [imagesTable.id],
  }),
}))

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

// Core entities
export type Media = typeof mediaTable.$inferSelect;
export type CreateMedia = typeof mediaTable.$inferInsert;
export type Episode = typeof episodeTable.$inferSelect;
export type CreateEpisode = typeof episodeTable.$inferInsert;
export type PlaybackSource = typeof playbackSourceTable.$inferSelect;
export type CreatePlaybackSource = typeof playbackSourceTable.$inferInsert;

// Shared content tables
export type Title = typeof titlesTable.$inferSelect;
export type CreateTitle = typeof titlesTable.$inferInsert;
export type ShortDescription = typeof shortDescriptionsTable.$inferSelect;
export type CreateShortDescription = typeof shortDescriptionsTable.$inferInsert;
export type Description = typeof descriptionsTable.$inferSelect;
export type CreateDescription = typeof descriptionsTable.$inferInsert;
export type Image = typeof imagesTable.$inferSelect;
export type CreateImage = typeof imagesTable.$inferInsert;

// Media-specific entities
export type MediaTrailer = typeof mediaTrailerTable.$inferSelect;
export type CreateMediaTrailer = typeof mediaTrailerTable.$inferInsert;

// Junction tables
export type MediaTitle = typeof mediaTitleTable.$inferSelect;
export type CreateMediaTitle = typeof mediaTitleTable.$inferInsert;
export type MediaShortDescription = typeof mediaShortDescriptionTable.$inferSelect;
export type CreateMediaShortDescription = typeof mediaShortDescriptionTable.$inferInsert;
export type MediaDescription = typeof mediaDescriptionTable.$inferSelect;
export type CreateMediaDescription = typeof mediaDescriptionTable.$inferInsert;
export type MediaCover = typeof mediaCoverTable.$inferSelect;
export type CreateMediaCover = typeof mediaCoverTable.$inferInsert;
export type MediaBanner = typeof mediaBannerTable.$inferSelect;
export type CreateMediaBanner = typeof mediaBannerTable.$inferInsert;
export type EpisodeTitle = typeof episodeTitleTable.$inferSelect;
export type CreateEpisodeTitle = typeof episodeTitleTable.$inferInsert;
export type EpisodeShortDescription = typeof episodeShortDescriptionTable.$inferSelect;
export type CreateEpisodeShortDescription = typeof episodeShortDescriptionTable.$inferInsert;
export type EpisodeDescription = typeof episodeDescriptionTable.$inferSelect;
export type CreateEpisodeDescription = typeof episodeDescriptionTable.$inferInsert;
export type EpisodeThumbnail = typeof episodeThumbnailTable.$inferSelect;
export type CreateEpisodeThumbnail = typeof episodeThumbnailTable.$inferInsert;
export type MediaHandles = typeof mediaHandlesTable.$inferSelect;
export type CreateMediaHandles = typeof mediaHandlesTable.$inferInsert;
