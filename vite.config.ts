import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
import nodePolyfills from 'vite-plugin-node-stdlib-browser'

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'build',
    lib: {
      name: 'OL',
      fileName: 'index',
      entry: 'src/index.tsx',
      formats: ['es']
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        // @ts-ignore
        // NodeGlobalsPolyfillPlugin({
        //   process: true
        // }),
        // // @ts-ignore
        // NodeModulesPolyfillPlugin()
      ]
    }
  },
  plugins: [
    react({
      jsxImportSource: '@emotion/react'
    }),
    nodePolyfills()
  ],
  server: {
    fs: {
      allow: ['../..']
    }
  }
})
