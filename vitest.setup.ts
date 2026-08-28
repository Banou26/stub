import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { initSync } from 'sacha'

/**
 * sacha's default init builds a `file:` URL and fetches it, which node cannot do, and unlike frizbee
 * it ships no node entry for the runtime to pick instead.
 *
 * This has to live here rather than behind a branch in `src/sources/utils.ts`: naming a `node:`
 * builtin in that module makes vite fail to resolve it and serve the file as a 500, which kills the
 * extractor worker in the browser. Seeding the module here keeps the app's own code to the one path
 * the browser takes, and sacha's entry points return early once the module is live, so the lazy
 * `init()` in utils.ts becomes a no-op under vitest.
 */
initSync({ module: readFileSync(createRequire(import.meta.url).resolve('sacha/sacha_bg.wasm')) })
