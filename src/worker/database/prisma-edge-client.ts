// Alternative approach using Prisma's edge runtime capabilities
// This approach doesn't try to hide the browser environment but works with it

import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'
import { createWaSQLitePrismaAdapter } from './prisma-wa-sqlite-adapter'

let prismaClient: any = null

// This approach uses Prisma's edge runtime which is designed for non-Node environments
export async function getEdgePrismaClient(dbName: string = 'myDB'): Promise<any> {
  if (prismaClient) {
    return prismaClient
  }

  try {
    // Create the wa-sqlite adapter
    const adapter = await createWaSQLitePrismaAdapter(dbName, (msg: string) => {
      console.log('[Prisma Debug]', msg)
    })

    // Create Prisma Client using edge runtime
    prismaClient = new PrismaClient({
      adapter,
      log: ['query', 'info', 'warn', 'error'],
    })

    // Initialize the database schema
    await initializeSchema(prismaClient)

    return prismaClient
  } catch (error) {
    console.error('Failed to initialize Edge Prisma Client:', error)
    throw error
  }
}

async function initializeSchema(prisma: any) {
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

    // Create indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_media_handles_media_id ON media_handles(media_id)
    `

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_media_handles_handles_id ON media_handles(handles_id)
    `

    console.log('Schema created successfully')
  }
}