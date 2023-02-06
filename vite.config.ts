import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import rollupNodePolyFill from 'rollup-plugin-polyfill-node'

import polyfills from './vite-plugin-node-stdlib-browser.cjs'

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      plugins: [
        rollupNodePolyFill()
      ]
    },
    lib: {
      name: 'Stub',
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
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 4560,
      clientPort: 4560
    },
    fs: {
      allow: ['../..']
    }
  }
})
