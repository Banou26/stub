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

  const exec = async (sql: string, params: SQLiteCompatibleType[], method: string) => {
    if (method === 'run') {
      for await (const stmt of sqlite3.statements(database, sql)) {
        if (params.length > 0) {
          sqlite3.bind_collection(stmt, params)
        }
        await sqlite3.step(stmt)
      }
      sqlite3.changes(database)
      return { rows: [] }
    } else {
      const rows = [] as SQLiteCompatibleType[][]
      for await (const stmt of sqlite3.statements(database, sql)) {
        if (params.length > 0) {
          sqlite3.bind_collection(stmt, params)
        }
        while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const rowData = sqlite3.row(stmt)
          rows.push(rowData)
        }
      }
      return (
        method === 'get'
          ? { rows: rows[0] ?? [] }
          : { rows }
      )
    }
  }

  return drizzle(
    async (sql, params: SQLiteCompatibleType[], method) => {
      const release = await mutex.acquire()
      try {
        return await exec(sql, params, method)
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
