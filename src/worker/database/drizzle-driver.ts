import type { DrizzleConfig } from 'drizzle-orm'

import { drizzle } from 'drizzle-orm/sqlite-proxy'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'

type WaSQLiteValue = string | number | bigint | boolean | null | Uint8Array

// Type definitions for wa-sqlite API (using any for flexibility with the actual API)
interface SQLiteAPI {
  open_v2(filename: string, flags: number): Promise<number>
  close(db: number): Promise<number>
  statements(db: number, sql: string): AsyncIterable<number>
  bind_collection(stmt: number, values: WaSQLiteValue[]): number
  step(stmt: number): Promise<number>
  column_names(stmt: number): string[]
  row(stmt: number): WaSQLiteValue[]
  changes(db: number): number
  last_insert_rowid(db: number): number
  [key: string]: any // Allow additional properties
}

interface QueryResult {
  rows: WaSQLiteValue[][]
}

interface BatchQuery {
  sql: string
  params: WaSQLiteValue[]
  method: 'run' | 'get' | 'all' | 'values'
}

class WaSQLiteDriverError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'WaSQLiteDriverError'
  }
}

class WaSQLiteConnectionError extends WaSQLiteDriverError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause)
    this.name = 'WaSQLiteConnectionError'
  }
}

class WaSQLiteQueryError extends WaSQLiteDriverError {
  constructor(
    message: string,
    public readonly sql?: string,
    cause?: Error
  ) {
    super(message, 'QUERY_ERROR', cause)
    this.name = 'WaSQLiteQueryError'
  }
}

export class WaSQLiteDrizzleDriver {
  private sqlite3: SQLiteAPI | null = null
  private db: number | null = null
  private initialized = false
  private dbName: string | null = null

  async initialize(dbName: string = 'myDB'): Promise<void> {
    if (this.initialized) return

    try {
      // @ts-expect-error
      const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
      const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
      this.sqlite3 = SQLite.Factory(module) as any

      if (!this.sqlite3) {
        throw new WaSQLiteConnectionError('Failed to create SQLite factory')
      }

      this.db = await this.sqlite3.open_v2(
        dbName,
        SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE
      )

      if (!this.db) {
        throw new WaSQLiteConnectionError(`Failed to open database: ${dbName}`)
      }

      this.dbName = dbName
      this.initialized = true
    } catch (error) {
      throw new WaSQLiteConnectionError(
        `Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  private async executeQuery(
    sql: string,
    params: WaSQLiteValue[],
    method: 'run' | 'get' | 'all' | 'values'
  ): Promise<QueryResult> {
    if (!this.initialized || !this.db || !this.sqlite3) {
      throw new WaSQLiteConnectionError('Driver not initialized')
    }

    try {
      switch (method) {
        case 'run':
          await this.runQuery(sql, params)
          return { rows: [] }

        case 'get':
          const singleResult = await this.getQueryResults(sql, params)
          return { rows: singleResult.length > 0 ? [Object.values(singleResult[0]!)] : [] }

        case 'all':
          const allResults = await this.getQueryResults(sql, params)
          return { rows: allResults.map(row => Object.values(row)) }

        case 'values':
          const valueResults = await this.getQueryResults(sql, params)
          return { rows: valueResults.map(row => Object.values(row)) }

        default:
          throw new WaSQLiteQueryError(`Unknown method: ${method}`, sql)
      }
    } catch (error) {
      if (error instanceof WaSQLiteDriverError) {
        throw error
      }
      throw new WaSQLiteQueryError(
        `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sql,
        error instanceof Error ? error : undefined
      )
    }
  }

