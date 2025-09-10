import type { DrizzleConfig } from 'drizzle-orm'

import { drizzle } from 'drizzle-orm/sqlite-proxy'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import { Mutex } from 'async-mutex'

export default async <TSchema extends Record<string, unknown> = Record<string, never>>(config?: DrizzleConfig<TSchema>) => {
  // @ts-expect-error
  const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
  const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
  const sqlite3 = SQLite.Factory(module) as SQLiteAPI
  const database = await sqlite3.open_v2(':memory:')
  const mutex = new Mutex()

  return drizzle(
    async (sql, params: SQLiteCompatibleType[], method) => {
      const release = await mutex.acquire()
      try {
        let currentIndex = 0
        for await (const stmt of sqlite3.statements(database, sql)) {
          const paramCount = sqlite3.bind_parameter_count(stmt)
          sqlite3.bind_collection(stmt, params.slice(currentIndex, paramCount))
          currentIndex = currentIndex + paramCount
          const rows = [] as SQLiteCompatibleType[][]
          while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            const row = sqlite3.row(stmt)
            rows.push(row)
          }
          const changes = sqlite3.changes(database)
          if (changes) {
            // WARNING: we only supports single statement queries
            return (
              method === 'get'
                ? { rows: rows[0] ?? [] }
                : { rows }
            )
          }
        }
        return { rows: [] }
      } catch (error) {
        console.error('wa-sqlite query error:', error)
        throw error
      } finally {
        release()
      }
    },
    async () => {
      throw new Error('Not implemented')
    },
    config
  )
}
