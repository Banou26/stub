import { defineConfig } from '@playwright/test'
import { existsSync } from 'fs'
import { execFileSync } from 'child_process'

const detectChromePath = (): string | undefined => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (!existsSync('/etc/NIXOS')) return undefined
  for (const bin of ['google-chrome-stable', 'chromium']) {
    try {
      return execFileSync('which', [bin], { encoding: 'utf-8' }).trim()
    } catch {}
  }
  return undefined
}

export default defineConfig({
  // Scoped to tests/, or playwright also collects the vitest specs under src/worker and dies trying to run describe() from the wrong runner
  testDir: './tests',
  use: {
    launchOptions: {
      executablePath: detectChromePath(),
      // this is the owner's machine: no run gets to make noise on it, headless or not
      args: ['--mute-audio'],
    },
  },
  webServer: {
    command: 'npm run test-server',
    url: 'http://localhost:7357',
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
