import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { prismaBrowserHack } from './vite-plugin-prisma-hack'

export default defineConfig((env) => ({
  build: {
    target: 'esnext',
    outDir: 'build'
  },
  worker: {
    format: 'es'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(env.mode),
    'process.env.DATABASE_URL': JSON.stringify('file:./dev.db'),
    'process.platform': JSON.stringify('linux'),
    'process.version': JSON.stringify('v18.0.0'),
    'global': 'globalThis',
    'globalThis.global': 'globalThis',
  },
  optimizeDeps: {
    include: ['@prisma/client', 'wa-sqlite'],
    exclude: ['@prisma/client/runtime/library'],
    esbuildOptions: {
      target: 'esnext',
    }
  },
  resolve: {
    alias: {
      '.prisma/client': '@prisma/client',
    }
  },
  plugins: [
    prismaBrowserHack(),
    react({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
