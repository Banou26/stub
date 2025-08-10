// Example of using Prisma instead of Drizzle in your application
import { getPrismaClient } from './prisma-client'

// Initialize once in your app
let prisma: Awaited<ReturnType<typeof getPrismaClient>> | null = null

export async function initializeDatabase() {
  if (!prisma) {
    prisma = await getPrismaClient('myDB')
  }
  return prisma
}

// Example service functions that replace Drizzle implementations

export async function mediaService() {
  const db = await initializeDatabase()
  
  return {
    // Create a new media entry
    async create(id: string, name: string) {
      return await db.media.create({
        data: { id, name }
      })
    },

    // Find a media by ID
    async findById(id: string) {
      return await db.media.findUnique({
        where: { id }
      })
    },

    // Find all media
    async findAll() {
      return await db.media.findMany({
        orderBy: { name: 'asc' }
      })
    },

    // Update media name
    async updateName(id: string, name: string) {
      return await db.media.update({
        where: { id },
        data: { name }
      })
    },

    // Delete media
    async delete(id: string) {
      // First delete all relationships
      await db.mediaHandle.deleteMany({
        where: {
          OR: [
            { mediaId: id },
            { handlesId: id }
          ]
        }
      })
      
      // Then delete the media
      return await db.media.delete({
        where: { id }
      })
    },

    // Add a handle relationship
    async addHandle(handlerId: string, handledId: string) {
      return await db.mediaHandle.create({
        data: {
          mediaId: handlerId,
          handlesId: handledId
        }
      })
    },

    // Get media with all relationships
    async getWithRelations(id: string) {
      return await db.media.findUnique({
        where: { id },
        include: {
          handles: {
            include: {
              handled: true
            }
          },
          handledBy: {
            include: {
              handler: true
            }
          }
        }
      })
    },

    // Complex query using raw SQL (when Prisma's query builder isn't enough)
    async findRelatedRecursive(mediaId: string) {
      return await db.$queryRaw`
        WITH RECURSIVE related_media AS (
          SELECT id, name FROM media WHERE id = ${mediaId}
          
          UNION
          
          SELECT DISTINCT m.id, m.name
          FROM media m
          INNER JOIN media_handles mh ON m.id = mh.handles_id
          INNER JOIN related_media rm ON mh.media_id = rm.id
          
          UNION
          
          SELECT DISTINCT m.id, m.name
          FROM media m
          INNER JOIN media_handles mh ON m.id = mh.media_id
          INNER JOIN related_media rm ON mh.handles_id = rm.id
        )
        SELECT DISTINCT * FROM related_media
      `
    },

    // Batch operations in a transaction
    async createMultipleWithRelations(
      mediaItems: Array<{ id: string; name: string }>,
      relationships: Array<{ handlerId: string; handledId: string }>
    ) {
      return await db.$transaction(async (tx) => {
        // Create all media items
        for (const item of mediaItems) {
          await tx.media.create({
            data: item
          })
        }
        
        // Create all relationships
        for (const rel of relationships) {
          await tx.mediaHandle.create({
            data: {
              mediaId: rel.handlerId,
              handlesId: rel.handledId
            }
          })
        }
        
        // Return all created items with relations
        return await tx.media.findMany({
          include: {
            handles: true,
            handledBy: true
          }
        })
      })
    }
  }
}

// Usage example in a component or worker
export async function exampleUsage() {
  const service = await mediaService()
  
  // Create some media
  const video = await service.create('video-1', 'Sample Video')
  const audio = await service.create('audio-1', 'Sample Audio')
  const subtitle = await service.create('subtitle-1', 'Sample Subtitle')
  
  // Create relationships
  await service.addHandle('video-1', 'audio-1')
  await service.addHandle('video-1', 'subtitle-1')
  
  // Query with relations
  const videoWithRelations = await service.getWithRelations('video-1')
  console.log('Video with all relations:', videoWithRelations)
  
  // Find all recursively related media
  const allRelated = await service.findRelatedRecursive('video-1')
  console.log('All related media:', allRelated)
}