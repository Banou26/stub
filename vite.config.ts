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
    nodePolyfills(),
    preact({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
