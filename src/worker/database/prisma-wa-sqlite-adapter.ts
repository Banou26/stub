/* eslint-disable @typescript-eslint/require-await */

import {
  ConnectionInfo,
  Debug,
  DriverAdapterError,
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
  SqlResultSet,
  Transaction,
  TransactionOptions,
  // ColumnType,
} from '@prisma/driver-adapter-utils'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
// import type { SQLiteAPI } from 'wa-sqlite'

const debug = Debug('prisma:driver-adapter:wa-sqlite')

// Constants
const MAX_BIND_VALUES = 32766 // SQLite limit

// Type definitions for wa-sqlite
type WaSQLiteDB = number
type WaSQLiteStmt = number

interface WaSQLiteAdapter {
  sqlite3: SQLiteAPI
  db: WaSQLiteDB
}

// Utility functions
function cleanArg(arg: unknown, argType?: unknown): unknown {
  if (arg === undefined) return null
  if (arg instanceof Date) return arg.toISOString()
  if (arg instanceof Uint8Array) return Array.from(arg)
  if (typeof arg === 'bigint') return Number(arg)
  return arg
}

function convertDriverError(error: Error): any {
  return {
    kind: 'GenericDatabaseError',
    message: error.message,
  }
}

function getColumnTypes(columnNames: string[], rows: unknown[][]): Record<string, ColumnType> {
  const columnTypes: Record<string, ColumnType> = {}

  if (rows.length === 0) {
    return columnTypes
  }

  const firstRow = rows[0]
  if (!firstRow) {
    return columnTypes
  }

  columnNames.forEach((name, index) => {
    const value = firstRow[index]
    // Map to Prisma ColumnType
    if (value === null || value === undefined) {
      columnTypes[name] = ColumnType.INT32 // Default for NULL
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        columnTypes[name] = ColumnType.INT32
      } else {
        columnTypes[name] = ColumnType.DOUBLE
      }
    } else if (typeof value === 'string') {
      columnTypes[name] = ColumnType.TEXT
    } else if (typeof value === 'bigint') {
      columnTypes[name] = ColumnType.INT64
    } else if (value instanceof Uint8Array || Array.isArray(value)) {
      columnTypes[name] = ColumnType.BYTES
    } else if (value instanceof Date) {
      columnTypes[name] = ColumnType.DATETIME
    } else if (typeof value === 'boolean') {
      columnTypes[name] = ColumnType.BOOL
    } else {
      columnTypes[name] = ColumnType.TEXT // Default
    }
  })

  return columnTypes
}

function mapRow(row: unknown[], columnTypes: ColumnType[]): unknown[] {
  return row.map((value, index) => {
    const type = columnTypes[index]

    if (value === null || value === undefined) {
      return null
    }

    // Handle blob data
    if (type === ColumnType.BYTES && Array.isArray(value)) {
      return new Uint8Array(value)
    }

    // Handle dates stored as ISO strings
    if (type === ColumnType.DATETIME && typeof value === 'string') {
      // Check if it's a date string
      const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      if (dateRegex.test(value)) {
        return new Date(value)
      }
    }

    // Handle bigint conversion
    if (type === ColumnType.INT64 && typeof value === 'number') {
      return BigInt(value)
    }

    return value
  })
}

/**
 * wa-sqlite Queryable implementation
 */
class WaSQLiteQueryable implements SqlQueryable {
  readonly provider = 'sqlite'
  readonly adapterName = 'prisma-wa-sqlite-adapter'

  constructor(protected readonly adapter: WaSQLiteAdapter) {}

  /**
   * Execute a query given as SQL, interpolating the given parameters.
   */
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const tag = '[js::query_raw]'
    debug(`${tag} %O`, query)

