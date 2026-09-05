import { defineConfig } from 'vitest/config'

// What cannot be imported here is a WORKER RESOLVER: src/worker/resolvers/*/index.ts reaches
// src/worker/extractor.ts and, through urql, a CommonJS `require('react')` that no resolve alias
// intercepts, so it dies with "Cannot find module 'react'".
//
// Extractors themselves import FINE, and this comment claimed the opposite until 2026-08-31.
// Measured that day, one dynamic import each: all 23 of src/sources/*/extractor.ts load and their
// exports are callable. The claim had already cost something, since it is the stated reason
// stream-id.ts, season.ts and catalogue-gate.ts were split out of their extractors, and it nearly
// cost the regression test in tests/unit/sources/crunchyroll/extractor.test.ts, which drives the real
// `getMedia` against a stubbed `ctx.fetch`. Those modules are still worth having on their own terms;
// the reason written beside them is just not true any more.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // seeds sacha's wasm, which cannot self-init under node. See the file for why it is not inlined.
    setupFiles: ['./vitest.setup.ts'],
  },
})
