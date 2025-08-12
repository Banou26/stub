import { expose } from 'osra'
import './prisma'

import client from './prisma'

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

export const resolvers = {
  HANDLE_REQUEST: async (request: { foo: string }) => {
    console.log('Handling request...')
    return undefined
  }
}

export type Resolvers = typeof resolvers

await expose<{}>(
  resolvers,
  { local: globalThis as unknown as Worker, remote: globalThis as unknown as Worker }
)
