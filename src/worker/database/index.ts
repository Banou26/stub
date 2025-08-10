// import { createWaSQLiteDB } from './drizzle-driver'
// export { WaSQLiteDrizzleDriver, createWaSQLiteDB } from './drizzle-driver'
// import * as schema from './schema'
// @ts-expect-error
// import SQLInit from '../../../drizzle/0000_init.sql?raw'
console.log('aaa')

import { getPrismaClient } from './prisma-client-proxy'
const client = await getPrismaClient()
console.log('client', client)
console.log('media count', await client.media.count())
