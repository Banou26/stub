import { defineConfig } from 'vitest/config'

// Unit tests for worker-realm modules that do not need a browser. Kept separate from vite.config.ts,
// which is the vite-plus app build and which vitest cannot consume, and from the playwright suite in
// tests/, which runs in a real browser and cannot import worker-only modules at all.
//
// An extractor cannot be imported here: reaching src/sources/*/extractor.ts pulls in the player
// components and, through them, a CommonJS `require('react')` that a resolve alias does not intercept.
// That is why the plugin payload reader lives in its own module rather than inside extractor.ts.
//
// So a test under src/sources may only import a module with NO imports of its own - the identity and
// matching rules an extractor delegates to. Import the extractor itself and the suite dies on react,
// which is a confusing failure for a file that looks like an ordinary unit test.
export default defineConfig({
  test: {
    include: ['src/worker/**/*.test.ts', 'src/sources/**/*.test.ts'],
    environment: 'node',
  },
})
