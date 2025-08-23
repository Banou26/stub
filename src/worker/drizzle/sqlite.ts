import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import { Mutex } from 'async-mutex'

export default async () => {
  // @ts-expect-error
  const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
  const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
  const sqlite3 = SQLite.Factory(module)
  const database = await sqlite3.open_v2(':memory:')
  const mutex = new Mutex()
  return {
    module,
    sqlite3,
    database,
    mutex
  }
}
