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
  optimizeDeps: {},
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime"
    }
  },
  plugins: [
    // vite-plugin-node-polyfills aliases `buffer` to the BARE specifier
    // `vite-plugin-node-polyfills/shims/buffer`. rolldown resolves that bare
    // target relative to the importing module, and @fkn/lib is linked via
    // `file:../fkn/web/lib` (outside our node_modules), so the target isn't
    // found from fkn/web's tree and the production build fails. (Dev works
    // because optimizeDeps pre-bundles @fkn/lib from the project root.) A
    // resolve.alias can't fix this — rolldown's alias pass doesn't re-alias its
    // own output — so resolve the bare shim id to its absolute (self-contained)
    // dist here instead. Must run before the plugin's alias rewrite.
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
