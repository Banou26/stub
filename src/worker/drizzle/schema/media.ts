import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import { sqliteTable, text, integer, index, real } from 'drizzle-orm/sqlite-core'
import { type MediaType, type MediaStatus, uuid } from './enums'

// Shared media schema fields
export const mediaBaseSchema = {
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
  _id: text('_id').primaryKey().unique().notNull().default(uuid),
  uri: text('uri').notNull()
}, (table) => ({
  _idIdx: index('aggregatedMedia_id_idx').on(table._id),
  uriIdx: index('aggregatedMedia_uri_idx').on(table.uri)
}))

