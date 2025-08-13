import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error
import commonjs from 'vite-plugin-commonjs'

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
    prismaBrowserHack(),
    commonjs(),
    react({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
