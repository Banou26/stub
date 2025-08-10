import { defineConfig } from '@playwright/test'

export default defineConfig({
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4562',
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
