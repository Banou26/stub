/**
 * Example demonstrating implicit many-to-many self relationships in Prisma
 * with the patched client for browser/wa-sqlite usage
 */

import { getPrismaClient, generateId } from './src/worker/database/prisma-client-proxy'

async function demonstrateImplicitRelations() {
  console.log('🚀 Demonstrating Implicit Many-to-Many Self Relationships')
  // console.log('=' * 50)

  // Get the Prisma client
  const prisma = await getPrismaClient()

  // Clear existing data
  await prisma.media.deleteMany()
  console.log('✅ Cleared existing data')

  // Create media items
  const video = await prisma.media.create({
    data: {
      id: generateId(),
      name: 'Main Video'
    }
  })

  const thumbnail = await prisma.media.create({
    data: {
      id: generateId(),
      name: 'Thumbnail Image'
    }
  })

  const subtitle = await prisma.media.create({
    data: {
      id: generateId(),
      name: 'Subtitle File'
    }
  })

  console.log('✅ Created media items:', { video, thumbnail, subtitle })

  // Create relationships using the implicit many-to-many
  // Video handles both thumbnail and subtitle
  const updatedVideo = await prisma.media.update({
    where: { id: video.id },
    data: {
      handles: {
        connect: [
          { id: thumbnail.id },
          { id: subtitle.id }
        ]
      }
    }
  })

  console.log('✅ Video now handles thumbnail and subtitle')

  // Query relationships using raw SQL
  const videoHandles = await prisma.$queryRaw`
    SELECT m.* FROM media m
    INNER JOIN _MediaHandles mh ON m.id = mh.B
    WHERE mh.A = ${video.id}
  `

  console.log('📋 Media handled by video:', videoHandles)

  // Query reverse relationships
  const handledByVideo = await prisma.$queryRaw`
    SELECT m.* FROM media m
    INNER JOIN _MediaHandles mh ON m.id = mh.A
    WHERE mh.B = ${thumbnail.id}
  `

  console.log('📋 Media that handles thumbnail:', handledByVideo)

  // Update relationships - disconnect thumbnail, add a new audio track
  const audio = await prisma.media.create({
    data: {
      id: generateId(),
      name: 'Audio Track'
    }
  })

  await prisma.media.update({
    where: { id: video.id },
    data: {
      handles: {
        disconnect: { id: thumbnail.id },
        connect: { id: audio.id }
      }
    }
  })

  console.log('✅ Updated relationships: disconnected thumbnail, connected audio')

  // Query updated relationships
  const updatedHandles = await prisma.$queryRaw`
    SELECT m.* FROM media m
    INNER JOIN _MediaHandles mh ON m.id = mh.B
    WHERE mh.A = ${video.id}
    ORDER BY m.name
  `

  console.log('📋 Updated media handled by video:', updatedHandles)

  // Clean up
  await prisma.media.deleteMany()
  console.log('✅ Cleaned up all data')

  console.log('\n🎉 Implicit many-to-many self relationship demo complete!')
}

// Export for testing
export { demonstrateImplicitRelations }
