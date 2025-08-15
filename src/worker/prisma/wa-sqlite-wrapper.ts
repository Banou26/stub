import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'

/**
 * WaSQLite - A better-sqlite3-like API wrapper for wa-sqlite
 * Provides a familiar, high-level interface for wa-sqlite in the browser
 */

class WaSQLite {
  constructor() {
    this.sqlite3 = null;
    this.db = null;
    this.statements = new Map();
    this._transactionLevel = 0;
  }

  /**
   * Initialize wa-sqlite and open a database
   * @param {string} filename - Database filename (":memory:" for in-memory)
   * @param {Object} options - Configuration options
   * @returns {Promise<WaSQLite>}
   */
  static async open(filename = ':memory:', options = {}) {
    const instance = new WaSQLite();

    // Initialize wa-sqlite - SQLiteESMFactory returns a Promise
    // const module = await SQLiteESMFactory();
    // instance.sqlite3 = SQLite.Factory(module);

    // Open database - open_v2 is async in wa-sqlite
    // instance.db = await instance.sqlite3.open_v2(
    //   filename,
    //   SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    //   options.vfs
    // );

    const { default: SQLiteWasm } = await import('wa-sqlite/dist/wa-sqlite.wasm?url')
    const module = await SQLiteESMFactory({ locateFile: () => SQLiteWasm })
    const sqlite3 = SQLite.Factory(module)
    instance.sqlite3 = sqlite3
    instance.db = await sqlite3.open_v2(filename)

    // Set default pragmas if provided
    if (options.pragmas) {
      for (const [key, value] of Object.entries(options.pragmas)) {
        await instance.pragma(`${key} = ${value}`);
      }
    }

    return instance;
  }

  /**
   * Prepare a SQL statement
   * @param {string} sql - SQL query
   * @returns {Statement}
   */
  prepare(sql) {
    return new Statement(this, this.sqlite3, sql);
  }

  /**
   * Execute SQL that doesn't return data
   * @param {string} sql - SQL to execute
   * @returns {Promise<Object>} - Info about execution
   */
  async exec(sql) {
    const stmts = sql.split(';').filter(s => s.trim());
    let totalChanges = 0;

    for (const stmtSql of stmts) {
      if (!stmtSql.trim()) continue;

      const stmt = this.prepare(stmtSql);
      const info = await stmt.run();
      totalChanges += info.changes;
      await stmt.finalize();
    }

    return { changes: totalChanges };
  }

  /**
   * Run a pragma command
   * @param {string} pragma - Pragma command
   * @param {Object} options - Options
   * @returns {Promise<*>}
   */
  async pragma(pragma, options = {}) {
    const sql = `PRAGMA ${pragma}`;
    const stmt = this.prepare(sql);

    try {
      if (options.simple) {
        const row = await stmt.get();
        await stmt.finalize();
        return row ? Object.values(row)[0] : undefined;
      }

      const rows = await stmt.all();
      await stmt.finalize();
      return rows;
    } catch (error) {
      await stmt.finalize();
      throw error;
    }
  }

  /**
   * Create a transaction function
   * @param {Function} fn - Function to run in transaction
   * @returns {Function}
   */
  transaction(fn) {
    return async (...args) => {
      const isNested = this._transactionLevel > 0;
      const savepoint = isNested ? `sp_${Date.now()}_${Math.random()}` : null;

      try {
        if (isNested) {
          await this.exec(`SAVEPOINT ${savepoint}`);
        } else {
          await this.exec('BEGIN');
        }

        this._transactionLevel++;
        const result = await fn(...args);

        if (isNested) {
          await this.exec(`RELEASE ${savepoint}`);
        } else {
          await this.exec('COMMIT');
        }

        this._transactionLevel--;
        return result;
      } catch (error) {
        if (isNested) {
          await this.exec(`ROLLBACK TO ${savepoint}`);
        } else {
          await this.exec('ROLLBACK');
        }

        this._transactionLevel--;
        throw error;
      }
    };
  }

  /**
   * Close the database
   */
  async close() {
    // Finalize all cached statements
    for (const stmt of this.statements.values()) {
      await this.sqlite3.finalize(stmt);
    }
    this.statements.clear();

    // Close database
    if (this.db) {
      await this.sqlite3.close(this.db);
      this.db = null;
    }
  }

  /**
   * Get last insert rowid
   */
  async lastInsertRowid() {
    const result = await this.prepare('SELECT last_insert_rowid() as id').get();
    return result ? result.id : null;
  }

  /**
   * Get total changes
   */
  async totalChanges() {
    const result = await this.prepare('SELECT total_changes() as changes').get();
    return result ? result.changes : 0;
  }

  /**
   * Check if database is open
   */
  get isOpen() {
    return this.db !== null;
  }

  /**
   * Load an extension (if supported)
   */
  loadExtension(path) {
    throw new Error('Extensions not supported in wa-sqlite browser environment');
  }

  /**
   * Create a backup
   */
  async backup(destFilename) {
    await this.exec(`VACUUM INTO '${destFilename}'`);
  }

