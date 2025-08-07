import { expect } from 'chai'
import { WaSQLiteDrizzleDriver, createWaSQLiteDB } from '../src/worker/database/drizzle-driver.js'
import { usersTable } from '../src/worker/database/schema.js'

export const waSQLiteDriver = {
  'driver initialization': {
    'should initialize successfully': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-init.db')

      expect(driver.isInitialized()).to.be.true
      expect(driver.getDatabaseName()).to.equal('test-init.db')

      await driver.close()
    },

    'should not re-initialize if already initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-reinit.db')

      const originalDbName = driver.getDatabaseName()
      await driver.initialize('different-name.db') // Should be ignored

      expect(driver.getDatabaseName()).to.equal(originalDbName)

      await driver.close()
    },

    'should use default database name': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize()

      expect(driver.getDatabaseName()).to.equal('myDB')

      await driver.close()
    },

    'should close properly': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-close.db')

      await driver.close()

      expect(driver.isInitialized()).to.be.false
      expect(driver.getDatabaseName()).to.be.null
    }
  },

  'database operations': {
    'should create table and insert data': async () => {
      const db = await createWaSQLiteDB('test-operations.db')

      // Create table
      await db.run(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `)

      // Insert data
      await db.run(
        'INSERT INTO test_users (name, email) VALUES (?, ?)',
        ['John Doe', 'john@example.com']
      )

      // Query data
      const users = await db.all('SELECT * FROM test_users')
      expect(users).to.have.length(1)
      expect((users[0] as any).id).to.equal(1)
      expect((users[0] as any).name).to.equal('John Doe')
      expect((users[0] as any).email).to.equal('john@example.com')
    },

    'should handle multiple inserts': async () => {
      const db = await createWaSQLiteDB('test-multiple.db')

      await db.run(`
        CREATE TABLE test_items (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `)

      // Insert multiple items
      for (let i = 1; i <= 3; i++) {
        await db.run(
          'INSERT INTO test_items (value) VALUES (?)',
          [`value ${i}`]
        )
      }

      const items = await db.all('SELECT * FROM test_items ORDER BY id')
      expect(items).to.have.length(3)
      expect(items.map(item => (item as any).value)).to.deep.equal(['value 1', 'value 2', 'value 3'])
    },

    'should handle get method (single row)': async () => {
      const db = await createWaSQLiteDB('test-get.db')

      await db.run(`
        CREATE TABLE test_single (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `)

      await db.run('INSERT INTO test_single (name) VALUES (?)', ['single'])

      const result = await db.get('SELECT * FROM test_single WHERE id = ?', [1])
      expect((result as any).id).to.equal(1)
      expect((result as any).name).to.equal('single')
    },

    'should return empty result for non-existent data': async () => {
      const db = await createWaSQLiteDB('test-empty.db')

      await db.run(`
        CREATE TABLE empty_table (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `)

      const result = await db.get('SELECT * FROM empty_table WHERE id = ?', [999])
      expect(result).to.be.undefined
    }
  },

  'drizzle integration': {
    'should work with drizzle schema': async () => {
      const db = await createWaSQLiteDB('test-drizzle.db', {
        schema: { usersTable }
      })

      // Create table using drizzle
      await db.run(`
        CREATE TABLE IF NOT EXISTS users_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          age INTEGER NOT NULL,
          email TEXT NOT NULL UNIQUE
        )
      `)

      // Insert using drizzle
      const insertResult = await db.insert(usersTable).values({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com'
      }).run()

      expect((insertResult as any).changes).to.be.greaterThan(0)

      // Query using drizzle
      const users = await db.select().from(usersTable).all()
      expect(users).to.have.length(1)
      expect(users[0]?.name).to.equal('Alice')
      expect(users[0]?.age).to.equal(30)
    }
  },

  'transactions': {
    'should commit successful transactions': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-transaction-commit.db')

      const db = driver.getDrizzleDB()

      await db.run(`
        CREATE TABLE test_transaction (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `)

      const result = await driver.transaction(async () => {
        await db.run('INSERT INTO test_transaction (value) VALUES (?)', ['test1'])
        await db.run('INSERT INTO test_transaction (value) VALUES (?)', ['test2'])
        return 'success'
      })

      expect(result).to.equal('success')

      const items = await db.all('SELECT * FROM test_transaction')
      expect(items).to.have.length(2)

      await driver.close()
    },

    'should rollback failed transactions': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-transaction-rollback.db')

      const db = driver.getDrizzleDB()

      await db.run(`
        CREATE TABLE test_rollback (
          id INTEGER PRIMARY KEY,
          value TEXT UNIQUE
        )
      `)

      try {
        await driver.transaction(async () => {
          await db.run('INSERT INTO test_rollback (value) VALUES (?)', ['test1'])
          await db.run('INSERT INTO test_rollback (value) VALUES (?)', ['test1']) // This should fail due to UNIQUE constraint
        })
      } catch (error) {
        // Transaction should fail
      }

      const items = await db.all('SELECT * FROM test_rollback')
      expect(items).to.have.length(0) // Should be rolled back

      await driver.close()
    }
  },

  'error handling': {
    'should throw error when not initialized': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      const db = driver.getDrizzleDB()

      await expect(db.run('SELECT 1')).to.be.rejectedWith('Driver not initialized')
    },

    'should handle SQL syntax errors': async () => {
      const db = await createWaSQLiteDB('test-sql-error.db')

      await expect(db.run('INVALID SQL SYNTAX')).to.be.rejected
    },

    'should handle constraint violations': async () => {
      const db = await createWaSQLiteDB('test-constraint.db')

      await db.run(`
        CREATE TABLE test_constraints (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE
        )
      `)

      await db.run('INSERT INTO test_constraints (email) VALUES (?)', ['test@example.com'])

      // This should fail due to UNIQUE constraint
      await expect(
        db.run('INSERT INTO test_constraints (email) VALUES (?)', ['test@example.com'])
      ).to.be.rejected
    }
  },

  'utility methods': {
    'should get last insert row id': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-last-id.db')

      const db = driver.getDrizzleDB()

      await db.run(`
        CREATE TABLE test_auto_id (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT
        )
      `)

      await db.run('INSERT INTO test_auto_id (value) VALUES (?)', ['test'])

      const lastId = await driver.getLastInsertRowId()
      expect(lastId).to.equal(1)

      await driver.close()
    }
  },

  'batch operations': {
    'should handle batch queries': async () => {
      const driver = new WaSQLiteDrizzleDriver()
      await driver.initialize('test-batch.db')

      const db = driver.getDrizzleDB()

      await db.run(`
        CREATE TABLE test_batch (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `)

      // Create batch queries manually (since we're testing the internal method)
      const queries = [
        { sql: 'INSERT INTO test_batch (value) VALUES (?)', params: ['batch1'], method: 'run' as const },
        { sql: 'INSERT INTO test_batch (value) VALUES (?)', params: ['batch2'], method: 'run' as const },
        { sql: 'INSERT INTO test_batch (value) VALUES (?)', params: ['batch3'], method: 'run' as const }
      ]

      // Execute as transaction to test batch behavior
      await driver.transaction(async () => {
        for (const query of queries) {
          await db.run(query.sql, query.params)
        }
      })

      const items = await db.all('SELECT * FROM test_batch ORDER BY id')
      expect(items).to.have.length(3)
      expect(items.map(item => (item as any).value)).to.deep.equal(['batch1', 'batch2', 'batch3'])

      await driver.close()
    }
  }
}
