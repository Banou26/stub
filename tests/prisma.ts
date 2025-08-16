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
          title: 'Bar',
          language: 'en'
        }
      },
      covers: {
        create: {
          url: 'http://example.com/bar',
          language: 'en'
        }
      }
    },
    include: {
      titles: true,
      covers: true
    }
  })

  console.log('createdMedia', createdMedia)

  // expect(createdMedia).to.shallowDeepEqual({
  //   uri: 'test:bar',
  //   origin: 'test',
  //   id: 'bar',
  //   titles: [{
  //     title: 'Bar',
  //     language: 'en'
  //   }],
  //   covers: [{
  //     url: 'http://example.com/bar'
  //   }]
  // })
}
