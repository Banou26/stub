import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import commonjs from 'vite-plugin-commonjs'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { prismaBrowserHack } from './vite-plugin-prisma-hack'

export default defineConfig((env) => ({
  build: {
    target: 'esnext',
    outDir: 'build',
    commonjsOptions: { transformMixedEsModules: true }
  },
  worker: {
    format: 'es'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(env.mode),
    'process.env.DATABASE_URL': JSON.stringify('file:./dev.db'),
    'process.platform': JSON.stringify('linux'),
    'process.version': JSON.stringify('v18.0.0'),
    'process.pid': 16160,
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
    commonjs(),
    nodePolyfills(),
    react({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
