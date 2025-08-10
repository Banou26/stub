/**
 * Test file to verify Prisma generated types are working correctly
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { getPrismaClient } from './src/worker/database/prisma-client-proxy'

async function testPrismaTypes() {
  // Get the Prisma client - should be typed as PrismaClient
  const prisma: PrismaClient = await getPrismaClient()
  
  // Test that we can use Prisma's generated types
  const createInput: Prisma.MediaCreateInput = {
    id: 'test-id',
    name: 'Test Media',
    handles: {
      connect: [
        { id: 'other-id-1' },
        { id: 'other-id-2' }
      ]
    }
  }
  
  // Test where conditions
  const whereInput: Prisma.MediaWhereInput = {
    OR: [
      { name: { contains: 'Video' } },
      { name: { startsWith: 'Audio' } }
    ]
  }
  
  // Test find args
  const findArgs: Prisma.MediaFindManyArgs = {
    where: whereInput,
    take: 10,
    skip: 0,
    orderBy: { name: 'asc' }
  }
  
  // Test update input
  const updateInput: Prisma.MediaUpdateInput = {
    name: 'Updated Name',
    handles: {
      disconnect: { id: 'some-id' },
      connect: { id: 'new-id' }
    }
  }
  
  // Use the typed client methods
  const media = await prisma.media.findMany(findArgs)
  const singleMedia = await prisma.media.findUnique({
    where: { id: 'test-id' }
  })
  
  // Raw queries should also be typed
  const rawResult = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM media WHERE name LIKE ${'%test%'}
  `
  
  // Transactions
  const result = await prisma.$transaction(async (tx) => {
    const m1 = await tx.media.create({ data: createInput })
    const m2 = await tx.media.update({
      where: { id: m1.id },
      data: updateInput
    })
    return { m1, m2 }
  })
  
  console.log('✅ All type checks passed!')
  console.log('Media count:', media.length)
  console.log('Single media:', singleMedia)
  console.log('Raw result:', rawResult)
  console.log('Transaction result:', result)
}

// Export for testing
export { testPrismaTypes }