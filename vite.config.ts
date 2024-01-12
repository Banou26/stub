import path from 'path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import preact from '@preact/preset-vite'
import rollupNodePolyFill from 'rollup-plugin-polyfill-node'

import polyfills from './vite-plugin-node-stdlib-browser.cjs'

const resolveFixup = {
  name: 'resolve-fixup',
  setup(build) {
    build.onResolve({ filter: /react-virtualized/ }, () => ({
      path: path.resolve('./node_modules/react-virtualized/dist/umd/react-virtualized.js')
    }))
  }
}

export default defineConfig((env) => ({
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      plugins: [
        rollupNodePolyFill()
      ]
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [resolveFixup]
    }
  },
  worker: {
    format: 'es'
  },
  define: env.mode === 'development' ? {} : {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  plugins: [
    env.mode === 'development'
      ? (
        react({
          jsxImportSource: '@emotion/react'
        })
      )
      : (
        preact({
          jsxImportSource: '@emotion/react'
        })
      ),
    polyfills()
  ]
}))