    const data = await this.performIO(query) as [string[], unknown[][]]
    return this.convertData(data)
  }

  private convertData(ioResult: [string[], unknown[][]]): SqlResultSet {
    const [columnNames, results] = ioResult

    if (results.length === 0) {
      return {
        columnNames: [],
        columnTypes: [],
        rows: [],
      }
    }

    const columnTypes = Object.values(getColumnTypes(columnNames, results))
    const rows = results.map((row) => mapRow(row, columnTypes))

    return {
      columnNames,
      columnTypes,
      rows,
    }
  }

  /**
   * Execute a query given as SQL, interpolating the given parameters and
   * returning the number of affected rows.
   */
  async executeRaw(query: SqlQuery): Promise<number> {
    const tag = '[js::execute_raw]'
    debug(`${tag} %O`, query)

    const result = await this.performIO(query, true)
    return result as number
  }

  private async performIO(query: SqlQuery, executeRaw = false): Promise<[string[], unknown[][]] | number> {
    const { sqlite3, db } = this.adapter

    try {
      // Clean arguments
      const cleanedArgs = query.args.map((arg, i) => cleanArg(arg, query.argTypes?.[i]))

      // Prepare statement
      const stmtPtr = sqlite3.prepare_v2(db, query.sql)

      if (!stmtPtr) {
        throw new Error('Failed to prepare statement')
      }

      try {
        // Bind parameters
        cleanedArgs.forEach((arg, index) => {
          const paramIndex = index + 1 // SQLite uses 1-based indexing

          if (arg === null || arg === undefined) {
            sqlite3.bind_null(stmtPtr, paramIndex)
          } else if (typeof arg === 'number') {
            if (Number.isInteger(arg)) {
              sqlite3.bind_int(stmtPtr, paramIndex, arg)
            } else {
              sqlite3.bind_double(stmtPtr, paramIndex, arg)
            }
          } else if (typeof arg === 'string') {
            sqlite3.bind_text(stmtPtr, paramIndex, arg)
          } else if (arg instanceof Uint8Array) {
            sqlite3.bind_blob(stmtPtr, paramIndex, arg)
          } else if (Array.isArray(arg)) {
            sqlite3.bind_blob(stmtPtr, paramIndex, new Uint8Array(arg))
          } else {
            // Convert to string as fallback
            sqlite3.bind_text(stmtPtr, paramIndex, String(arg))
          }
        })

        if (executeRaw) {
          // Execute and return affected rows
          sqlite3.step(stmtPtr)
          const changes = sqlite3.changes(db)
          return changes
        } else {
          // Query and return results
          const columnNames: string[] = []
          const rows: unknown[][] = []

          // Get column names
          const columnCount = sqlite3.column_count(stmtPtr)
          for (let i = 0; i < columnCount; i++) {
            columnNames.push(sqlite3.column_name(stmtPtr, i))
          }

          // Fetch all rows
          while (sqlite3.step(stmtPtr) === SQLite.SQLITE_ROW) {
            const row: unknown[] = []
            for (let i = 0; i < columnCount; i++) {
              const type = sqlite3.column_type(stmtPtr, i)

              switch (type) {
                case SQLite.SQLITE_INTEGER:
                  row.push(sqlite3.column_int(stmtPtr, i))
                  break
                case SQLite.SQLITE_FLOAT:
                  row.push(sqlite3.column_double(stmtPtr, i))
                  break
                case SQLite.SQLITE_TEXT:
                  row.push(sqlite3.column_text(stmtPtr, i))
                  break
                case SQLite.SQLITE_BLOB:
                  row.push(sqlite3.column_blob(stmtPtr, i))
                  break
                case SQLite.SQLITE_NULL:
                default:
                  row.push(null)
                  break
              }
            }
            rows.push(row)
          }

          return [columnNames, rows]
        }
      } finally {
        // Always finalize the statement
        sqlite3.finalize(stmtPtr)
      }
    } catch (e) {
      onError(e as Error)
    }
  }
}

/**
 * wa-sqlite Transaction implementation
 */
class WaSQLiteTransaction extends WaSQLiteQueryable implements Transaction {
  constructor(adapter: WaSQLiteAdapter, readonly options: TransactionOptions) {
    super(adapter)
  }

  async commit(): Promise<void> {
    debug(`[js::commit]`)
    const { sqlite3, db } = this.adapter
    sqlite3.exec(db, 'COMMIT')
  }

  async rollback(): Promise<void> {
    debug(`[js::rollback]`)
    const { sqlite3, db } = this.adapter
    sqlite3.exec(db, 'ROLLBACK')
  }
}

/**
 * Main wa-sqlite Prisma Adapter
 */
export class PrismaWaSQLiteAdapter extends WaSQLiteQueryable implements SqlDriverAdapter {
  readonly tags = {
    error: '[prisma:error]',
    warn: '[prisma:warn]',
    info: '[prisma:info]',
    query: '[prisma:query]',
  }

  constructor(adapter: WaSQLiteAdapter, private readonly release?: () => Promise<void>) {
    super(adapter)
  }

  async executeScript(script: string): Promise<void> {
    try {
      const { sqlite3, db } = this.adapter
      sqlite3.exec(db, script)
    } catch (error) {
      onError(error as Error)
    }
  }

  getConnectionInfo(): ConnectionInfo {
    return {
      maxBindValues: MAX_BIND_VALUES,
      supportsRelationJoins: false,
    }
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    if (isolationLevel && isolationLevel !== 'SERIALIZABLE') {
      throw new DriverAdapterError({
        kind: 'InvalidIsolationLevel',
        level: isolationLevel,
      })
    }

    const options: TransactionOptions = {
      usePhantomQuery: false,
    }

    const tag = '[js::startTransaction]'
    debug('%s options: %O', tag, options)

    // Start transaction in SQLite
    const { sqlite3, db } = this.adapter
    sqlite3.exec(db, 'BEGIN')

    return new WaSQLiteTransaction(this.adapter, options)
  }

  async dispose(): Promise<void> {
    await this.release?.()
  }
}

/**
 * wa-sqlite Adapter Factory
 */
export class PrismaWaSQLiteAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'sqlite'
  readonly adapterName = 'prisma-wa-sqlite-adapter'

  constructor(private adapter: WaSQLiteAdapter) {}

  async connect(): Promise<SqlDriverAdapter> {
    return new PrismaWaSQLiteAdapter(this.adapter, async () => {
      // Cleanup if needed
      const { sqlite3, db } = this.adapter
      sqlite3.close(db)
    })
  }
}

function onError(error: Error): never {
  console.error('Error in performIO: %O', error)
  throw new DriverAdapterError(convertDriverError(error))
}

/**
 * Create wa-sqlite Prisma adapter
 */
export async function createWaSQLitePrismaAdapter(
  dbName: string = 'myDB',
  logger?: (message: string) => void
): Promise<PrismaWaSQLiteAdapterFactory> {
  logger?.('Initializing wa-sqlite...')

  // Initialize wa-sqlite
  const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
  const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
  const sqlite3 = SQLite.Factory(module)

  logger?.('Opening database...')

  // Open database
  const db = await sqlite3.open_v2(dbName, SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE)

  if (!db) {
    throw new Error(`Failed to open database: ${dbName}`)
  }

  logger?.('Database opened successfully')

  // Enable foreign keys
  sqlite3.exec(db, 'PRAGMA foreign_keys = ON')

  const adapter: WaSQLiteAdapter = {
    sqlite3,
    db,
  }

  return new PrismaWaSQLiteAdapterFactory(adapter)
}
