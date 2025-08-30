import * as schema from './schema'
import { WaSQLiteDrizzleDriver } from './drizzle-adapter'
// @ts-expect-error
import SQLInit from '../../../drizzle/0000_init.sql?raw'
import { generateTableNotifyTriggers } from './utils'

const driver = new WaSQLiteDrizzleDriver()
await driver.init()
const database = driver.getDrizzleDB<typeof schema>({ schema })
await database.run(SQLInit)

export type Database = typeof database

await generateTableNotifyTriggers(database, 'media', 'uri')
await generateTableNotifyTriggers(database, 'episode', 'uri')

setInterval(async () => {
  console.log('notifications', await database.query.notifyTable.findMany())
}, 1000)

export default database
