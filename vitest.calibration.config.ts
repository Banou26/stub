import { defineConfig } from 'vitest/config'

/**
 * The calibration harness only. Kept out of vitest.config.ts's include list on purpose: it reads a
 * 38MB corpus and scores hundreds of thousands of pairs, and `npm run test:unit` must not pay for
 * that on every invocation.
 *
 *   ./node_modules/.bin/vitest run --config vitest.calibration.config.ts \
 *     --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing. vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no
 * measurement. `npx vitest` fails on this machine with EBADDEVENGINES, so call the binary directly.
 *
 * setupFiles is the same one the unit config uses, and it is required rather than incidental: sacha
 * ships no node entry, so franchiseTitle (and through it bestTitleScore, which is the crunchyroll
 * gate's whole scoring path) returns its input unchanged without the initSync seeding in that file.
 * A control in the harness asserts the season actually comes off, so a missing setup fails loudly
 * instead of quietly turning every franchise number into a raw one.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
})
