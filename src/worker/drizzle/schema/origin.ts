import { sqliteTable, text, index, integer } from 'drizzle-orm/sqlite-core'

// Origin table
export const originTable = sqliteTable('origin', {
  id: text('id').primaryKey().unique().notNull(),
  url: text('url'),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  isApiOnly: integer('isApiOnly', { mode: 'boolean' }).notNull()
}, (table) => ({
  idIdx: index('origin_id_idx').on(table.id)
}))
