import * as schema from './schema'
import { WaSQLiteDrizzleDriver } from './drizzle-adapter'
// @ts-expect-error
import SQLInit from '../../../drizzle/0000_init.sql?raw'

const driver = new WaSQLiteDrizzleDriver()
await driver.init()
const database = driver.getDrizzleDB<typeof schema>({ schema })
await database.run(SQLInit)

export default database
