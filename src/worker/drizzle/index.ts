import * as schema from './schema'
import { WaSQLiteDrizzleDriver } from './drizzle-adapter'
// @ts-expect-error
import SQLInit from '../../../drizzle/0000_init.sql?raw'
import { generateTableNotifyTriggers, startNotificationRootListener } from './notifications'

const driver = new WaSQLiteDrizzleDriver()
await driver.init()
const database = driver.getDrizzleDB<typeof schema>({ schema })

try {
  await database.run(SQLInit)
  await generateTableNotifyTriggers(database, 'media', 'uri')
  await generateTableNotifyTriggers(database, 'episode', 'uri')
} catch (err) {
  console.error(err)
  throw err
}

startNotificationRootListener(database)

export type Database = typeof database

export default database
