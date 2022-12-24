import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import polyfills from './vite-plugin-node-stdlib-browser.cjs'

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    lib: {
      name: 'OL',
      fileName: 'index',
      entry: 'src/index.tsx',
      formats: ['es']
    }
  },
  plugins: [
    react({
      jsxImportSource: '@emotion/react'
    }),
    polyfills()
  ],
  server: {
    fs: {
      allow: ['../..']
    }
  }
})
