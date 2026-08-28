import { defineConfig } from 'vitest/config'

// An extractor cannot be imported here: src/sources/*/extractor.ts pulls in the player components and, through them, a CommonJS `require('react')` that a resolve alias does not intercept.
export default defineConfig({
  test: {
    include: ['src/worker/**/*.test.ts', 'src/sources/**/*.test.ts', 'src/utils/**/*.test.ts'],
    environment: 'node',
    // seeds sacha's wasm, which cannot self-init under node. See the file for why it is not inlined.
    setupFiles: ['./vitest.setup.ts'],
  },
})
