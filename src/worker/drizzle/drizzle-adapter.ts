import type { DrizzleConfig } from 'drizzle-orm'

import { drizzle } from 'drizzle-orm/sqlite-proxy'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import { Mutex } from 'async-mutex'

type WaSQLiteValue = string | number | bigint | boolean | null | Uint8Array

export class WaSQLiteDrizzleDriver {
  private sqlite3?: SQLiteAPI
  private db?: number
  private mutex = new Mutex()

  async init() {
    if (this.db || this.sqlite3) return

    // @ts-expect-error
    const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
    const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
    this.sqlite3 = SQLite.Factory(module)
    this.db = await this.sqlite3.open_v2(':memory:')
  }

  private async executeQuery(sql: string, params: any[], method: string) {
    if (!this.db || !this.sqlite3) throw new Error('Database not initialized')
    const unlock = await this.mutex.acquire()
    try {
      switch (method) {
        case 'run':
          await this.runQuery(sql, params)
          return { rows: [] }

        case 'get':
          const singleResult = await this.getQueryResults(sql, params)
          return { rows: singleResult.length > 0 ? Object.values(singleResult[0]) : [] }

        case 'all':
          const allResults = await this.getQueryResults(sql, params)
          return { rows: allResults.map(row => Object.values(row)) }

        case 'values':
          const valueResults = await this.getQueryResults(sql, params)
          return { rows: valueResults.map(row => Object.values(row)) }

        default:
          throw new Error(`Unknown method: ${method}`)
      }
    } catch (error) {
      console.error('wa-sqlite query error:', error)
      throw error
    } finally {
      unlock()
    }
  }

  private async runQuery(sql: string, params: WaSQLiteValue[]) {
    if (!this.db || !this.sqlite3) throw new Error('Database not initialized')
    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length > 0) {
        this.sqlite3.bind_collection(stmt, params)
      }
      await this.sqlite3.step(stmt)
    }
    return this.sqlite3.changes(this.db)
  }

  private async getQueryResults(sql: string, params: WaSQLiteValue[]) {
    if (!this.db || !this.sqlite3) throw new Error('Database not initialized')
    const results: any[] = []

    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length > 0) {
        this.sqlite3.bind_collection(stmt, params)
      }

      const columnNames = this.sqlite3.column_names(stmt)

      while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
        const rowData = this.sqlite3.row(stmt)

        results.push(
          Object.fromEntries(
            columnNames.map((columnName, index) => [columnName, rowData[index]])
          )
        )
      }
    }

    return results
  }

  private async executeBatch(queries: Array<{
    sql: string
    params: any[]
    method: string
  }>) {
    if (!this.db || !this.sqlite3) throw new Error('Database not initialized')

    await this.runQuery('BEGIN TRANSACTION', [])

    try {
      const results = []
      for (const query of queries) {
        const result = await this.executeQuery(query.sql, query.params, query.method)
        results.push(result)
      }

      await this.runQuery('COMMIT', [])
      return results
    } catch (error) {
      await this.runQuery('ROLLBACK', [])
      throw error
    }
  }

  getDrizzleDB<TSchema extends Record<string, unknown> = Record<string, never>>(config?: DrizzleConfig<TSchema>) {
    return drizzle(
      async (sql: string, params: any[], method: string) => {
        return await this.executeQuery(sql, params, method)
      },
      async (queries) => {
        return await this.executeBatch(queries)
      },
      config
    )
  }

  async close() {
    if (!this.db || !this.sqlite3) throw new Error('Database not initialized')
    if (this.db) {
      await this.sqlite3.close(this.db)
      this.db = undefined
      this.sqlite3 = undefined
    }
  }

  async transaction(callback: () => Promise<void>) {
    try {
      await this.runQuery('BEGIN TRANSACTION', [])
      await callback()
      await this.runQuery('COMMIT', [])
    } catch (error) {
      await this.runQuery('ROLLBACK', [])
      throw error
    }
  }
}
