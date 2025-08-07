import { expect } from 'chai'
import { WaSQLiteDrizzleDriver } from '../src/worker/database/drizzle-driver.js'

export const driverUnit = {
  'driver unit tests': {
    'should create driver instance': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      expect(driver).to.be.instanceOf(WaSQLiteDrizzleDriver)
      expect(driver.isInitialized()).to.be.false
      expect(driver.getDatabaseName()).to.be.null
    },

    'should provide drizzle instance': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      const db = driver.getDrizzleDB()
      
      expect(db).to.not.be.null
      expect(db).to.have.property('run')
      expect(db).to.have.property('all')  
      expect(db).to.have.property('get')
    },

    'should handle error when not initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      const db = driver.getDrizzleDB()
      
      try {
        await db.run('SELECT 1')
        expect.fail('Should have thrown error')
      } catch (error) {
        expect(error.message).to.include('Driver not initialized')
      }
    },

    'should handle initialization state correctly': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      // Initially not initialized
      expect(driver.isInitialized()).to.be.false
      expect(driver.getDatabaseName()).to.be.null
      
      // Try to initialize (will fail in test environment, but state should be handled)
      try {
        await driver.initialize('test.db')
        // If it succeeds, verify state
        expect(driver.isInitialized()).to.be.true
        expect(driver.getDatabaseName()).to.equal('test.db')
        await driver.close()
      } catch (error) {
        // Expected to fail in test environment - that's fine
        expect(error.message).to.include('Failed to initialize database')
        // State should remain unchanged
        expect(driver.isInitialized()).to.be.false
        expect(driver.getDatabaseName()).to.be.null
      }
    },

    'should handle multiple initialization attempts': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      // Both should fail in test environment, but we test the logic
      let firstError: Error | null = null
      let secondError: Error | null = null
      
      try {
        await driver.initialize('test1.db')
      } catch (error) {
        firstError = error as Error
      }
      
      try {
        await driver.initialize('test2.db') 
      } catch (error) {
        secondError = error as Error
      }
      
      expect(firstError).to.not.be.null
      expect(secondError).to.not.be.null
      expect(driver.isInitialized()).to.be.false
    },

    'should handle transaction method signature': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      try {
        const result = await driver.transaction(async () => {
          return 'test-result'
        })
        expect.fail('Should have thrown error for uninitialized driver')
      } catch (error) {
        expect(error.message).to.include('Driver not initialized')
      }
    },

    'should handle getLastInsertRowId when not initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      try {
        await driver.getLastInsertRowId()
        expect.fail('Should have thrown error for uninitialized driver')  
      } catch (error) {
        expect(error.message).to.include('Database not initialized')
      }
    },

    'should handle close when not initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      
      // Should not throw error
      await driver.close()
      
      expect(driver.isInitialized()).to.be.false
      expect(driver.getDatabaseName()).to.be.null
    }
  }
}