import { resolve } from 'path'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import preact from '@preact/preset-vite'

export default defineConfig((_) => ({
  experimental: {
    // bundledDev: true,
    // fullBundleMode: true,
    // renderBuiltUrl: true,
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html')
      }
    }
  },
  worker: {
    format: 'es'
  },
  // Don't pre-bundle the file:-linked @fkn/lib - its dep cache goes stale when we
  // rebuild the lib, which silently loads an old copy (e.g. a prod-origin /api iframe).
  optimizeDeps: { exclude: ['@fkn/lib'] },
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime"
    }
  },
  plugins: [
    // Pin the buffer polyfill shim absolutely so the file:-linked @fkn/lib resolves it (a resolve.alias won't - rolldown doesn't re-alias).
    {
      name: 'fkn-resolve-node-polyfill-buffer-shim',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'vite-plugin-node-polyfills/shims/buffer') {
          return resolve(__dirname, 'node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js')
        }
      }
    },
    nodePolyfills(),
    preact({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
