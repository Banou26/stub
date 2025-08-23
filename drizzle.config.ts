import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/worker/drizzle/schema.ts',
  dialect: 'sqlite'
})
