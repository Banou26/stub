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
} from '@prisma/driver-adapter-utils'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import { Mutex } from 'async-mutex'

// @ts-expect-error
import { name as packageName } from '../../../package.json'
import { MAX_BIND_VALUES } from './constants'
import { getColumnTypes, inferColumnType, mapArg, mapRow } from './conversion'
import { convertDriverError } from './errors'

const debug = Debug('prisma:driver-adapter:d1')

const LOCK_TAG = Symbol()

type WASqliteContext = {
  module: any
  sqlite3: SQLiteAPI
  database: number
}

type ExtendedSqlResultSet = SqlResultSet & {
  changes: number
}

/**
 * Env binding for Cloudflare D1.
 */
class WASqliteQueryable<ClientT extends WASqliteContext> implements SqlQueryable {
  readonly provider = 'sqlite'
  readonly adapterName = packageName;

  [LOCK_TAG] = new Mutex()

  constructor(protected readonly context: ClientT) {}

  /**
   * Execute a query given as SQL, interpolating the given parameters.
   */
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const tag = '[js::query_raw]'
    debug(`${tag} %O`, query)

    const data = await this.performIO(query)
    return data
  }

  /**
   * Execute a query given as SQL, interpolating the given parameters and
   * returning the number of affected rows.
   * Note: Queryable expects a u64, but napi.rs only supports u32.
   */
  async executeRaw(query: SqlQuery): Promise<number> {
    const tag = '[js::execute_raw]'
    debug(`${tag} %O`, query)

    const result = await this.performIO(query)
    return result.changes ?? 0
  }

  private async performIO(query: SqlQuery): Promise<ExtendedSqlResultSet> {
    console.log('query', query)
    try {
      const params = query.args.map((arg, i) => mapArg(arg, query.argTypes[i]))
      let currentIndex = 0
      for await (const stmt of this.context.sqlite3.statements(this.context.database, query.sql)) {
        console.log('stmt', this.context.sqlite3.sql(stmt))
        const paramCount = this.context.sqlite3.bind_parameter_count(stmt)
        // const columnCount = this.context.sqlite3.column_count(stmt)
        const columnNames = this.context.sqlite3.column_names(stmt)
        const columnTypes =
          Array(paramCount)
            .fill(undefined)
            .map((_, i) => inferColumnType(this.context.sqlite3.column_type(stmt, i)))
        this.context.sqlite3.bind_collection(stmt, params.slice(currentIndex, paramCount))
        currentIndex = currentIndex + paramCount
        const rows = [] as SQLiteCompatibleType[][]
        while (await this.context.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const row = this.context.sqlite3.row(stmt)
          rows.push(row)
        }
        const changes = this.context.sqlite3.changes(this.context.database)
        if (changes) {
          return {
            columnNames,
            columnTypes,
            rows,
            changes
          }
        }
      }
      return {
        columnNames: [],
        columnTypes: [],
        rows: [],
        changes: 0
      }
    } catch (error) {
      console.error('Error in performIO: %O', error)
      throw new DriverAdapterError(convertDriverError(error))
    }
  }
}

class WASqliteTransaction extends WASqliteQueryable<WASqliteContext> implements Transaction {
  constructor(context: WASqliteContext, readonly options: TransactionOptions) {
    super(context)
  }

  async commit(): Promise<void> {
    debug(`[js::commit]`)
  }

  async rollback(): Promise<void> {
    debug(`[js::rollback]`)
  }
}

export class PrismaWASqliteAdapter extends WASqliteQueryable<WASqliteContext> implements SqlDriverAdapter {
  alreadyWarned = new Set()

  constructor(context: WASqliteContext, private readonly release?: () => Promise<void>) {
    super(context)
  }

  /**
   * This will warn once per transaction
   * e.g. the following two explicit transactions
   * will only trigger _two_ warnings
   *
   * ```ts
   * await prisma.$transaction([ ...queries ])
   * await prisma.$transaction([ ...moreQueries ])
   * ```
   */
  private warnOnce = (key: string, message: string, ...args: unknown[]) => {
    if (!this.alreadyWarned.has(key)) {
      this.alreadyWarned.add(key)
      console.warn(`${message}`, ...args)
    }
  }

  async executeScript(script: string): Promise<void> {
    try {
      await this.context.sqlite3.exec(this.context.database, script)
    } catch (error) {
      console.error('Error in performIO: %O', error)
      throw new DriverAdapterError(convertDriverError(error))
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

    this.warnOnce(
      'D1 Transaction',
      "Cloudflare D1 does not support transactions yet. When using Prisma's D1 adapter, implicit & explicit transactions will be ignored and run as individual queries, which breaks the guarantees of the ACID properties of transactions. For more details see https://pris.ly/d/d1-transactions",
    )

    const options: TransactionOptions = {
      usePhantomQuery: true,
    }

    const tag = '[js::startTransaction]'
    debug('%s options: %O', tag, options)

    return new WASqliteTransaction(this.context, options)
  }

  async dispose(): Promise<void> {
    await this.release?.()
  }
}

export class PrismaWASqliteAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'sqlite'
  readonly adapterName = packageName

  constructor() {}

  async connect(): Promise<SqlDriverAdapter> {
    // @ts-expect-error
    const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
    const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
    const sqlite3 = SQLite.Factory(module)
    const database = await sqlite3.open_v2(':memory:')
    return new PrismaWASqliteAdapter({ module, sqlite3, database }, async () => {})
  }
}
