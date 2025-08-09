import { createWaSQLiteDB } from './drizzle-driver'
export { WaSQLiteDrizzleDriver, createWaSQLiteDB } from './drizzle-driver'
import * as schema from './schema'
// @ts-expect-error
import SQLInit from '../../../drizzle/0000_init.sql?raw'

const db = await createWaSQLiteDB(
  '',
  { schema }
)
await db.run(SQLInit)

export default db
