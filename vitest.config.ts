import { defineConfig } from 'vitest/config'

// Unit tests for worker-realm modules that do not need a browser. Kept separate from vite.config.ts,
// which is the vite-plus app build and which vitest cannot consume, and from the playwright suite in
// tests/, which runs in a real browser and cannot import worker-only modules at all.
//
// Scoped to src/worker/**: anything reaching src/sources pulls in the player components and, through
// them, a CommonJS `require('react')` that a resolve alias does not intercept. That is why the plugin
// payload reader lives in its own module rather than inside extractor.ts.
export default defineConfig({
  test: {
    include: ['src/worker/**/*.test.ts'],
    environment: 'node',
  },
})
