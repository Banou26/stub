import { createWaSQLiteDB } from './drizzle-driver.js'

async function testDriver() {
  try {
    console.log('Initializing wa-sqlite DrizzleORM driver...')
    const db = await createWaSQLiteDB('test.db')
    
    console.log('Testing basic SQL execution...')
    await db.run(`
      CREATE TABLE IF NOT EXISTS test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value TEXT
      )
    `)
    
    console.log('Inserting test data...')
    await db.run(`
      INSERT INTO test_table (name, value) VALUES (?, ?)
    `, ['test', 'hello world'])
    
    console.log('Querying data...')
    const results = await db.all('SELECT * FROM test_table')
    console.log('Results:', results)
    
    console.log('wa-sqlite DrizzleORM driver test completed successfully!')
    return true
  } catch (error) {
    console.error('Test failed:', error)
    return false
  }
}

testDriver()