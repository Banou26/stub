// https://github.com/sodatea/vite-plugin-node-stdlib-browser
import { createRequire } from 'module'

import inject from '@rollup/plugin-inject'
import stdLibBrowser from 'node-stdlib-browser'
import esbuildPlugin from 'node-stdlib-browser/helpers/esbuild/plugin'
import {
  handleCircularDependancyWarning
} from 'node-stdlib-browser/helpers/rollup/plugin'


const require = createRequire(import.meta.url)

const plugin = () => ({
  name: 'vite-plugin-node-stdlib-browser',
  config: () => ({
    resolve: {
      alias: stdLibBrowser
    },
    optimizeDeps: {
      include: ['buffer', 'process'],
      esbuildOptions: {
        inject: [require.resolve('node-stdlib-browser/helpers/esbuild/shim')],
        define: {
          global: 'global',
          process: 'process',
          Buffer: 'Buffer'
        },
        plugins: [esbuildPlugin(stdLibBrowser)]
      }
    },
    plugins: [
      {
        ...inject({
          global: [
            require.resolve('node-stdlib-browser/helpers/esbuild/shim'),
            'global'
          ],
          process: [
            require.resolve('node-stdlib-browser/helpers/esbuild/shim'),
            'process'
          ],
          Buffer: [
            require.resolve('node-stdlib-browser/helpers/esbuild/shim'),
            'Buffer'
          ]
        }),
        enforce: 'post'
      }
    ],
    build: {
      rollupOptions: {
        onwarn: (warning, rollupWarn) => {
          handleCircularDependancyWarning(warning, rollupWarn)
        }
      }
    }
  })
})

export default plugin
