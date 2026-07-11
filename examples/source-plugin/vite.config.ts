import { defineConfig } from 'vite-plus'

// One self-contained browser-ESM bundle: the sandbox npm loader serves only `main` and
// origin-relative files, so everything (including @fkn/lib) is bundled in.
export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
  },
})
