/**
 * Type test file to verify the patched Prisma client types work correctly
 */

import { getPrismaClient } from './prisma-client-proxy'
import type { Media, MediaHandle } from './prisma-client-types'

async function testTypes() {
  const prisma = await getPrismaClient()
  
  // Test Media operations
  const media: Media = await prisma.media.create({
    data: {
      id: 'test-id',
      name: 'Test Media'
    }
  })
  
  const foundMedia: Media | null = await prisma.media.findUnique({
    where: { id: 'test-id' }
  })
  
  const allMedia: Media[] = await prisma.media.findMany({
    where: {
      name: {
        contains: 'Test'
      }
    }
  })
  
  const updatedMedia: Media = await prisma.media.update({
    where: { id: 'test-id' },
    data: { name: 'Updated Name' }
  })
  
  const batchResult = await prisma.media.createMany({
    data: [
      { id: '1', name: 'Media 1' },
      { id: '2', name: 'Media 2' }
    ]
  })
  
  const count: number = await prisma.media.count({
    where: { name: { startsWith: 'Test' } }
  })
  
  // Test MediaHandle operations
  const handle: MediaHandle = await prisma.mediaHandle.create({
    data: {
      mediaId: 'media1',
      handlesId: 'media2'
    }
  })
  
  const handles: MediaHandle[] = await prisma.mediaHandle.findMany({
    where: {
      mediaId: 'media1'
    }
  })
  
  // Test raw queries
  const rawResult = await prisma.$queryRaw<Media[]>`
    SELECT * FROM media WHERE name = ${'Test'}
  `
  
  const execResult: number = await prisma.$executeRaw`
    UPDATE media SET name = ${'New Name'} WHERE id = ${'test-id'}
  `
  
  // Test transactions
  const txResult = await prisma.$transaction(async (tx) => {
    const m1 = await tx.media.create({
      data: { id: 'tx1', name: 'Transaction Test' }
    })
    const m2 = await tx.media.findUnique({
      where: { id: 'tx1' }
    })
    return { m1, m2 }
  })
  
  // Verify types are correct
  const typeCheck1: string = media.id
  const typeCheck2: string = media.name
  const typeCheck3: string = handle.mediaId
  const typeCheck4: string = handle.handlesId
  const typeCheck5: number = batchResult.count
  
  console.log('✅ All type checks passed!')
}

// Export for testing
export { testTypes }