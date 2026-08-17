#!/usr/bin/env node
// Build the two anime data artifacts stub loads lazily, by merging two independent id databases.
//
// Runs as part of `npm run build` (see the `data:build` script). It pulls the newest
// manami-project/anime-offline-database release so a deploy always carries current data, and merges
// it with the `@kawaiioverflow/arm` npm package, which is pinned by package-lock.json.
//
//   src/generated/anime-index.ts    cross-catalog ids: MyAnimeList, AniList, Kitsu, AniDB
//   src/generated/anime-seasons.ts  seasonal listings with titles and covers
//
// Both are reached ONLY through a dynamic import, so they are separate content-hashed chunks and
// add nothing to the initial bundle.
//
// WHY TWO DATABASES RATHER THAN THE BEST ONE
//
// Not for coverage, though the union does win there (20,972 MyAnimeList to AniList pairs against
// arm's 20,754 and manami's 18,858). It is because a wrong pair is unrecoverable: the store's
// union-find has no unlink, so one bad row welds two unrelated shows together for the worker's
// lifetime and the merged cluster then goes on to weld a third through the fuzzy pass. That is the
// shape of the uNoGS Death Note incident already recorded in the knowledge base.
//
// Neither database is clean on its own, measured rather than assumed:
//
//   - manami carries 48 rows holding two ids from a SINGLE catalog, which can only mean it welded
//     two catalog entries that are not the same show. `Cosmic Break` is anilist/17295 and
//     anilist/206843 at once. Upstream's own README says the data is 65% reviewed.
//   - The two disagree outright on 12 MyAnimeList ids, so at least one is wrong in each case.
//
// Holding both is what makes those detectable at all. Either alone would assert every one of them
// silently. So a pair ships only when nothing contradicts it, and anything ambiguous is dropped.
//
// NETWORK POLICY
//
// Every build takes the newest release, so a deploy is never older than the last one published.
// Nothing generated is committed. A local build cache under node_modules/.cache keeps repeat builds
// off the network, and a CI checkout has no cache, so CI always fetches.
//
// If the fetch fails with no cache to fall back on, the build FAILS rather than degrading. arm alone
// would still produce a plausible looking index, so a silent degrade would ship a build with no
// season listings and no Kitsu or AniDB ids while looking entirely healthy.
//
// The release is named through two independent endpoints, because they fail independently. See
// `newestRelease`: the list endpoint can answer 200 with an empty array during a GitHub incident,
// which reads as "this repo has no releases" and is not that at all.
//
// LICENSING
//
// stub is MIT, and neither upstream is, so the derived data carries its own terms rather than the
// repo's. Attribution is per artifact and lists every contributor to THAT file: anime-seasons is
// manami alone, anime-index is arm and manami together. Each one repeats its credits in a header
// comment AND in a `sources` field, because ODbL section 4.2(b) wants the notice inside the
// database as well as in the documentation. data/README.md is the attribution of record and
// data/LICENSE-manami.txt is the full ODbL text.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { brotliCompressSync, constants, zstdDecompressSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, 'data')
const OUT_DIR = resolve(ROOT, 'src/generated')

// A build cache, never a checked-in artifact. Nothing generated is committed: `data/` holds only the
// license and the attribution, and `src/generated/` is gitignored like the graphql codegen output.
// This exists so a local rebuild does not re-download 6 MB every time, and so a transient failure
// mid-session reuses what the last build already fetched. A fresh CI checkout has no cache and
// therefore always takes the live release, which is the point.
const CACHE = resolve(ROOT, 'node_modules/.cache/stub-anime-data.json')

const REPO = 'manami-project/anime-offline-database'
const ASSET = 'anime-offline-database.jsonl.zst'
const FETCH_TIMEOUT_MS = 120_000
const RETRY_DELAY_MS = 2_000

