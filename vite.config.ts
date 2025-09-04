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
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime"
    }
  },
  plugins: [
    nodePolyfills(),
    prismaBrowserHack(),
    preact({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
