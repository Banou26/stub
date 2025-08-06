import { createWaSQLiteDB } from './drizzle-driver'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique()
})

export async function exampleUsage() {
  const db = await createWaSQLiteDB('example.db')

  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    )
  `)

  const newUser = await db.insert(users).values({
    name: 'John Doe',
    email: 'john@example.com'
  })

  const allUsers = await db.select().from(users)
  
  const user = await db.select().from(users).where(eq(users.id, 1))

  await db.update(users)
    .set({ name: 'Jane Doe' })
    .where(eq(users.id, 1))

  await db.delete(users).where(eq(users.id, 1))

  console.log('Users:', allUsers)
  
  return { newUser, allUsers, user }
}