// Attribution is PER ARTIFACT, not one blanket notice, because the two artifacts are not derived
// from the same things. anime-seasons is manami alone. anime-index is a merge in which arm supplies
// the larger share (20,754 of the MyAnimeList to AniList pairs against manami's 18,858), so an
// ODbL-only notice on it would credit the smaller contributor and omit the larger one entirely.
//
// The two licenses also want different things. ODbL section 4.2 wants its notice carried inside the
// database as well as in the docs, which is why every artifact repeats it in a header AND in a
// `sources` field. MIT wants its copyright line reproduced in any substantial portion.
const MANAMI = {
  name: 'manami-project/anime-offline-database',
  url: `https://github.com/${REPO}`,
  license: 'ODbL-1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  notice: 'Full terms in data/LICENSE-manami.txt.',
}

const ARM = {
  name: '@kawaiioverflow/arm',
  url: 'https://github.com/kawaiioverflow/arm',
  license: 'MIT',
  licenseUrl: 'https://opensource.org/license/mit',
  notice: 'Copyright (c) P-Chan.',
}

// A season is carried for a while either side of the dump's own cut date, because the artifact has
// to stay useful as the clock moves past the season it was built in. manami lists seasons well
// ahead, so a forward window is nearly free.
const SEASONS_BACK = 1
const SEASONS_FORWARD = 4
const SEASON_ORDER = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
const seasonIndex = ({ year, season }) => year * 4 + SEASON_ORDER.indexOf(season)

const CATALOGS = [
  { key: 'anilist', host: 'anilist.co' },
  { key: 'mal', host: 'myanimelist.net' },
  { key: 'kitsu', host: 'kitsu.app' },
  { key: 'anidb', host: 'anidb.net' },
]

const log = (...args) => console.log('[anime-data]', ...args)
const warn = (...args) => console.warn('[anime-data] WARNING:', ...args)

const idIn = (sources, host) => {
  const matches = sources.filter(source => source.includes(host))
  // Two ids from one catalog means the upstream merged two entries that are not the same show, so
  // the row is not trustworthy for that catalog at all. Taking the first would be picking one of
  // two values already known to disagree.
  if (matches.length !== 1) return 0
  const id = /(\d+)\/?$/.exec(matches[0])?.[1]
  return id ? Number(id) : 0
}

/* --------------------------------------------------------------------------------------------- */
/* manami: fetch, trim, cache                                                                       */
/* --------------------------------------------------------------------------------------------- */

const assetIn = release => release?.assets?.find(candidate => candidate.name === ASSET)

