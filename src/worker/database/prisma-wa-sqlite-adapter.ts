import type { DriverAdapter, Debug, Queryable, Result, ResultSet, Transaction, TransactionOptions } from '@prisma/driver-adapter-utils'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'

type WaSQLiteValue = string | number | bigint | boolean | null | Uint8Array

interface SQLiteAPI {
  open_v2(filename: string, flags: number): Promise<number>
  close(db: number): Promise<number>
  statements(db: number, sql: string): AsyncIterable<number>
  bind_collection(stmt: number, values: WaSQLiteValue[]): number
  step(stmt: number): Promise<number>
  column_names(stmt: number): string[]
  column_count(stmt: number): number
  column_type(stmt: number, index: number): number
  row(stmt: number): WaSQLiteValue[]
  changes(db: number): number
  last_insert_rowid(db: number): number
  exec(db: number, sql: string): Promise<void>
  [key: string]: any
}

class WaSQLiteQueryable implements Queryable {
  constructor(
    private sqlite3: SQLiteAPI,
    private db: number,
    private debug?: Debug
  ) {}

  private convertValue(value: any): WaSQLiteValue {
    if (value === undefined) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
      return JSON.stringify(value)
    }
    return value as WaSQLiteValue
  }

  private convertResult(value: WaSQLiteValue, columnType?: number): any {
    if (value === null) return null
    if (typeof value === 'string') {
      // Try to parse ISO date strings
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value)
      }
      // Try to parse JSON
      if ((value.startsWith('{') && value.endsWith('}')) || 
          (value.startsWith('[') && value.endsWith(']'))) {
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }
    }
    return value
  }

  async queryRaw(query: string, parameters?: any[]): Promise<Result<ResultSet>> {
    const sql = query.sql || query
    const params = (parameters || query.values || []).map(p => this.convertValue(p))
    
    this.debug?.(`prisma:query ${sql}`)
    this.debug?.(`prisma:params ${JSON.stringify(params)}`)

    try {
      const rows: any[] = []
      let columnNames: string[] = []
      let columnTypes: number[] = []

      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        if (params.length > 0) {
          this.sqlite3.bind_collection(stmt, params)
        }

        columnNames = this.sqlite3.column_names(stmt)
        const columnCount = this.sqlite3.column_count(stmt)
        
        // Get column types for proper conversion
        columnTypes = []
        for (let i = 0; i < columnCount; i++) {
          columnTypes.push(this.sqlite3.column_type(stmt, i))
        }

        while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const rowData = this.sqlite3.row(stmt)
          const rowObject: Record<string, any> = {}
          
          columnNames.forEach((columnName, index) => {
            const value = rowData[index]
            rowObject[columnName] = this.convertResult(value, columnTypes[index])
          })
          
          rows.push(rowObject)
        }
      }

      return {
        columnNames,
        columnTypes: columnTypes.map(() => 'string'), // Simplified type mapping
        rows,
        rowCount: rows.length,
      }
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async executeRaw(query: string, parameters?: any[]): Promise<Result<number>> {
    const sql = query.sql || query
    const params = (parameters || query.values || []).map(p => this.convertValue(p))
    
    this.debug?.(`prisma:execute ${sql}`)
    this.debug?.(`prisma:params ${JSON.stringify(params)}`)

    try {
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        if (params.length > 0) {
          this.sqlite3.bind_collection(stmt, params)
        }
        await this.sqlite3.step(stmt)
      }

      const changes = this.sqlite3.changes(this.db)
      return changes
    } catch (error) {
      throw new Error(`Execute failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

class WaSQLiteTransaction extends WaSQLiteQueryable implements Transaction {
  constructor(
    sqlite3: SQLiteAPI,
    db: number,
    private options: TransactionOptions,
    debug?: Debug
  ) {
    super(sqlite3, db, debug)
  }

  async commit(): Promise<void> {
    await this.executeRaw('COMMIT')
  }

  async rollback(): Promise<void> {
    await this.executeRaw('ROLLBACK')
  }
}

export class WaSQLitePrismaAdapter extends WaSQLiteQueryable implements DriverAdapter {
  private sqlite3: SQLiteAPI | null = null
  private db: number | null = null
  private initialized = false
  
  // Add provider and name for edge runtime compatibility
  readonly provider = 'sqlite'
  readonly adapterName = 'wa-sqlite-adapter'

  constructor(private debug?: Debug) {
    super(null as any, null as any, debug)
  }

  async initialize(dbName: string = 'myDB'): Promise<void> {
    if (this.initialized) return

    try {
      // @ts-expect-error
      const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
      const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
      this.sqlite3 = SQLite.Factory(module) as any

      if (!this.sqlite3) {
        throw new Error('Failed to create SQLite factory')
      }

      this.db = await this.sqlite3.open_v2(
        dbName,
        SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE
      )

      if (!this.db) {
        throw new Error(`Failed to open database: ${dbName}`)
      }

      // Enable foreign keys
      await this.sqlite3.exec(this.db, 'PRAGMA foreign_keys = ON')

      this.initialized = true
      
      // Update parent class references
      Object.setPrototypeOf(this, new WaSQLiteQueryable(this.sqlite3, this.db, this.debug))
    } catch (error) {
      throw new Error(
        `Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async startTransaction(options?: TransactionOptions): Promise<Transaction> {
    if (!this.sqlite3 || !this.db) {
      throw new Error('Adapter not initialized')
    }

    const isolationLevel = options?.isolationLevel || 'serializable'
    
    // SQLite doesn't support all isolation levels, but we can use different transaction modes
    let beginStatement = 'BEGIN'
    if (isolationLevel === 'serializable') {
      beginStatement = 'BEGIN IMMEDIATE'
    } else if (isolationLevel === 'read uncommitted' || isolationLevel === 'read committed') {
      beginStatement = 'BEGIN DEFERRED'
    }

    await this.executeRaw(beginStatement)
    
    return new WaSQLiteTransaction(this.sqlite3, this.db, options || {}, this.debug)
  }

  async close(): Promise<void> {
    if (this.db && this.sqlite3) {
      await this.sqlite3.close(this.db)
      this.db = null
      this.sqlite3 = null
      this.initialized = false
    }
  }

  // Override parent methods to ensure initialization
  async queryRaw(query: string, parameters?: any[]): Promise<Result<ResultSet>> {
    if (!this.sqlite3 || !this.db) {
      throw new Error('Adapter not initialized. Call initialize() first.')
    }
    return super.queryRaw(query, parameters)
  }

  async executeRaw(query: string, parameters?: any[]): Promise<Result<number>> {
    if (!this.sqlite3 || !this.db) {
      throw new Error('Adapter not initialized. Call initialize() first.')
    }
    return super.executeRaw(query, parameters)
  }
}

// Helper function to create and initialize the adapter
export async function createWaSQLitePrismaAdapter(dbName?: string, debug?: Debug): Promise<WaSQLitePrismaAdapter> {
  const adapter = new WaSQLitePrismaAdapter(debug)
  await adapter.initialize(dbName)
  return adapter
}