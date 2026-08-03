import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import preact from '@preact/preset-vite'

// read rather than imported so the manifest does not end up in the bundle
const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig((_) => ({
  define: {
    __STUB_VERSION__: JSON.stringify(version),
  },
  fmt: { semi: false, singleQuote: true },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ['tests/**', '**/*.spec.ts', '**/*.test.ts', 'examples/**'],
        rules: {
          'no-floating-promises': 'off',
          'no-unused-vars': 'off',
          'no-unused-expressions': 'off',
        },
      },
    ],
  },
  experimental: {
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  // the file:-linked @fkn/lib goes stale when the lib is rebuilt, but its nested CJS dep still needs pre-bundling, else named imports (Address4) break in dev
  optimizeDeps: { exclude: ['@fkn/lib'], include: ['@fkn/lib > ip-address'] },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  plugins: lazyPlugins(() => [
    // the shim's dual exports map bundles buffer twice unless pinned to one build, and a resolve.alias won't do it: rolldown doesn't re-alias
    {
      name: 'fkn-resolve-node-polyfill-buffer-shim',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'vite-plugin-node-polyfills/shims/buffer') {
          return resolve(
            __dirname,
            'node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js',
          )
        }
      },
    },
    nodePolyfills(),
    preact({
      jsxImportSource: '@emotion/react',
    }),
  ]),
}))
