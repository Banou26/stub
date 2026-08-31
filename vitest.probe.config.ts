import { defineConfig } from 'vitest/config'

/**
 * The start-date window measurement only, and kept out of both other configs on purpose: it reads a
 * ~20k entry corpus and drives the merge pass over it four times, so neither `npm run test:unit` nor
 * `npm run calibrate` may pay for it.
 *
 *   node scripts/measure-start-date-window.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-start-date-window.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * The probe is named `.probe.ts` rather than `.test.ts` because vitest.calibration.config.ts includes
 * `scripts/**\/*.test.ts`, and a file dropped there under that name silently joins `npm run calibrate`.
 *
 * setupFiles is the same one the other two configs use: sacha ships no node entry, so seeding it there
 * is what keeps src/sources/utils.ts importable at all under node.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.probe.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
})
