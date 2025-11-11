// Type exports for better TypeScript support
import type {
  notifyTable,
  mediaTable,
  aggregatedMediaTable,
  episodeTable,
  aggregatedEpisodeTable,
  mediaEpisodesTable,
  aggregatedMediaEpisodesTable,
  mediaHandlesTable,
  episodeHandlesTable,
  aggregatedMediaHandlesTable,
  aggregatedEpisodeHandlesTable,
  originTable
} from './index'

export type ChangeNotification = typeof notifyTable.$inferSelect
export type Media = typeof mediaTable.$inferSelect
export type Origin = typeof originTable.$inferSelect
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
export type AggregatedMediaHandles = typeof aggregatedMediaHandlesTable.$inferSelect
export type CreateAggregatedMediaHandles = typeof aggregatedMediaHandlesTable.$inferInsert
export type AggregatedEpisodeHandles = typeof aggregatedEpisodeHandlesTable.$inferSelect
export type CreateAggregatedEpisodeHandles = typeof aggregatedEpisodeHandlesTable.$inferInsert