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
    title: 'Bar'
  }
})
console.log('media count', await client.media.count())
console.log('media', (await client.media.findMany({})).map(o => ({...o})))
