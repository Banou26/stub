import { int, sqliteTable as table, text } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// Define the media table
export const media = table('media', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

// Define the junction table for the self-referential many-to-many relationship
export const mediaHandles = table('media_handles', {
  mediaId: text('media_id')
    .notNull()
    .references(() => media.id, { onDelete: 'cascade' }),
  handlesId: text('handles_id')
    .notNull()
    .references(() => media.id, { onDelete: 'cascade' }),
})

// Define relations
export const mediaRelations = relations(media, ({ many }) => ({
  // Media that this media handles
  handlesRelations: many(mediaHandles, {
    relationName: 'handler',
  }),
  // Media that handle this media
  handledByRelations: many(mediaHandles, {
    relationName: 'handled',
  }),
}))

export const mediaHandlesRelations = relations(mediaHandles, ({ one }) => ({
  // The media doing the handling
  handler: one(media, {
    fields: [mediaHandles.mediaId],
    references: [media.id],
    relationName: 'handler',
  }),
  // The media being handled
  handled: one(media, {
    fields: [mediaHandles.handlesId],
    references: [media.id],
    relationName: 'handled',
  }),
}))

// Type definitions
export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
export type MediaHandle = typeof mediaHandles.$inferSelect
export type NewMediaHandle = typeof mediaHandles.$inferInsert

// Initialize database (example)
export function initDb(database: Database) {
  return drizzle(database, { schema: { media, mediaHandles, mediaRelations, mediaHandlesRelations } })
}

// Recursive query to fetch all related media
export async function fetchAllRelatedMedia(db: ReturnType<typeof initDb>, mediaId: string): Promise<Media[]> {
  // Using raw SQL with recursive CTE for SQLite
  const query = sql`
    WITH RECURSIVE related_media AS (
      -- Base case: start with the given media
      SELECT id, name FROM ${media} WHERE id = ${mediaId}

      UNION

      -- Recursive case: find all media that are handled by current set
      SELECT DISTINCT m.id, m.name
      FROM ${media} m
      INNER JOIN ${mediaHandles} mh ON m.id = mh.handles_id
      INNER JOIN related_media rm ON mh.media_id = rm.id

      UNION

      -- Also find all media that handle the current set (bidirectional)
      SELECT DISTINCT m.id, m.name
      FROM ${media} m
      INNER JOIN ${mediaHandles} mh ON m.id = mh.media_id
      INNER JOIN related_media rm ON mh.handles_id = rm.id
    )
    SELECT DISTINCT * FROM related_media;
  `

  const result = await db.all(query)
  return result as Media[]
}

// Alternative: Recursive query using Drizzle's query builder with depth limit
export async function fetchRelatedMediaWithDepth(
  db: ReturnType<typeof initDb>,
  mediaId: string,
  maxDepth: number = 10
): Promise<Set<string>> {
  const visited = new Set<string>()
  const toVisit = [mediaId]
  let depth = 0

  while (toVisit.length > 0 && depth < maxDepth) {
    const currentBatch = [...toVisit]
    toVisit.length = 0

    for (const id of currentBatch) {
      if (visited.has(id)) continue
      visited.add(id)

      // Find all media that this media handles
      const handles = await db
        .select({ id: mediaHandles.handlesId })
        .from(mediaHandles)
        .where(sql`${mediaHandles.mediaId} = ${id}`)

      // Find all media that handle this media
      const handledBy = await db
        .select({ id: mediaHandles.mediaId })
        .from(mediaHandles)
        .where(sql`${mediaHandles.handlesId} = ${id}`)

      // Add new IDs to visit
      for (const row of [...handles, ...handledBy]) {
        if (!visited.has(row.id)) {
          toVisit.push(row.id)
        }
      }
    }
    depth++
  }

  return visited
}

// Fetch full media objects for a set of IDs
export async function fetchMediaByIds(
  db: ReturnType<typeof initDb>,
  ids: Set<string>
): Promise<Media[]> {
  if (ids.size === 0) return []

  return await db
    .select()
    .from(media)
    .where(sql`${media.id} IN (${sql.join(Array.from(ids).map(id => sql`${id}`), sql`, `)})`)
}

// Example usage
async function example(db: ReturnType<typeof initDb>) {
  // Method 1: Using recursive CTE (most efficient)
  const allRelated = await fetchAllRelatedMedia(db, 'media-uuid-1')
  console.log('All related media:', allRelated)

  // Method 2: Using iterative approach with depth limit
  const relatedIds = await fetchRelatedMediaWithDepth(db, 'media-uuid-1', 10)
  const relatedMedia = await fetchMediaByIds(db, relatedIds)
  console.log('Related media (iterative):', relatedMedia)
}

// Helper function to add a handle relationship
export async function addHandle(
  db: ReturnType<typeof initDb>,
  handlerId: string,
  handledId: string
): Promise<void> {
  await db.insert(mediaHandles).values({
    mediaId: handlerId,
    handlesId: handledId,
  })
}

// Helper function to get direct handles for a media
export async function getDirectHandles(
  db: ReturnType<typeof initDb>,
  mediaId: string
): Promise<Media[]> {
  return await db
    .select({
      id: media.id,
      name: media.name,
    })
    .from(media)
    .innerJoin(mediaHandles, sql`${mediaHandles.handlesId} = ${media.id}`)
    .where(sql`${mediaHandles.mediaId} = ${mediaId}`)
}

// Helper function to create a media with a specific ID
export async function createMedia(
  db: ReturnType<typeof initDb>,
  id: string,
  name: string
): Promise<void> {
  await db.insert(media).values({ id, name })
}

// Helper function to generate a UUID-like ID (if needed)
export function generateId(): string {
  // Simple UUID v4 generation (you might want to use a proper UUID library)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
