// import { createWaSQLiteDB } from './drizzle-driver'
// export { WaSQLiteDrizzleDriver, createWaSQLiteDB } from './drizzle-driver'
// import * as schema from './schema'
// @ts-expect-error
// import SQLInit from '../../../drizzle/0000_init.sql?raw'
// import { getPrismaClient } from './prisma-client-proxy'

// const db = await createWaSQLiteDB(
//   '',
//   { schema }
// )
// await db.run(SQLInit)

// export default db

console.log('aa')
try {
  const { getPrismaClient } = await import('./prisma-client-proxy')
  const client = await getPrismaClient()
  console.log('media count', client.media.count())
} catch (err) {
  console.log('err')
  console.error(err)
}
