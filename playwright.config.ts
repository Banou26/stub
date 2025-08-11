import { defineConfig } from '@playwright/test'

export default defineConfig({
  webServer: {
    command: 'npm run test-server',
    url: 'http://localhost:7357',
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
