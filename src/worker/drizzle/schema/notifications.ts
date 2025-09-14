import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Notifications table for tracking changes
export const notifyTable = sqliteTable('notify', {
  id: integer('id').primaryKey().unique().notNull(),
  tableName: text('tableName').notNull(),
  columnId: text('columnId').notNull(),
  rowId: text('rowId').notNull(),
  operation: text('operation').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull()
})