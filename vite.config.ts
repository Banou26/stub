import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import preact from '@preact/preset-vite'
import rollupNodePolyFill from 'rollup-plugin-polyfill-node'

import polyfills from './vite-plugin-node-stdlib-browser.cjs'

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
