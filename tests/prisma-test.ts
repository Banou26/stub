import { expect } from 'chai'
import { 
  getPrismaClient, 
  createMedia, 
  addHandle, 
  getDirectHandles,
  generateId
} from '../src/worker/database/prisma-client-proxy'

export const prismaTest = {
  'Initialize Prisma Client': async () => {
    console.log('Starting Prisma initialization test')
    
    try {
      const prisma = await getPrismaClient('test-prisma-db')
      expect(prisma).to.exist
      console.log('Prisma Client initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Prisma:', error)
      throw error
    }
  },

  'Create and query media': async () => {
    console.log('Testing media creation and querying')
    
    const prisma = await getPrismaClient('test-prisma-db')
    
    // Clear existing data
    await prisma.$executeRaw`DELETE FROM media_handles`
    await prisma.$executeRaw`DELETE FROM media`
    
    // Create test media
    const id1 = generateId()
    const id2 = generateId()
    
    await createMedia(id1, 'Test Video')
    await createMedia(id2, 'Test Audio')
    
    // Query media
    const allMedia = await prisma.media.findMany()
    expect(allMedia).to.have.lengthOf(2)
    
    const video = await prisma.media.findUnique({
      where: { id: id1 }
    })
    expect(video).to.exist
    expect(video.name).to.equal('Test Video')
    
    console.log('Media creation and querying successful')
  },

  'Handle relationships': async () => {
    console.log('Testing media handle relationships')
    
    const prisma = await getPrismaClient('test-prisma-db')
    
    // Clear existing data
    await prisma.$executeRaw`DELETE FROM media_handles`
    await prisma.$executeRaw`DELETE FROM media`
    
    // Create media items
    const videoId = generateId()
    const audioId = generateId()
    const subtitleId = generateId()
    
    await createMedia(videoId, 'Video File')
    await createMedia(audioId, 'Audio Track')
    await createMedia(subtitleId, 'Subtitle File')
    
    // Create relationships
    await addHandle(videoId, audioId)
    await addHandle(videoId, subtitleId)
    
    // Query relationships
    const handles = await getDirectHandles(videoId)
    expect(handles).to.have.lengthOf(2)
    
    // Query with includes
    const videoWithRelations = await prisma.media.findUnique({
      where: { id: videoId },
      include: {
        handles: true,
        handledBy: true
      }
    })
    
    expect(videoWithRelations).to.exist
    expect(videoWithRelations.handles).to.have.lengthOf(2)
    
    console.log('Relationship handling successful')
  },

  'Raw SQL queries': async () => {
    console.log('Testing raw SQL queries')
    
    const prisma = await getPrismaClient('test-prisma-db')
    
    // Clear and setup test data
    await prisma.$executeRaw`DELETE FROM media_handles`
    await prisma.$executeRaw`DELETE FROM media`
    
    const id1 = generateId()
    const id2 = generateId()
    const id3 = generateId()
    
    await createMedia(id1, 'Media 1')
    await createMedia(id2, 'Media 2')
    await createMedia(id3, 'Media 3')
    
    await addHandle(id1, id2)
    await addHandle(id2, id3)
    
    // Test recursive query using raw SQL
    const related = await db.$queryRaw`
      WITH RECURSIVE related_media AS (
        SELECT id, name FROM media WHERE id = ${id1}
        UNION
        SELECT DISTINCT m.id, m.name
        FROM media m
        INNER JOIN media_handles mh ON m.id = mh.handles_id
        INNER JOIN related_media rm ON mh.media_id = rm.id
      )
      SELECT DISTINCT * FROM related_media
    `
    expect(related).to.be.an('array')
    expect(related.length).to.be.at.least(1)
    
    // Test raw query
    const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM media`
    expect(result).to.be.an('array')
    expect(result[0]).to.have.property('count')
    expect(result[0].count).to.equal(3)
    
    console.log('Raw SQL queries successful')
  },

  'Transactions': async () => {
    console.log('Testing transactions')
    
    const prisma = await getPrismaClient('test-prisma-db')
    
    // Clear existing data
    await prisma.$executeRaw`DELETE FROM media_handles`
    await prisma.$executeRaw`DELETE FROM media`
    
    const id1 = generateId()
    const id2 = generateId()
    
    // Test successful transaction
    await prisma.$transaction(async (tx: any) => {
      await tx.media.create({
        data: { id: id1, name: 'Transaction Test 1' }
      })
      await tx.media.create({
        data: { id: id2, name: 'Transaction Test 2' }
      })
    })
    
    const count = await prisma.media.count()
    expect(count).to.equal(2)
    
    // Test transaction rollback
    const id3 = generateId()
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.media.create({
          data: { id: id3, name: 'Should be rolled back' }
        })
        // Force an error
        throw new Error('Rollback test')
      })
    } catch (error) {
      // Expected error
    }
    
    const finalCount = await prisma.media.count()
    expect(finalCount).to.equal(2) // Should still be 2, not 3
    
    console.log('Transaction tests successful')
  }
}