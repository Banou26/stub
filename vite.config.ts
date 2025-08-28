import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import preact from '@preact/preset-vite'

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
    preact({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
