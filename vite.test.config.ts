import { defineConfig } from 'vite'
import commonjs from 'vite-plugin-commonjs'
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
    },
    commonjsOptions: { transformMixedEsModules: true }
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
    include: [
      '@prisma/client',
      'wa-sqlite',
      '@prisma/driver-adapter-utils',
      'prisma-client-0dec6a80034b16a51fb7b3bc8c0ed3d12f1f7478467af6102c5b8f4c92a00afe',
      'prisma/generated'
    ],
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
    commonjs()
  ]
})
