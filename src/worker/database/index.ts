import client from './prisma-client'

console.log('media count', await client.media.count())
await client.media.create({
  data: {
    uid: 'test:en:foo',
    origin: 'test',
    id: 'foo',
    language: 'en',
    title: 'Foo'
  }
})
await client.media.create({
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
console.log('media count', await client.media.count())
console.log('media', (await client.media.findMany({ include: { covers: true } })).map(o => ({...o})))
