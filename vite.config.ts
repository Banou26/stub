import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

import { prismaBrowserHack } from './vite-plugin-prisma-hack'

export default defineConfig((_) => ({
  build: {
    target: 'esnext',
    outDir: 'build'
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    include: ['wa-sqlite']
  },
  plugins: [
    nodePolyfills(),
    prismaBrowserHack(),
    react({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
