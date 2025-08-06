import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'

const module = await SQLiteESMFactory()
const sqlite3 = SQLite.Factory(module)
const db = await sqlite3.open_v2('myDB')

const run = async (sql: string, params = [] as SQLiteCompatibleType[]) => {
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length > 0) {
      sqlite3.bind_collection(stmt, params)
    }
    await sqlite3.step(stmt)
  }
  return sqlite3.changes(db)
}

export const runQuery = async (sql: string, params: SQLiteCompatibleType[]) => {
    for await (const stmt of sqlite3.statements(db, sql)) {
      if (params.length > 0) {
        sqlite3.bind_collection(stmt, params as SQLiteCompatibleType[])
      }
      await sqlite3.step(stmt)
    }
    return sqlite3.changes(db)
}

export async function getQueryResults(sql: string, params: SQLiteCompatibleType[]) {
  const results: any[] = []

  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length > 0) {
      sqlite3.bind_collection(stmt, params as SQLiteCompatibleType[])
    }

    const columnNames = sqlite3.column_names(stmt)

    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      const rowData = sqlite3.row(stmt)

      results.push(
        Object.fromEntries(
          columnNames.map((columnName, index) => [columnName, rowData[index]])
        )
      )
    }
  }

  return results
}

export async function transaction(callback: () => Promise<void>) {
  try {
    await run('BEGIN TRANSACTION')
    await callback()
    await run('COMMIT')
  } catch (error) {
    await run('ROLLBACK')
    throw error
  }
}
