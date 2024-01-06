import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import rollupNodePolyFill from 'rollup-plugin-polyfill-node'
// import topLevelAwait from 'vite-plugin-top-level-await'

import polyfills from './vite-plugin-node-stdlib-browser.cjs'

export default defineConfig((env) => ({
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
  worker: {
    format: 'es'
  },
  define: env.mode === 'development' ? {} : {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  plugins: [
    preact({
      jsxImportSource: '@emotion/react'
    }),
    polyfills(),
    // topLevelAwait()
  ],
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 4560,
      clientPort: 4560
    },
    fs: {
      allow: ['..']
    }
  }
}))
