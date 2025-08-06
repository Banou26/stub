import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig((env) => ({
  build: {
    target: 'esnext',
    outDir: 'build'
  },
  worker: {
    format: 'es'
  },
  define: env.mode === 'development' ? {} : {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  plugins: [
    react({
      jsxImportSource: '@emotion/react'
    })
  ]
}))
