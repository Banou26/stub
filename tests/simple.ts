import { expect } from 'chai'

import { WaSQLiteDrizzleDriver } from '../src/worker/database/drizzle-driver.js'

export const simple = {
  'driver type tests': {
    'should import driver class': async () => {
      expect(WaSQLiteDrizzleDriver).to.be.a('function')

      const driver = new WaSQLiteDrizzleDriver()
      expect(driver.isInitialized()).to.be.false
      expect(driver.getDatabaseName()).to.be.null
    }
  }
}
