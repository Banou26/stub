import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

use(chaiAsPromised)

export const test = async () => {
  await expect(true).to.equal(true)
  console.log('Starting Prisma test...')

  try {
    console.log('Fetching Prisma client...')
    const { default: client } = await import('../src/worker/database/prisma-client')
    console.log('Prisma client created:', client)

    const count = await client.media.count()
    console.log('Media count:', count)

    await expect(true).to.equal(true)
    console.log('Test passed!')
  } catch (error) {
    console.error('Test failed:', error)
    throw error
  }
}

export const create = async () => {
  const { default: client } = await import('../src/worker/database/prisma-client')

  const createdMedia = await client.media.create({
    data: {
      uid: 'test:en:bar',
      origin: 'test',
      id: 'bar',
      language: 'en',
      title: 'Bar',
      covers: {
        create: {
          url: 'http://example.com/bar'
        }
      }
    },
    include: {
      covers: true
    }
  })

  // Check that the media was created with the correct basic fields
  await expect(createdMedia.uid).to.equal('test:en:bar')
  await expect(createdMedia.origin).to.equal('test')
  await expect(createdMedia.id).to.equal('bar')
  await expect(createdMedia.language).to.equal('en')
  await expect(createdMedia.title).to.equal('Bar')

  // Check that the cover was created
  await expect(createdMedia.covers).to.be.an('array')
  await expect(createdMedia.covers).to.have.lengthOf(1)
  await expect(createdMedia.covers[0].url).to.equal('http://example.com/bar')
}
