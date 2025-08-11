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
  },
  optimizeDeps: {
    include: ['wa-sqlite']
  },
  plugins: [
    prismaBrowserHack(),
    commonjs()
  ]
})