const askGitHub = async (path, signal) => {
  const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'stub-build' },
    signal,
  })
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`)
  return response.json()
}

// The list endpoint names every dated release, so it is the only one that can pick the newest.
const fromReleaseList = async signal => {
  const list = await askGitHub('releases?per_page=100', signal)

  // A 200 carrying an empty array is what api.github.com answers during an incident, and nothing
  // about it looks wrong: there is no status to check and no exception to catch. It is NOT evidence
  // that the repo has no releases, so it must not be reported as "no release carries the asset",
  // which is a true sentence about a false premise. That message failed a stub deploy on
  // 2026-08-18 while every tag was still in place and releases/latest was answering normally.
  if (!Array.isArray(list) || !list.length) throw new Error('the release list answered 200 with nothing in it')

  // Ordered by the tag's own YYYY-WW, never by published_at: the repo carries a rolling `latest`
  // tag whose published_at is frozen at the date it was first created, more than a year before the
  // assets it currently points at, so "newest by date" picks the oldest thing in the list.
  const dated = list
    .filter(release => /^\d{4}-\d{2}$/.test(release.tag_name))
    .sort((a, b) => b.tag_name.localeCompare(a.tag_name))

  for (const release of dated) {
    const asset = assetIn(release)
    if (asset) return { tag: release.tag_name, url: asset.browser_download_url }
  }
  throw new Error(`none of the ${list.length} listed releases carries ${ASSET}`)
}

// One release, named by GitHub rather than chosen here, and served by a code path that stayed up
// through the incident above. It cannot pick the newest dated tag, which is why it is the fallback
// and not the primary. Whatever tag it names is accepted, including the rolling `latest` one,
// because a slightly older dump still yields a full season window (buildExtract anchors the window
// on the dump's own cut date rather than on today) and the alternative here is no deploy at all.
const fromLatestRelease = async signal => {
  const release = await askGitHub('releases/latest', signal)
  const asset = assetIn(release)
  if (!asset) throw new Error(`releases/latest (${release?.tag_name ?? 'untagged'}) does not carry ${ASSET}`)
  return { tag: release.tag_name, url: asset.browser_download_url }
}

const RELEASE_SOURCES = [
  { name: 'the release list', find: fromReleaseList },
  { name: 'releases/latest', find: fromLatestRelease },
]

// Two endpoints, twice, because the ways this fails are all transient and none of them are the
// repo actually lacking the asset. Every attempt is reported on the way out, so a build that took
// the fallback says so in its log rather than looking like an ordinary one.
const newestRelease = async signal => {
  const failures = []
  for (const round of [0, 1]) {
    if (round) {
      if (signal.aborted) break
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
    for (const source of RELEASE_SOURCES) {
      try {
        const release = await source.find(signal)
        if (failures.length) warn(`named ${release.tag} through ${source.name}, after ${failures.length} failed attempt(s): ${[...new Set(failures)].join('; ')}`)
        return release
      } catch (error) {
        failures.push(error.message)
      }
    }
  }
  throw new Error([...new Set(failures)].join('; '))
}

const catalogIds = entry => Object.fromEntries(CATALOGS.map(({ key, host }) => [key, idIn(entry.sources, host)]))

/**
 * The extract, which is deliberately NOT "the dump with some fields removed".
 *
 * Keeping a title and a cover path for every one of the 41,113 usable rows makes an 8.2 MB file,
 * and only the windowed seasons ever render a title. So only they carry one, and every other row is
 * reduced to its four ids, which is the entire contribution the rest of the dump makes to the merge.
 *
 * It also lands the extract in nearly the shape the build wants, so the cache path exercises the
 * same code as the fresh path rather than a second one that could rot untested.
 */
const buildExtract = (entries, meta, tag) => {
  const cut = new Date(`${meta.lastUpdate}T00:00:00Z`)
  const anchor = { year: cut.getUTCFullYear(), season: SEASON_ORDER[Math.floor(cut.getUTCMonth() / 3)] }
  const from = seasonIndex(anchor) - SEASONS_BACK
  const to = seasonIndex(anchor) + SEASONS_FORWARD

  const rows = []
  const seasons = {}
  for (const entry of entries) {
    const ids = catalogIds(entry)
    if (ids.mal || ids.anilist || ids.kitsu || ids.anidb) rows.push([ids.mal, ids.anilist, ids.kitsu, ids.anidb])

    const season = entry.animeSeason
    if (!season?.year || !SEASON_ORDER.includes(season.season)) continue
    const index = seasonIndex(season)
    if (index < from || index > to) continue

    const record = {
      t: entry.title,
      ty: entry.type,
      // A MyAnimeList CDN path with the constant prefix dropped, restored on the client. Every
      // entry has a picture, and the prefix is 42 of its roughly 70 bytes.
      p: entry.picture?.replace('https://cdn.myanimelist.net/images/anime/', '') ?? '',
    }
    if (entry.episodes) record.ep = entry.episodes
    if (ids.mal) record.ml = ids.mal
    if (ids.anilist) record.al = ids.anilist
    if (ids.kitsu) record.ku = ids.kitsu
    if (entry.score?.arithmeticMean) record.sc = Math.round(entry.score.arithmeticMean * 100) / 100
    ;(seasons[`${season.year}-${season.season}`] ??= []).push(record)
  }

  return { sources: [MANAMI], tag, updated: meta.lastUpdate, anchor: `${anchor.year}-${anchor.season}`, rows, seasons }
}

const refreshExtract = async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const release = await newestRelease(controller.signal)
    log(`manami release ${release.tag}, downloading`)

    const response = await fetch(release.url, { signal: controller.signal })
    if (!response.ok) throw new Error(`download: HTTP ${response.status}`)
    const jsonl = zstdDecompressSync(Buffer.from(await response.arrayBuffer())).toString('utf8')

    const lines = jsonl.split('\n').filter(Boolean)
    const meta = JSON.parse(lines[0])
    const entries = lines.slice(1).map(line => JSON.parse(line))
    if (entries.length < 30_000) throw new Error(`only ${entries.length} entries, expected 30000+`)

    const extract = buildExtract(entries, meta, release.tag)

    mkdirSync(dirname(CACHE), { recursive: true })
    writeFileSync(CACHE, JSON.stringify(extract))
    log(`${extract.rows.length} rows carrying an id, ${Object.keys(extract.seasons).length} seasons, cut ${meta.lastUpdate}`)
    return extract
  } finally {
    clearTimeout(timer)
  }
}

const loadManami = async () => {
  if (process.argv.includes('--offline')) {
    log('--offline: skipping the release fetch')
  } else {
    try {
      return await refreshExtract()
    } catch (error) {
      warn(`could not reach ${REPO}: ${error.message}`)
    }
  }
  // Deliberately fails rather than emitting a thinner artifact. arm alone would still produce a
  // plausible looking index, so a silent degrade would ship a build missing every season listing and
  // every Kitsu and AniDB id, and look exactly like a healthy one.
  if (!existsSync(CACHE)) {
    console.error(`[anime-data] REFUSING: no data from ${REPO}, and no build cache to fall back on.`)
    console.error(`[anime-data] The seasonal artifact cannot be built without it. Run with network access.`)
    process.exit(1)
  }
  const extract = JSON.parse(readFileSync(CACHE, 'utf8'))
  warn(`using the build cache, ${extract.tag} cut ${extract.updated}. This may be out of date.`)
  return extract
}

/* --------------------------------------------------------------------------------------------- */
/* merge                                                                                            */
/* --------------------------------------------------------------------------------------------- */

/**
 * One row per show, carrying every catalog id the two databases agree on.
 *
 * The passes are ordered so that a contradiction always removes a row rather than resolving it. An
 * id that two sources disagree about is exactly the id most likely to weld the wrong pair together,
 * so there is no tie to break: both readings go.
 */
const mergeIds = (armEntries, manamiRows) => {
  const rows = new Map()
  const conflicts = new Set()

  const put = (mal, anilist, kitsu, anidb) => {
    if (!mal) return
    const existing = rows.get(mal)
    if (!existing) { rows.set(mal, { mal, anilist, kitsu, anidb }); return }
    // A disagreement on a field either side actually knows is a contradiction, and the row dies.
    if (anilist && existing.anilist && anilist !== existing.anilist) { conflicts.add(mal); return }
    if (kitsu && existing.kitsu && kitsu !== existing.kitsu) { conflicts.add(mal); return }
    if (anidb && existing.anidb && anidb !== existing.anidb) { conflicts.add(mal); return }
    existing.anilist ||= anilist
    existing.kitsu ||= kitsu
    existing.anidb ||= anidb
  }

  for (const entry of armEntries) put(entry.mal_id, entry.anilist_id ?? 0, 0, 0)
  for (const [mal, anilist, kitsu, anidb] of manamiRows) put(mal, anilist, kitsu, anidb)

  for (const mal of conflicts) rows.delete(mal)

  // A second pass on the OTHER columns, because the map is keyed on the MyAnimeList id and so it
  // cannot see two different shows claiming one AniList id. Counting first and deleting second is
  // what removes both sides: dropping the second occurrence as it is met would keep the first,
  // which is exactly as likely to be the wrong one.
  const ambiguous = { anilist: new Map(), kitsu: new Map(), anidb: new Map() }
  for (const row of rows.values()) {
    for (const key of ['anilist', 'kitsu', 'anidb']) {
      if (row[key]) ambiguous[key].set(row[key], (ambiguous[key].get(row[key]) ?? 0) + 1)
    }
  }
  let cleared = 0
  for (const row of rows.values()) {
    for (const key of ['anilist', 'kitsu', 'anidb']) {
      if (row[key] && ambiguous[key].get(row[key]) > 1) { row[key] = 0; cleared++ }
    }
  }

  const kept = [...rows.values()]
    .filter(row => row.anilist || row.kitsu || row.anidb)
    .sort((a, b) => a.mal - b.mal)

  return { kept, conflicts: conflicts.size, cleared }
}

/**
 * Four columns, sorted by MyAnimeList id, that column delta-coded.
 *
 * Measured against the alternatives on the real rows: the same size after brotli as a hand-rolled
 * text encoding and 40% smaller than an array of rows, while still decoding with one JSON.parse.
 * Zero means absent, which no catalog here ever issues as a real id.
 */
const encodeIndex = rows => {
  let previous = 0
  return {
    mal: rows.map(row => { const delta = row.mal - previous; previous = row.mal; return delta }),
    anilist: rows.map(row => row.anilist),
    kitsu: rows.map(row => row.kitsu),
    anidb: rows.map(row => row.anidb),
  }
}

/* --------------------------------------------------------------------------------------------- */
/* emit                                                                                             */
/* --------------------------------------------------------------------------------------------- */

/**
 * Emitted as TypeScript holding a JSON string, not as a .json file.
 *
 * A lazily imported .json compiles to a JS object literal here unless `json.namedExports` is turned
 * off, which is global config that would change every other JSON import in the app. Emitting the
 * module directly gets the JSON.parse fast path, which is the quicker one at this size, without
 * touching shared config.
 */
const emit = (name, payload, provenance, sources) => {
  const json = JSON.stringify({ sources, ...payload })
  const credits = sources
    .map(source => `//   ${source.name}\n//     ${source.url}\n//     ${source.license}, ${source.licenseUrl}. ${source.notice}`)
    .join('\n')
  const module = `// GENERATED by scripts/build-anime-data.mjs. Do not edit.
//
// Derived from:
${credits}
//
// Attribution of record is data/README.md. ${provenance}
//
// Reached only through a dynamic import, so these bytes are a separate content-hashed chunk and are
// absent from the initial bundle. Parsed from a string because JSON.parse is the faster path here.
export default JSON.parse(${JSON.stringify(json)}) as ${name.types}
`
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, name.file), module)
  const brotli = brotliCompressSync(Buffer.from(json), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  log(`${name.file.padEnd(18)} ${(json.length / 1024).toFixed(0).padStart(5)} KB raw, ${(brotli.length / 1024).toFixed(0).padStart(4)} KB brotli`)
  return brotli.length
}

