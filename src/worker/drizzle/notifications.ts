import { sql } from 'drizzle-orm'

import { Database } from '.'
import { ChangeNotification, notifyTable } from './schema'
import { TableName } from './utils'

export const generateTableNotifyTrigger = (database: Database,tableName: TableName, columnId: string, operation: 'INSERT' | 'UPDATE' | 'DELETE') =>
  database.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS ${tableName}${operation.slice(0, 1).toUpperCase()}${operation.slice(1).toLowerCase()}Notify
    AFTER ${operation} ON ${tableName}
    FOR EACH ROW
    BEGIN
        INSERT INTO notify (tableName, columnId, rowId, operation)
        VALUES (
            '${tableName}',
            '${columnId}',
            ${operation === 'DELETE' ? 'OLD' : 'NEW'}.${columnId},
            '${operation}'
        );
    END;
  `))

export const generateTableNotifyTriggers = async (database: Database, tableName: TableName, columnId: string) => {
  await generateTableNotifyTrigger(database, tableName, columnId, 'INSERT')
  await generateTableNotifyTrigger(database, tableName, columnId, 'UPDATE')
  await generateTableNotifyTrigger(database, tableName, columnId, 'DELETE')
}

type ChangeNotificationListener = {
  func: (notifications: ChangeNotification[]) => void
  table?: TableName
  columnId?: string
  ids?: string[]
}

const notificationListeners: ChangeNotificationListener[] = []

export const listen = (func: (notifications: ChangeNotification[]) => void, options?: { table?: TableName, columnId?: string, ids?: string[] }) => {
  const listenerObject = {
    func,
    table: options?.table,
    columnId: options?.columnId,
    ids: options?.ids
  }

  notificationListeners.push(listenerObject)

  return () => {
    if (notificationListeners.includes(listenerObject)) {
      notificationListeners.splice(notificationListeners.indexOf(listenerObject), 1)
    }
  }
}

export const listenIterator = (options?: { abort?: AbortSignal, table?: TableName, columnId?: string, ids?: string[] }) => {
  let resolve: ((result: { value: ChangeNotification[] | undefined, done: boolean }) => void) | null = null
  let promise: Promise<{ value: ChangeNotification[] | undefined, done: boolean }> | null = null

  const unlisten = listen((changes) => {
    if (resolve) {
      resolve({ value: changes, done: false })
      resolve = null
      promise = null
    }
  }, options)

  if (options?.abort) {
    options.abort.addEventListener('abort', () => {
      unlisten()
      if (resolve) {
        resolve({ value: undefined, done: true })
      }
    })
  }

  return {
    async next() {
      if (!promise) {
        promise = new Promise<{ value: ChangeNotification[] | undefined, done: boolean }>(_resolve => {
          resolve = _resolve
        })
      }
      try {
        return promise
      } finally {
        promise = null
      }
    },
    async return() {
      unlisten()
      return { value: undefined, done: true }
    },
    [Symbol.asyncIterator]() { return this }
  }
}

export const startNotificationRootListener = (database: Database) => {
  const interval = setInterval(async () => {
    const notifications = await database.transaction(async tx => {
      const notifications = await tx.query.notifyTable.findMany()
      await tx.delete(notifyTable)
      return notifications
    })
    if (!notifications.length) return
    for (const notificationListener of notificationListeners) {
      const result = notifications.filter(notification =>
        (
          !notificationListener.table
          || notificationListener.table === notification.tableName
        ) && (
          !notificationListener.columnId
          || notificationListener.columnId === notification.columnId
        ) && (
          !notificationListener.ids?.length
          || notificationListener.ids?.includes(notification.rowId)
        )
      )
      if (!result.length) continue
      notificationListener.func(result)
    }
  }, 100)
  return () => clearInterval(interval)
}