  private async runQuery(sql: string, params: WaSQLiteValue[]): Promise<number> {
    if (!this.sqlite3 || !this.db) {
      throw new WaSQLiteConnectionError('Database not initialized')
    }

    try {
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        if (params.length > 0) {
          this.sqlite3.bind_collection(stmt, params)
        }
        await this.sqlite3.step(stmt)
      }
      return this.sqlite3.changes(this.db)
    } catch (error) {
      throw new WaSQLiteQueryError(
        `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sql,
        error instanceof Error ? error : undefined
      )
    }
  }

  private async getQueryResults(sql: string, params: WaSQLiteValue[]): Promise<Record<string, WaSQLiteValue>[]> {
    if (!this.sqlite3 || !this.db) {
      throw new WaSQLiteConnectionError('Database not initialized')
    }

    const results: Record<string, WaSQLiteValue>[] = []

    try {
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        if (params.length > 0) {
          this.sqlite3.bind_collection(stmt, params)
        }

        const columnNames = this.sqlite3.column_names(stmt)

        while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const rowData = this.sqlite3.row(stmt)

          const rowObject: Record<string, WaSQLiteValue> = {}
          columnNames.forEach((columnName, index) => {
            const value = rowData[index]
            if (value !== undefined) {
              rowObject[columnName] = value
            }
          })
          results.push(rowObject)
        }
      }

      return results
    } catch (error) {
      throw new WaSQLiteQueryError(
        `Failed to get query results: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sql,
        error instanceof Error ? error : undefined
      )
    }
  }

  private async executeBatch(queries: BatchQuery[]): Promise<QueryResult[]> {
    if (!this.initialized || !this.db) {
      throw new WaSQLiteConnectionError('Driver not initialized')
    }

    await this.runQuery('BEGIN TRANSACTION', [])

    try {
      const results: QueryResult[] = []
      for (const query of queries) {
        const result = await this.executeQuery(query.sql, query.params, query.method)
        results.push(result)
      }

      await this.runQuery('COMMIT', [])
      return results
    } catch (error) {
      try {
        await this.runQuery('ROLLBACK', [])
      } catch (rollbackError) {
        throw new WaSQLiteQueryError(
          `Transaction failed and rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          rollbackError instanceof Error ? rollbackError : undefined
        )
      }
      throw error
    }
  }

  getDrizzleDB<TSchema extends Record<string, unknown> = Record<string, never>>(
    config?: DrizzleConfig<TSchema>
  ) {
    return drizzle(
      async (sql: string, params: any[], method: string) => {
        return await this.executeQuery(sql, params, method as 'run' | 'get' | 'all' | 'values')
      },
      async (queries) => {
        return await this.executeBatch(queries)
      },
      config
    )
  }

  async close(): Promise<void> {
    if (this.db && this.sqlite3) {
      try {
        await this.sqlite3.close(this.db)
      } catch (error) {
        throw new WaSQLiteConnectionError(
          `Failed to close database: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined
        )
      } finally {
        this.db = null
        this.sqlite3 = null
        this.initialized = false
        this.dbName = null
      }
    }
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.initialized || !this.db) {
      throw new WaSQLiteConnectionError('Driver not initialized')
    }

    try {
      await this.runQuery('BEGIN TRANSACTION', [])
      const result = await callback()
      await this.runQuery('COMMIT', [])
      return result
    } catch (error) {
      try {
        await this.runQuery('ROLLBACK', [])
      } catch (rollbackError) {
        throw new WaSQLiteQueryError(
          `Transaction failed and rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          rollbackError instanceof Error ? rollbackError : undefined
        )
      }
      throw error
    }
  }

  // Additional utility methods
  isInitialized(): boolean {
    return this.initialized
  }

  getDatabaseName(): string | null {
    return this.dbName
  }

  async getLastInsertRowId(): Promise<number> {
    if (!this.sqlite3 || !this.db) {
      throw new WaSQLiteConnectionError('Database not initialized')
    }
    return this.sqlite3.last_insert_rowid(this.db)
  }
}

export async function createWaSQLiteDB<TSchema extends Record<string, unknown>>(
  dbName?: string,
  config?: DrizzleConfig<TSchema>
) {
  const driver = new WaSQLiteDrizzleDriver()
  await driver.initialize(dbName)
  return driver.getDrizzleDB(config)
}
