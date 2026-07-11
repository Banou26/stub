import { resolve } from 'path'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import preact from '@preact/preset-vite'

export default defineConfig((_) => ({
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
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  // Don't pre-bundle the file:-linked @fkn/lib - its dep cache goes stale when we
  // rebuild the lib, which silently loads an old copy (e.g. a prod-origin /api iframe).
  // Its nested CJS dep still needs pre-bundling, else named imports (Address4) break in dev.
  optimizeDeps: { exclude: ['@fkn/lib'], include: ['@fkn/lib > ip-address'] },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  plugins: lazyPlugins(() => [
    // Pin the buffer polyfill shim absolutely so the file:-linked @fkn/lib resolves it (a resolve.alias won't - rolldown doesn't re-alias).
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
