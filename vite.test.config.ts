import { defineConfig } from 'vite'
import { prismaBrowserHack } from './vite-plugin-prisma-hack'

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      name: 'osra',
      fileName: 'test',
      entry: 'tests/_tests_.ts',
      formats: ['es']
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.DATABASE_URL': JSON.stringify('file:./dev.db'),
    'process.platform': JSON.stringify('linux'),
    'process.version': JSON.stringify('v18.0.0'),
    'global': 'globalThis',
    'globalThis.global': 'globalThis',
  },
  optimizeDeps: {
    include: ['@prisma/client', 'wa-sqlite', '@prisma/driver-adapter-utils'],
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
    prismaBrowserHack()
  ]
})
