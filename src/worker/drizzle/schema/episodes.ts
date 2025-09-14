import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import { sqliteTable, text, integer, index, real } from 'drizzle-orm/sqlite-core'
import { uuid } from './enums'

// Shared episode schema fields
export const episodeBaseSchema = {
  origin: text('origin').notNull(),
  id: text('id').notNull(),
  url: text('url'),
  mediaUri: text('mediaUri').notNull(),
  score: real('score'),
  titles: text('titles', { mode: 'json' }).$type<{ language: string, title: string, score?: number | null }[]>(),
  descriptions: text('descriptions', { mode: 'json' }).$type<{ language: string, description: string }[]>(),
  shortDescriptions: text('shortDescriptions', { mode: 'json' }).$type<{ language: string, shortDescription: string }[]>(),
  thumbnails: text('thumbnails', { mode: 'json' }).$type<{ language?: string, url: string, height?: number, width?: number, color?: string }[]>(),
  releaseDate: integer('releaseDate', { mode: 'timestamp' }),
  seasonNumber: integer('seasonNumber'),
  episodeNumber: integer('episodeNumber'),
  absoluteEpisodeNumber: integer('absoluteEpisodeNumber')
} satisfies Record<string, SQLiteColumnBuilderBase>

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
  _id: text('_id').primaryKey().unique().notNull().default(uuid),
  uri: text('uri').notNull()
}, (table) => ({
  _idIdx: index('aggregatedEpisode_id_idx').on(table._id),
  uriIdx: index('aggregatedEpisode_uri_idx').on(table.uri)
}))

