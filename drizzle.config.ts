import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/worker/database/schema.ts',
  dialect: 'sqlite'
})
