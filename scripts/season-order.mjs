// Plain JavaScript and import-free ON PURPOSE, for two reasons that each broke a build.
//
// It cannot reach src/generated, because ./build-anime-data.mjs loads it and runs BEFORE codegen,
// which is what src/sources/offline/normalize.ts imports. And it cannot be TypeScript: a .mjs
// importing a .ts needs Node's type stripping, which arrived in 22.18, and the deploy runner's Node
// is older. The Cloudflare build failed on `ERR_UNKNOWN_FILE_EXTENSION ".ts"` for two commits before
// this file was JS (2026-09-05, 6bf3bb1 and 44ad1a9, reproduced locally with
// `node --no-experimental-strip-types`).

/**
 * A season's records in the order the home page should paint them.
 *
 * The listing sorts on `popularity` with a stable sort and every bundled row has none, so the order
 * the bundle ships in IS the order a cold page shows. manami's dump is alphabetical, so the first
 * paint was the alphabet: "Kimi o Aisuru Ki wa Nai", "Adventure Time: Side Quests", "Aware!
 * Meisaku-kun" (measured on the shipped bundle, SUMMER 2026, 2026-09-05).
 *
 * manami carries NO popularity count, so its 1 to 10 rating is the only honest thing to rank by, and
 * only 37 of those 219 records carry one. A rated show is one somebody watched, which beats the
 * alphabet; the top of that list is a rating with few votes behind it, which is why this is a
 * fallback ordering and not a popularity. The unrated tail keeps its arrival order, so the bundle
 * stays byte-deterministic for a given dump.
 *
 * @template {{ sc?: number }} T
 * @param {readonly T[]} records
 * @returns {T[]}
 */
export const orderSeasonBucket = records =>
  [...records].sort((a, b) => (b.sc ?? -1) - (a.sc ?? -1))
