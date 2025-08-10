// Import polyfills for browser environment
import './browser-polyfills-enhanced'
import { restoreBrowserGlobals } from './browser-polyfills-enhanced'

let prismaClient: any = null

export async function getPrismaClient(dbName: string = 'myDB'): Promise<any> {
  if (prismaClient) {
    return prismaClient
  }

  try {
    // Use regular Prisma Client with adapter support (not edge runtime)
    // The polyfills will handle the browser environment
    const { PrismaClient } = await import('@prisma/client')
    
    // Try to restore browser globals after Prisma is imported (if needed)
    try {
      restoreBrowserGlobals()
    } catch (e) {
      // Ignore errors - we're already in a browser
      console.log('Browser globals restoration skipped:', e.message)
    }
    
    // Dynamically import the adapter
    const { createWaSQLitePrismaAdapter } = await import('./prisma-wa-sqlite-adapter')
    
    // Create the wa-sqlite adapter
    const adapter = await createWaSQLitePrismaAdapter(dbName, (msg: string) => {
      console.log('[Prisma Debug]', msg)
    })

    // Create Prisma Client with the adapter
    prismaClient = new PrismaClient({
      adapter,
      log: ['query', 'info', 'warn', 'error'],
    })

    // Initialize the database schema if needed
    await initializeSchema(prismaClient)

    return prismaClient
  } catch (error) {
    console.error('Failed to initialize Prisma Client:', error)
    throw error
  }
}

async function initializeSchema(prisma: PrismaClient) {
  try {
    // Check if tables exist by trying to query them
    await prisma.$queryRaw`SELECT 1 FROM media LIMIT 1`
  } catch (error) {
    console.log('Tables do not exist, creating schema...')
    
    // Create the media table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `

    // Create the media_handles junction table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS media_handles (
        media_id TEXT NOT NULL,
        handles_id TEXT NOT NULL,
        PRIMARY KEY (media_id, handles_id),
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
        FOREIGN KEY (handles_id) REFERENCES media(id) ON DELETE CASCADE
      )
    `

    // Create indexes for better performance
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_media_handles_media_id ON media_handles(media_id)
    `

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_media_handles_handles_id ON media_handles(handles_id)
    `

    console.log('Schema created successfully')
  }
}

// Example usage functions that mirror the Drizzle implementation

export async function createMedia(id: string, name: string): Promise<void> {
  const prisma = await getPrismaClient()
  await prisma.media.create({
    data: { id, name }
  })
}

export async function addHandle(handlerId: string, handledId: string): Promise<void> {
  const prisma = await getPrismaClient()
  await prisma.mediaHandle.create({
    data: {
      mediaId: handlerId,
      handlesId: handledId
    }
  })
}

export async function getDirectHandles(mediaId: string) {
  const prisma = await getPrismaClient()
  
  const handles = await prisma.media.findMany({
    where: {
      handledBy: {
        some: {
          mediaId: mediaId
        }
      }
    }
  })
  
  return handles
}

export async function fetchAllRelatedMedia(mediaId: string) {
  const prisma = await getPrismaClient()
  
  // Using raw SQL with recursive CTE for SQLite
  const result = await prisma.$queryRaw`
    WITH RECURSIVE related_media AS (
      -- Base case: start with the given media
      SELECT id, name FROM media WHERE id = ${mediaId}

      UNION

      -- Recursive case: find all media that are handled by current set
      SELECT DISTINCT m.id, m.name
      FROM media m
      INNER JOIN media_handles mh ON m.id = mh.handles_id
      INNER JOIN related_media rm ON mh.media_id = rm.id

      UNION

      -- Also find all media that handle the current set (bidirectional)
      SELECT DISTINCT m.id, m.name
      FROM media m
      INNER JOIN media_handles mh ON m.id = mh.media_id
      INNER JOIN related_media rm ON mh.handles_id = rm.id
    )
    SELECT DISTINCT * FROM related_media;
  `
  
  return result
}

export async function fetchRelatedMediaWithDepth(
  mediaId: string,
  maxDepth: number = 10
): Promise<Set<string>> {
  const prisma = await getPrismaClient()
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
      const handles = await prisma.mediaHandle.findMany({
        where: { mediaId: id },
        select: { handlesId: true }
      })

      // Find all media that handle this media
      const handledBy = await prisma.mediaHandle.findMany({
        where: { handlesId: id },
        select: { mediaId: true }
      })

      // Add new IDs to visit
      for (const row of handles) {
        if (!visited.has(row.handlesId)) {
          toVisit.push(row.handlesId)
        }
      }
      
      for (const row of handledBy) {
        if (!visited.has(row.mediaId)) {
          toVisit.push(row.mediaId)
        }
      }
    }
    depth++
  }

  return visited
}

export async function fetchMediaByIds(ids: Set<string>) {
  if (ids.size === 0) return []
  
  const prisma = await getPrismaClient()
  return await prisma.media.findMany({
    where: {
      id: {
        in: Array.from(ids)
      }
    }
  })
}

// Helper function to generate a UUID-like ID
export function generateId(): string {
  return crypto.randomUUID()
}

// Clean up function
export async function closePrismaClient() {
  if (prismaClient) {
    await prismaClient.$disconnect()
    prismaClient = null
  }
}