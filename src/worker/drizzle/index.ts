import * as schema from './schema'
import makeDrizzle from './drizzle-adapter'
// @ts-expect-error
import SQLInit from '../../../drizzle/0000_init.sql?raw'
import { generateTableNotifyTriggers, startNotificationRootListener } from './notifications'

const database = await makeDrizzle<typeof schema>({ schema })

try {
  await database.run(SQLInit)
  await generateTableNotifyTriggers(database, 'media', 'uri')
  await generateTableNotifyTriggers(database, 'media', '_id')
  await generateTableNotifyTriggers(database, 'episode', 'uri')
  await generateTableNotifyTriggers(database, 'episode', '_id')
} catch (err) {
  console.error(err)
  throw err
}

startNotificationRootListener(database)

export type Database = typeof database

export default database