  /**
   * Create an aggregate function
   */
  aggregate(name, options) {
    throw new Error('Aggregate functions not yet implemented');
  }

  /**
   * Create a user-defined function
   */
  function(name, options, fn) {
    if (!fn) {
      fn = options;
      options = {};
    }
    throw new Error('User-defined functions not yet implemented');
  }
}

class Statement {
  constructor(sqlite3, db, sql) {
    this.sqlite3 = sqlite3
    this.db = db;
    this.sql = sql;
    this._stmt = null;
    this._finalized = false;
  }

  /**
   * Prepare the statement if not already prepared
   */
  async _prepare() {
    if (!this._stmt && !this._finalized) {
      const prepared = await this.sqlite3.sqlite3.prepare_v2(this.db.db, this.sql);
      this._stmt = prepared.stmt;
    }
    return this._stmt;
  }

  /**
   * Bind parameters to statement
   */
  async _bindParams(params) {
    const stmt = await this._prepare();
    await this.db.sqlite3.reset(stmt);

    if (params) {
      if (Array.isArray(params)) {
        // Use bind_collection for arrays
        this.db.sqlite3.bind_collection(stmt, params);
      } else if (typeof params === 'object') {
        // Use bind_collection for objects with named parameters
        const namedParams = {};
        for (const [key, value] of Object.entries(params)) {
          const paramKey = key.startsWith(':') || key.startsWith('@') || key.startsWith('$')
            ? key
            : `:${key}`;
          namedParams[paramKey] = value;
        }
        this.db.sqlite3.bind_collection(stmt, namedParams);
      }
    }
  }

  /**
   * Run statement (INSERT, UPDATE, DELETE)
   * @param {Object|Array} params - Parameters to bind
   * @returns {Promise<Object>} - Execution info
   */
  async run(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    await this.db.sqlite3.step(stmt);
    await this.db.sqlite3.reset(stmt);

    return {
      changes: this.db.sqlite3.changes(this.db.db),
      lastInsertRowid: this.db.sqlite3.last_insert_rowid(this.db.db)
    };
  }

  /**
   * Get single row
   * @param {Object|Array} params - Parameters to bind
   * @returns {Promise<Object|undefined>}
   */
  async get(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    const result = await this.db.sqlite3.step(stmt);

    if (result === SQLite.SQLITE_ROW) {
      const row = this._getRow(stmt);
      await this.db.sqlite3.reset(stmt);
      return row;
    }

    await this.db.sqlite3.reset(stmt);
    return undefined;
  }

  /**
   * Get all rows
   * @param {Object|Array} params - Parameters to bind
   * @returns {Promise<Array>}
   */
  async all(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    const rows = [];
    let result;

    while ((result = await this.db.sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      rows.push(this._getRow(stmt));
    }

    await this.db.sqlite3.reset(stmt);
    return rows;
  }

  /**
   * Iterate over rows
   * @param {Object|Array} params - Parameters to bind
   * @returns {AsyncIterator}
   */
  async *iterate(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    let result;
    while ((result = await this.db.sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      yield this._getRow(stmt);
    }

    await this.db.sqlite3.reset(stmt);
  }

  /**
   * Get values from first column
   * @param {Object|Array} params - Parameters to bind
   * @returns {Promise<Array>}
   */
  async pluck(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    const values = [];
    let result;

    while ((result = await this.db.sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      values.push(this.db.sqlite3.column(stmt, 0));
    }

    await this.db.sqlite3.reset(stmt);
    return values;
  }

  /**
   * Get row as array instead of object
   * @param {Object|Array} params - Parameters to bind
   * @returns {Promise<Array|undefined>}
   */
  async raw(params) {
    await this._bindParams(params);
    const stmt = await this._prepare();

    const result = await this.db.sqlite3.step(stmt);

    if (result === SQLite.SQLITE_ROW) {
      const columnCount = this.db.sqlite3.column_count(stmt);
      const row = [];

      for (let i = 0; i < columnCount; i++) {
        row.push(this.db.sqlite3.column(stmt, i));
      }

      await this.db.sqlite3.reset(stmt);
      return row;
    }

    await this.db.sqlite3.reset(stmt);
    return undefined;
  }

  /**
   * Get row from current statement position
   */
  _getRow(stmt) {
    const columnCount = this.db.sqlite3.column_count(stmt);
    const row = {};

    for (let i = 0; i < columnCount; i++) {
      const name = this.db.sqlite3.column_name(stmt, i);
      row[name] = this.db.sqlite3.column(stmt, i);
    }

    return row;
  }

  /**
   * Finalize statement
   */
  async finalize() {
    if (this._stmt && !this._finalized) {
      await this.db.sqlite3.finalize(this._stmt);
      this._stmt = null;
      this._finalized = true;
    }
  }

  /**
   * Bind parameters (chainable)
   */
  bind(params) {
    this._boundParams = params;
    return this;
  }
}

// Export for use
export default WaSQLite;
export { WaSQLite, Statement };
