import { createWaSQLiteDB } from './drizzle-driver'
export { WaSQLiteDrizzleDriver, createWaSQLiteDB } from './drizzle-driver'

// @ts-expect-error
import SQLInit from '../../../drizzle/0000_happy_scalphunter.sql?raw'
console.log('SQLInit', SQLInit)

const db = await createWaSQLiteDB(
  '',
  {}
)
console.log('db', db)
db.run(SQLInit)
