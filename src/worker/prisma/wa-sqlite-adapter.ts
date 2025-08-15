/* eslint-disable @typescript-eslint/require-await */

import type {
  ConnectionInfo,
  Debug,
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
  SqlResultSet,
  Transaction,
  TransactionOptions,
} from '@prisma/driver-adapter-utils'
import { DriverAdapterError } from '@prisma/driver-adapter-utils'
import { blue, cyan, red, yellow } from 'kleur/colors'
import { WaSQLite } from './wa-sqlite-wrapper' // Import the wrapper we created

const debug = () => { }// Debug('prisma:driver-adapter:wa-sqlite')
const packageName = '@prisma/adapter-wa-sqlite'

// SQLite bind parameter limit
const MAX_BIND_VALUES = 999

// Type mapping constants
const SQLiteTypeMap: Record<string, number> = {
  NULL: 1,
  INTEGER: 2,
  REAL: 3,
  TEXT: 4,
  BLOB: 5,
}

// Column type detection
function getColumnTypes(columnNames: string[], rows: unknown[][]): Record<string, number> {
  const columnTypes: Record<string, number> = {}

  if (rows.length === 0) {
    return columnTypes
  }

  // Infer types from first non-null value in each column
  for (let colIndex = 0; colIndex < columnNames.length; colIndex++) {
    const columnName = columnNames[colIndex]
    let columnType = SQLiteTypeMap.NULL

    // Find first non-null value to determine type
    for (const row of rows) {
      const value = row[colIndex]
      if (value !== null && value !== undefined) {
        if (typeof value === 'number') {
          columnType = Number.isInteger(value) ? SQLiteTypeMap.INTEGER : SQLiteTypeMap.REAL
        } else if (typeof value === 'string') {
          columnType = SQLiteTypeMap.TEXT
        } else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
          columnType = SQLiteTypeMap.BLOB
        } else if (typeof value === 'boolean') {
          columnType = SQLiteTypeMap.INTEGER
        } else {
          columnType = SQLiteTypeMap.TEXT
        }
        break
      }
    }

    columnTypes[columnName] = columnType
  }

  return columnTypes
}

// Map Prisma argument types to SQLite values
function mapArg(arg: any, argType?: string): any {
  if (arg === null || arg === undefined) {
    return null
  }

  // Handle special Prisma types
  if (argType === 'Decimal' || argType === 'BigInt') {
    return arg.toString()
  }

  if (argType === 'DateTime' && arg instanceof Date) {
    return arg.toISOString()
  }

  if (argType === 'Json') {
    return JSON.stringify(arg)
  }

  if (argType === 'Bytes' && typeof arg === 'string') {
    // Convert base64 to Uint8Array
    const binaryString = atob(arg)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }

  // Handle boolean as integer
  if (typeof arg === 'boolean') {
    return arg ? 1 : 0
  }

  return arg
}

// Map SQLite row values back to JavaScript types
function mapRow(row: unknown[], columnTypes: number[]): unknown[] {
  return row.map((value, index) => {
    if (value === null || value === undefined) {
      return null
    }

    const columnType = columnTypes[index]

    // Convert SQLite types to JavaScript types
    switch (columnType) {
      case SQLiteTypeMap.INTEGER:
        if (typeof value === 'boolean') {
          return value ? 1 : 0
        }
        return typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10)

      case SQLiteTypeMap.REAL:
        return typeof value === 'number' ? value : parseFloat(String(value))

      case SQLiteTypeMap.TEXT:
        return String(value)

      case SQLiteTypeMap.BLOB:
        if (value instanceof Uint8Array) {
          return value
        }
        if (value instanceof ArrayBuffer) {
          return new Uint8Array(value)
        }
        // If it's a string, assume base64
        if (typeof value === 'string') {
          const binaryString = atob(value)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          return bytes
        }
        return value

      default:
        return value
    }
  })
}

// Convert JavaScript errors to Prisma driver adapter errors
function convertDriverError(error: Error): any {
  const message = error.message.toLowerCase()

  if (message.includes('unique constraint')) {
    return {
      kind: 'UniqueConstraintViolation',
      modelName: undefined,
      constraint: undefined,
    }
  }

  if (message.includes('foreign key constraint')) {
    return {
      kind: 'ForeignKeyConstraintViolation',
      modelName: undefined,
      constraint: undefined,
    }
  }

  if (message.includes('not null constraint')) {
    return {
      kind: 'NullConstraintViolation',
      modelName: undefined,
      constraint: undefined,
    }
  }

  if (message.includes('syntax error')) {
    return {
      kind: 'SyntaxError',
      message: error.message,
    }
  }

  return {
    kind: 'GenericDatabaseError',
    message: error.message,
  }
}

/**
 * WaSQLite Queryable implementation
 */
