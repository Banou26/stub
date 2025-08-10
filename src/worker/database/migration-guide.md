# Migration Guide: Drizzle to Prisma with wa-sqlite

## Overview
This guide shows how to migrate from Drizzle ORM to Prisma Client while maintaining wa-sqlite support in the browser.

## Key Changes

### 1. Schema Definition
**Drizzle (schema.ts):**
```typescript
import { sqliteTable as table, text } from 'drizzle-orm/sqlite-core'

export const media = table('media', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
```

**Prisma (schema.prisma):**
```prisma
model Media {
  id   String @id
  name String
  @@map("media")
}
```

### 2. Database Initialization
**Drizzle:**
```typescript
import { createWaSQLiteDB } from './drizzle-driver'
const db = await createWaSQLiteDB('myDB', { schema })
```

**Prisma:**
```typescript
import { getPrismaClient } from './prisma-client'
const prisma = await getPrismaClient('myDB')
```

### 3. Query Examples

#### Insert
**Drizzle:**
```typescript
await db.insert(media).values({ id, name })
```

**Prisma:**
```typescript
await prisma.media.create({
  data: { id, name }
})
```

#### Select All
**Drizzle:**
```typescript
const result = await db.select().from(media)
```

**Prisma:**
```typescript
const result = await prisma.media.findMany()
```

#### Select with Where
**Drizzle:**
```typescript
const result = await db
  .select()
  .from(media)
  .where(sql`${media.id} = ${id}`)
```

**Prisma:**
```typescript
const result = await prisma.media.findUnique({
  where: { id }
})
```

#### Update
**Drizzle:**
```typescript
await db
  .update(media)
  .set({ name: newName })
  .where(sql`${media.id} = ${id}`)
```

**Prisma:**
```typescript
await prisma.media.update({
  where: { id },
  data: { name: newName }
})
```

#### Delete
**Drizzle:**
```typescript
await db
  .delete(media)
  .where(sql`${media.id} = ${id}`)
```

**Prisma:**
```typescript
await prisma.media.delete({
  where: { id }
})
```

#### Raw SQL
**Drizzle:**
```typescript
const result = await db.all(sql`SELECT * FROM media WHERE name LIKE ${pattern}`)
```

**Prisma:**
```typescript
const result = await prisma.$queryRaw`SELECT * FROM media WHERE name LIKE ${pattern}`
```

### 4. Relations
**Drizzle:**
```typescript
const result = await db
  .select()
  .from(media)
  .innerJoin(mediaHandles, sql`${mediaHandles.mediaId} = ${media.id}`)
```

**Prisma:**
```typescript
const result = await prisma.media.findMany({
  include: {
    handles: true,
    handledBy: true
  }
})
```

### 5. Transactions
**Drizzle:**
```typescript
await driver.transaction(async () => {
  await db.insert(media).values(data1)
  await db.insert(media).values(data2)
})
```

**Prisma:**
```typescript
await prisma.$transaction(async (tx) => {
  await tx.media.create({ data: data1 })
  await tx.media.create({ data: data2 })
})
```

## Migration Steps

1. **Install Prisma dependencies:**
   ```bash
   npm install prisma @prisma/client @prisma/driver-adapter-utils
   ```

2. **Create Prisma schema** based on your Drizzle schema

3. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

4. **Replace Drizzle imports** with Prisma imports

5. **Update queries** using the patterns shown above

6. **Test thoroughly** in the browser environment

## Important Notes

- Prisma requires the `driverAdapters` preview feature to work with custom adapters
- The wa-sqlite adapter handles browser-specific SQLite operations
- Browser polyfills are necessary for Node.js-specific APIs that Prisma uses
- Raw SQL queries are still available through `$queryRaw` and `$executeRaw`
- Schema migrations should be handled carefully as Prisma Migrate doesn't work in browser environments