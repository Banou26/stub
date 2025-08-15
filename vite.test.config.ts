import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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
    }
  },
  optimizeDeps: {
    include: ['wa-sqlite']
  },
  plugins: [
    nodePolyfills(),
    prismaBrowserHack(),
    {
      name: 'custom-index-html',
      transformIndexHtml(html) {
        return `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Stub Test</title>
            </head>
            <body>
              <script type="module" src="./tests/_tests_.ts"></script>
            </body>
          </html>
        `
      }
    }
  ]
})
