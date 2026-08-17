#!/usr/bin/env node
// Emit the cross-catalog id index stub loads lazily, from the `@kawaiioverflow/arm` npm package.
//
// Runs on every build (`npm run build` -> `data:build`). It reads node_modules and touches the
// network NEVER, so a build cannot fail because a third party is down, and the exact input is
// pinned by package-lock.json like any other dependency.
//
// WHAT THIS IS FOR
//
// stub fans a search out to roughly twenty sources and then GUESSES which of their records describe
// one show, by comparing titles with Smith-Waterman. That guess is where this repo's worst bugs have
// come from: normalising a Japanese title to `[a-z0-9]` once left 1,321 clusters sharing a key with
// no letter in it, and welded 68 unrelated shows into one component. An exact id table replaces the
// guess with a lookup wherever it has an answer.
//
// WHY arm AND NOT manami-project/anime-offline-database
//
// The obvious candidate is manami, and it loses on all four axes that matter here. Measured, not
// assumed, against the 2026-27 dump and arm 0.239.0:
//
//   - MyAnimeList <-> AniList pairs: arm 20,754, manami 18,858. arm carries 2,114 that manami does
//     not, against 218 the other way.
//   - arm is MIT. manami is ODbL v1.0, whose section 4.4 share-alike attaches to a Derivative
//     Database, which a re-encoded extract of it plainly is. Shipping that from an MIT repo needs a
//     license carve-out, a notice inside the artifact, a user-visible attribution and an offer of
//     the whole derived database. arm needs none of it.
//   - arm is ON npm, so it is pinned by the lockfile and refreshed by `npm update`. manami publishes
//     no package at all and its git repo carries no data (the dumps exist only as release assets),
//     so consuming it means an unpinned download inside the build.
//   - arm published 5 days ago and has 239 versions. manami's newest release is 6 weeks old and its
//     2026 cadence has a thirteen week hole (weeks 15 to 26 do not exist).
//
// manami remains the better SEASONAL source, because arm carries no titles, covers or seasons at
// all. That half is deliberately not built here: see scripts/refresh-manami.mjs.
//
// WHAT IS DELIBERATELY DROPPED
//
// A row whose ids are wrong welds two unrelated shows together permanently, because the store's
// union-find exposes no unlink. So this drops more than it strictly has to:
//
//   - any row not carrying BOTH a MyAnimeList and an AniList id, since a row with one id links
//     nothing to anything and only costs bytes,
//   - any id repeated across rows, which can only mean the upstream merged two catalog entries that
//     are not the same show. Cross-checking arm against manami found 12 outright disagreements, and
//     manami independently carries 48 rows holding two ids from a single catalog (`Cosmic Break` is
//     `anilist/17295` and `anilist/206843` at once). Both databases have this class of error, so the
//     shipped table keeps only ids that appear exactly once.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { brotliCompressSync, constants } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'src/generated')

const log = (...args) => console.log('[anime-index]', ...args)

const armVersion = () => JSON.parse(readFileSync(require.resolve('@kawaiioverflow/arm/package.json'), 'utf8')).version

/**
 * Rows carrying both ids, with every ambiguous id removed.
 *
 * The two passes are not interchangeable. Counting first and filtering second is what removes BOTH
 * sides of a collision: dropping the second occurrence as it is met would keep the first, which is
 * exactly as likely to be the wrong one.
 */
const buildPairs = entries => {
  const malSeen = new Map()
  const anilistSeen = new Map()
  for (const entry of entries) {
    if (!entry.mal_id || !entry.anilist_id) continue
    malSeen.set(entry.mal_id, (malSeen.get(entry.mal_id) ?? 0) + 1)
    anilistSeen.set(entry.anilist_id, (anilistSeen.get(entry.anilist_id) ?? 0) + 1)
  }

  const kept = []
  let ambiguous = 0
  for (const entry of entries) {
    if (!entry.mal_id || !entry.anilist_id) continue
    if (malSeen.get(entry.mal_id) > 1 || anilistSeen.get(entry.anilist_id) > 1) { ambiguous++; continue }
    kept.push([entry.mal_id, entry.anilist_id])
  }
  return { kept: kept.sort((a, b) => a[0] - b[0]), ambiguous }
}

/**
 * Two columns, sorted by MyAnimeList id, that column delta-coded.
 *
 * Measured on the real rows rather than assumed: this encoding is the same size after brotli as a
 * hand-rolled text format and 40% smaller than the obvious array-of-pairs shape, while still
 * decoding with a single JSON.parse. The running sum that undoes the delta costs about 2 ms.
 */
const encode = pairs => {
  let previous = 0
  const mal = pairs.map(([id]) => { const delta = id - previous; previous = id; return delta })
  return { mal, anilist: pairs.map(([, id]) => id) }
}

/**
 * Emitted as a TypeScript module holding a JSON string, not as a .json file.
 *
 * Two reasons, both measured against this repo's own vite-plus 0.2.4. A lazily imported .json
 * compiles to a JS OBJECT LITERAL unless `json.namedExports` is turned off, which is global config
 * that would change how every other JSON import in the app behaves. And a JSON.parse of a string
 * literal is the faster path for a payload this size, which a literal cannot use. Emitting the
 * module directly gets both without touching the shared config.
 *
 * The single quotes and backslashes are escaped because the payload is embedded in a single-quoted
 * TS string. JSON.stringify of a JSON string does the escaping correctly, including for any code
 * point that would otherwise terminate the literal.
 */
const emit = (version, payload) => {
  const json = JSON.stringify(payload)
  const module = `// GENERATED by scripts/build-anime-index.mjs from @kawaiioverflow/arm@${version}. Do not edit.
//
// Loaded only through a dynamic import, so these bytes are a separate content-hashed chunk and are
// absent from the initial bundle. Parsed from a string rather than written as an object literal
// because JSON.parse is the faster path at this size.
export const ARM_VERSION = ${JSON.stringify(version)}
export default JSON.parse(${JSON.stringify(json)}) as { mal: number[], anilist: number[] }
`
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'anime-index.ts'), module)
  return { json, module }
}

const version = armVersion()
const entries = require('@kawaiioverflow/arm/arm.json')
const { kept, ambiguous } = buildPairs(entries)
const { json, module } = emit(version, encode(kept))

const brotli = brotliCompressSync(Buffer.from(json), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })

log(`arm@${version}: ${entries.length} entries`)
log(`${kept.length} unambiguous MyAnimeList <-> AniList pairs, ${ambiguous} dropped as ambiguous`)
log(`src/generated/anime-index.ts, ${(module.length / 1024).toFixed(0)} KB on disk, ${(brotli.length / 1024).toFixed(0)} KB brotli over the wire`)

// A guard rather than a nicety. The whole artifact is one lazily imported chunk, so if the upstream
// package ever ships an empty or reshaped arm.json this script would happily emit an empty table and
// every lookup would silently miss, which is indistinguishable from a show simply not being listed.
if (kept.length < 15_000) {
  console.error(`[anime-index] REFUSING: only ${kept.length} pairs, expected at least 15000. arm@${version} may have changed shape.`)
  process.exit(1)
}