const main = async () => {
  const armVersion = JSON.parse(readFileSync(require.resolve('@kawaiioverflow/arm/package.json'), 'utf8')).version
  const armEntries = require('@kawaiioverflow/arm/arm.json')
  const manami = await loadManami()

  log(`arm@${armVersion}: ${armEntries.length} rows | manami ${manami.tag}: ${manami.rows.length} rows`)

  const { kept, conflicts, cleared } = mergeIds(armEntries, manami.rows)
  log(`merged index: ${kept.length} rows, ${conflicts} dropped on a contradiction, ${cleared} ids cleared as ambiguous`)

  const { seasons, anchor } = manami
  for (const [key, list] of Object.entries(seasons).sort()) log(`  season ${key.padEnd(12)} ${String(list.length).padStart(4)}`)

  const provenance = `Built from arm@${armVersion} and manami ${manami.tag} (cut ${manami.updated}).`

  const total =
    emit(
      { file: 'anime-index.ts', types: '{ mal: number[], anilist: number[], kitsu: number[], anidb: number[] }' },
      { arm: armVersion, tag: manami.tag, updated: manami.updated, ...encodeIndex(kept) },
      provenance,
      [ARM, MANAMI],
    ) +
    emit(
      { file: 'anime-seasons.ts', types: '{ seasons: Record<string, { t: string, ty: string, p: string, ep?: number, ml?: number, al?: number, ku?: number, sc?: number }[]> }' },
      // Already formatted by buildExtract, and formatted again here it produced the literal string
      // "undefined-undefined" in every shipped artifact, because a string has no .year or .season.
      { tag: manami.tag, updated: manami.updated, anchor, seasons },
      provenance,
      [MANAMI],
    )

  log(`${(total / 1024).toFixed(0)} KB brotli total, none of it in the initial bundle`)

  // Guards rather than niceties. Both artifacts are lazily imported, so a shape change upstream
  // would emit an empty table and every lookup would silently miss, which is indistinguishable from
  // a show simply not being listed.
  if (kept.length < 15_000) {
    console.error(`[anime-data] REFUSING: only ${kept.length} index rows, expected at least 15000.`)
    process.exit(1)
  }
  if (Object.keys(seasons).length < 3) {
    console.error(`[anime-data] REFUSING: only ${Object.keys(seasons).length} seasons, expected at least 3.`)
    process.exit(1)
  }
}

await main()
