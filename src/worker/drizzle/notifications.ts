import { sql } from 'drizzle-orm'

import { Database } from '.'
import { ChangeNotification, notifyTable } from './schema'
import { TableName } from './utils'

export const generateTableNotifyTrigger = (database: Database, tableName: TableName, columnId: string, operation: 'INSERT' | 'UPDATE' | 'DELETE') =>
  database.run(sql.raw(`
    CREATE TRIGGER IF NOT EXISTS ${tableName}${operation.slice(0, 1).toUpperCase()}${operation.slice(1).toLowerCase()}Notify
    AFTER ${operation} ON ${tableName}
    FOR EACH ROW
    BEGIN
        INSERT INTO notify (tableName, rowId, operation)
        VALUES (
            '${tableName}',
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
  ids?: string[]
}

const notificationListeners: ChangeNotificationListener[] = []

export const listen = (func: (notifications: ChangeNotification[]) => void, options?: { table?: TableName, ids?: string[] }) => {
  const listenerObject = {
    func,
    table: options?.table,
    ids: options?.ids
  }

  notificationListeners.push(listenerObject)

  return () => {
    notificationListeners.splice(notificationListeners.indexOf(listenerObject), 1)
  }
}

export const listenIterator = (options?: { table?: TableName, ids?: string[] }) => {
  let resolve: ((value: ChangeNotification[]) => void) | null = null
  let promise: Promise<ChangeNotification[]> | null = null

  const unlisten = listen((changes) => {
    if (resolve) {
      resolve(changes)
      resolve = null
      promise = null
    }
  }, options)

  return {
    async next() {
      if (!promise) {
        promise = new Promise<ChangeNotification[]>(_resolve => {
          resolve = _resolve
        })
      }
      const value = await promise
      promise = null
      return { value, done: false }
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
