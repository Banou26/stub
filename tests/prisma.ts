import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

export const importPrismaClient = async () => {
  await expect(import('../src/worker/prisma')).to.be.fulfilled
}

export const count = async () => {
  const { default: client } = await import('../src/worker/prisma')
  await expect(client.media.count()).to.eventually.equal(0)
}

export const create = async () => {
  const { default: client } = await import('../src/worker/prisma')

  const createdMedia = await client.media.create({
    data: {
      uri: 'test:bar',
      origin: 'test',
      id: 'bar',
      titles: {
        create: {
          language: 'en',
          title: 'Bar'
        }
      },
      covers: {
        create: {
          uri: 'test:bar:cover',
          origin: 'test',
          id: 'bar-cover',
          url: 'http://example.com/bar'
        }
      }
    },
    include: {
      titles: true,
      covers: true
    }
  })

  expect(createdMedia).to.shallowDeepEqual({
    uri: 'test:bar',
    origin: 'test',
    id: 'bar',
    titles: [{
      language: 'en',
      title: 'Bar'
    }],
    covers: [{
      url: 'http://example.com/bar'
    }]
  })
}

export const concurrentTransactions = async () => {
  const { default: client } = await import('../src/worker/prisma')
  
  // Clear any existing data first
  await client.media.deleteMany({})
  
  // Create multiple concurrent transactions
  const promises = Array.from({ length: 5 }, async (_, i) => {
    return client.$transaction(async (tx) => {
      // Create media with unique uri
      const media = await tx.media.create({
        data: {
          uri: `test:concurrent-${i}`,
          origin: 'test',
          id: `concurrent-${i}`,
          titles: {
            create: {
              language: 'en',
              title: `Concurrent Test ${i}`
            }
          }
        },
        include: {
          titles: true
        }
      })
      
      // Small delay to simulate work
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Update the media by adding another title
      await tx.mediaTitle.create({
        data: {
          mediaUri: media.uri,
          language: 'es',
          title: `Updated ${i}`
        }
      })
      
      return media
    })
  })
  
  // Wait for all transactions to complete
  const results = await Promise.all(promises)
  
  // Verify all transactions completed successfully
  expect(results).to.have.lengthOf(5)
  results.forEach((media, i) => {
    expect(media.uri).to.equal(`test:concurrent-${i}`)
  })
  
  // Verify all updates were applied
  const allMedia = await client.media.findMany({
    where: { origin: 'test' },
    include: { titles: true },
    orderBy: { uri: 'asc' }
  })
  
  expect(allMedia).to.have.lengthOf(5)
  allMedia.forEach((media, i) => {
    // Should have 2 titles - the original and the updated one
    expect(media.titles).to.have.lengthOf(2)
  })
}

export const concurrentUpserts = async () => {
  const { default: client } = await import('../src/worker/prisma')
  
  // Clear any existing data first
  await client.media.deleteMany({})
  
  // Simulate the issue from the user's code - multiple concurrent upserts
  const mediaItems = Array.from({ length: 10 }, (_, i) => ({
    uri: `test:upsert-${i}`,
    origin: 'test',
    id: `upsert-${i}`,
    url: `http://example.com/media/${i}`
  }))
  
  // Run upserts concurrently like in the user's code
  const promises = mediaItems.map(async (media, i) => {
    try {
      const upsertedMedia = await client.media.upsert({
        where: { uri: media.uri },
        update: { url: media.url },
        create: media,
      })
      return upsertedMedia
    } catch (error) {
      console.error('Error upserting media', error)
      throw error
    }
  })
  
  // All upserts should complete without errors
  const results = await Promise.all(promises)
  
  expect(results).to.have.lengthOf(10)
  results.forEach((media, i) => {
    expect(media.uri).to.equal(`test:upsert-${i}`)
    expect(media.url).to.equal(`http://example.com/media/${i}`)
  })
}
