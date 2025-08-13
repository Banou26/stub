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

  expect(createdMedia).to.shallowDeepEqual({
    uid: 'test:en:bar',
    origin: 'test',
    id: 'bar',
    language: 'en',
    title: 'Bar',
    covers: [{
      url: 'http://example.com/bar'
    }]
  })
}
