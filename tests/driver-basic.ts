import { expect } from 'chai'
import { WaSQLiteDrizzleDriver, createWaSQLiteDB } from '../src/worker/database/drizzle-driver.js'

export const driverBasic = {
  'basic driver tests': {
    'should initialize and close': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-basic.db')

      expect(driver.isInitialized()).to.be.true
      expect(driver.getDatabaseName()).to.equal('test-basic.db')

      await driver.close()
      expect(driver.isInitialized()).to.be.false
    },

    'should create table and insert data with raw SQL': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-sql.db')

      try {
        // Create table via raw SQL (bypassing drizzle for simplicity)
        await driver['runQuery'](`
          CREATE TABLE test_basic (
            id INTEGER PRIMARY KEY,
            name TEXT
          )
        `, [])

        // Insert data
        await driver['runQuery']('INSERT INTO test_basic (name) VALUES (?)', ['test'])

        // Get last insert ID
        const lastId = await driver.getLastInsertRowId()
        expect(lastId).to.equal(1)

        // Query data
        const results = await driver['getQueryResults']('SELECT * FROM test_basic', [])
        expect(results).to.have.length(1)
        expect(results[0]?.name).to.equal('test')

      } finally {
        await driver.close()
      }
    },

    'should handle transactions': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-transaction.db')

      try {
        await driver['runQuery'](`
          CREATE TABLE test_trans (
            id INTEGER PRIMARY KEY,
            value TEXT
          )
        `, [])

        const result = await driver.transaction(async () => {
          await driver['runQuery']('INSERT INTO test_trans (value) VALUES (?)', ['value1'])
          await driver['runQuery']('INSERT INTO test_trans (value) VALUES (?)', ['value2'])
          return 'success'
        })

        expect(result).to.equal('success')

        const rows = await driver['getQueryResults']('SELECT COUNT(*) as count FROM test_trans', [])
        expect(rows[0]?.count).to.equal(2)

      } finally {
        await driver.close()
      }
    },

    'should handle transaction rollback': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-rollback.db')

      try {
        await driver['runQuery'](`
          CREATE TABLE test_rollback (
            id INTEGER PRIMARY KEY,
            value TEXT UNIQUE
          )
        `, [])

        let errorThrown = false
        try {
          await driver.transaction(async () => {
            await driver['runQuery']('INSERT INTO test_rollback (value) VALUES (?)', ['value1'])
            await driver['runQuery']('INSERT INTO test_rollback (value) VALUES (?)', ['value1']) // Should fail
          })
        } catch (error) {
          errorThrown = true
        }

        expect(errorThrown).to.be.true

        const rows = await driver['getQueryResults']('SELECT COUNT(*) as count FROM test_rollback', [])
        expect(rows[0]?.count).to.equal(0) // Should be rolled back

      } finally {
        await driver.close()
      }
    },

    'should throw error when not initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      const db = driver.getDrizzleDB()

      // This should fail because driver is not initialized
      await expect(db.run('SELECT 1')).to.be.rejectedWith('Driver not initialized')
    }
  }
}