class WaSQLiteQueryable<ClientT extends WaSQLite> implements SqlQueryable {
  readonly provider = 'sqlite'
  readonly adapterName = packageName

  constructor(protected readonly client: ClientT) {}

  /**
   * Execute a query given as SQL, interpolating the given parameters.
   */
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const tag = '[js::query_raw]'
    debug(`${tag} %O`, query)

    const data = await this.performIO(query)
    const convertedData = this.convertData(data as [string[], unknown[][]])
    return convertedData
  }

  private convertData(ioResult: [string[], unknown[][]]): SqlResultSet {
    const columnNames = ioResult[0]
    const results = ioResult[1]

    if (results.length === 0) {
      return {
        columnNames: [],
        columnTypes: [],
        rows: [],
      }
    }

    const columnTypes = Object.values(getColumnTypes(columnNames, results))
    const rows = results.map((value) => mapRow(value, columnTypes))

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
    try {
      const args = query.args.map((arg, i) => mapArg(arg, query.argTypes[i]))
      const stmt = this.client.prepare(query.sql)

      if (executeRaw) {
        const result = await stmt.run(args)
        await stmt.finalize()
        return result.changes
      } else {
        // Get column names from first query
        const rows: unknown[][] = []
        let columnNames: string[] = []

        // Execute query and collect all rows
        const allRows = await stmt.all(args)

        if (allRows.length > 0) {
          columnNames = Object.keys(allRows[0])
          for (const row of allRows) {
            rows.push(columnNames.map(col => row[col]))
          }
        }

        await stmt.finalize()
        return [columnNames, rows]
      }
    } catch (e) {
      this.onError(e as Error)
    }
  }

  private onError(error: Error): never {
    console.error('Error in performIO: %O', error)
    throw new DriverAdapterError(convertDriverError(error))
  }
}

/**
 * WaSQLite Transaction implementation
 */
class WaSQLiteTransaction extends WaSQLiteQueryable<WaSQLite> implements Transaction {
  private committed = false
  private rolledBack = false

  constructor(client: WaSQLite, readonly options: TransactionOptions) {
    super(client)
  }

  async commit(): Promise<void> {
    debug(`[js::commit]`)
    if (!this.committed && !this.rolledBack) {
      await this.client.exec('COMMIT')
      this.committed = true
    }
  }

  async rollback(): Promise<void> {
    debug(`[js::rollback]`)
    if (!this.committed && !this.rolledBack) {
      await this.client.exec('ROLLBACK')
      this.rolledBack = true
    }
  }
}

/**
 * Prisma WaSQLite Adapter
 */
export class PrismaWaSQLiteAdapter extends WaSQLiteQueryable<WaSQLite> implements SqlDriverAdapter {
  readonly tags = {
    error: red('prisma:error'),
    warn: yellow('prisma:warn'),
    info: cyan('prisma:info'),
    query: blue('prisma:query'),
  }

  private transactionCounter = 0

  constructor(client: WaSQLite, private readonly release?: () => Promise<void>) {
    super(client)
  }

  async executeScript(script: string): Promise<void> {
    try {
      await this.client.exec(script)
    } catch (error) {
      this.onError(error as Error)
    }
  }

  getConnectionInfo(): ConnectionInfo {
    return {
      maxBindValues: MAX_BIND_VALUES,
      supportsRelationJoins: false,
    }
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    // SQLite only supports SERIALIZABLE isolation level
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

    // Start transaction
    await this.client.exec('BEGIN')

    return new WaSQLiteTransaction(this.client, options)
  }

  async dispose(): Promise<void> {
    await this.release?.()
  }

  private onError(error: Error): never {
    console.error('Error in executeScript: %O', error)
    throw new DriverAdapterError(convertDriverError(error))
  }
}

/**
 * Prisma WaSQLite Adapter Factory
 */
export class PrismaWaSQLiteAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'sqlite'
  readonly adapterName = packageName

  private client?: WaSQLite

  constructor(private options: {
    filename?: string
    pragmas?: Record<string, any>
    locateFile?: (file: string) => string
  } = {}) {}

  async connect(): Promise<SqlDriverAdapter> {
    // Initialize WaSQLite if not already done
    if (!this.client) {
      this.client = await WaSQLite.open(
        this.options.filename || ':memory:',
        {
          pragmas: {
            journal_mode: 'WAL',
            foreign_keys: 1,
            ...this.options.pragmas
          },
          locateFile: this.options.locateFile
        }
      )
    }

    return new PrismaWaSQLiteAdapter(this.client, async () => {
      if (this.client) {
        await this.client.close()
        this.client = undefined
      }
    })
  }
}

/**
 * Helper function to create a Prisma client with WaSQLite
 */
export function createWaSQLitePrismaClient(options?: {
  filename?: string
  pragmas?: Record<string, any>
  locateFile?: (file: string) => string
}) {
  return new PrismaWaSQLiteAdapterFactory(options)
}
