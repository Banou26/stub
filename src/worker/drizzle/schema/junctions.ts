import { sqliteTable, text, index, primaryKey } from 'drizzle-orm/sqlite-core'

// Junction table for Media handles (self-referencing many-to-many)
export const mediaHandlesTable = sqliteTable('mediaHandles', {
  mediaUri: text('mediaUri').notNull(),
  handleUri: text('handleUri').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.handleUri] }),
  mediaUriIdx: index('mediaHandles_mediaUri_idx').on(table.mediaUri),
  handleUriIdx: index('mediaHandles_handleUri_idx').on(table.handleUri),
  // Composite index for bi-directional lookups
  handleMediaIdx: index('mediaHandles_handle_media_idx').on(table.handleUri, table.mediaUri),
}))

// Junction table for Media<->Episode many-to-many
export const mediaEpisodesTable = sqliteTable('mediaEpisodes', {
  mediaUri: text('mediaUri').notNull(),
  episodeUri: text('episodeUri').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.mediaUri, table.episodeUri] }),
  mediaIdx: index('mediaEpisodes_mediaUri_idx').on(table.mediaUri),
  episodeIdx: index('mediaEpisodes_episodeUri_idx').on(table.episodeUri),
}))

// Junction table for AggregatedMedia<->AggregatedEpisode many-to-many
export const aggregatedMediaEpisodesTable = sqliteTable('aggregatedMediaEpisodes', {
  aggregatedMediaId: text('aggregatedMediaId').notNull(),
  aggregatedEpisodeId: text('aggregatedEpisodeId').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.aggregatedMediaId, table.aggregatedEpisodeId] }),
  mediaIdx: index('aggregatedMediaEpisodes_aggregatedMediaId_idx').on(table.aggregatedMediaId),
  episodeIdx: index('aggregatedMediaEpisodes_aggregatedEpisodeId_idx').on(table.aggregatedEpisodeId),
}))

// Junction table for AggregatedMedia -> Media handles
export const aggregatedMediaHandlesTable = sqliteTable('aggregatedMediaHandles', {
  aggregatedMediaId: text('aggregatedMediaId').notNull(),
  mediaUri: text('mediaUri').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.aggregatedMediaId, table.mediaUri] }),
  aggregatedMediaIdIdx: index('aggregatedMediaHandles_aggregatedMediaId_idx').on(table.aggregatedMediaId),
  mediaUriIdx: index('aggregatedMediaHandles_mediaUri_idx').on(table.mediaUri),
  // Composite index for bi-directional lookups
  handleMediaIdx: index('aggregatedMediaHandles_handle_media_idx').on(table.mediaUri, table.aggregatedMediaId),
}))

// Junction table for Episode handles (self-referencing many-to-many)
export const episodeHandlesTable = sqliteTable('episodeHandles', {
  episodeUri: text('episodeUri').notNull(),
  handleUri: text('handleUri').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.episodeUri, table.handleUri] }),
  episodeUriIdx: index('episodeHandles_episodeUri_idx').on(table.episodeUri),
  handleUriIdx: index('episodeHandles_handleUri_idx').on(table.handleUri),
  // Composite index for bi-directional lookups
  handleEpisodeIdx: index('episodeHandles_handle_episode_idx').on(table.handleUri, table.episodeUri),
}))

// Junction table for AggregatedEpisode -> Episode handles
export const aggregatedEpisodeHandlesTable = sqliteTable('aggregatedEpisodeHandles', {
  aggregatedEpisodeId: text('aggregatedEpisodeId').notNull(),
  episodeUri: text('episodeUri').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.aggregatedEpisodeId, table.episodeUri] }),
  aggregatedEpisodeIdIdx: index('aggregatedEpisodeHandles_aggregatedEpisodeId_idx').on(table.aggregatedEpisodeId),
  episodeUriIdx: index('aggregatedEpisodeHandles_episodeUri_idx').on(table.episodeUri),
  // Composite index for bi-directional lookups
  handleEpisodeIdx: index('aggregatedEpisodeHandles_handle_episode_idx').on(table.episodeUri, table.aggregatedEpisodeId),
}))