import { defineConfig } from 'vite'

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
  }
})
