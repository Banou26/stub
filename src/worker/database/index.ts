import client from './prisma-client'

console.log('media count', await client.media.count())
await client.media.create({
  data: {
    id: 'foo:bar',
    name: 'bar',
  }
})
console.log('media count', await client.media.count())
