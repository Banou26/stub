#!/usr/bin/env node
/**
 * The ground-truth corpus for scripts/calibrate-title-matching.test.ts.
 *
 *   node scripts/fetch-title-corpus.mjs /path/to/manami-titles.json
 *
 * Same upstream release and same asset that scripts/build-anime-data.mjs already pulls, but a
 * different projection of it: that script keeps the catalogue id index and the season list, this one
 * keeps the title-shaped fields the calibration compares (title, synonyms, related, type, year).
 * Written separately rather than folded into the build so a calibration rerun cannot change what a
 * deploy ships.
 *
 * `related` and `sources` are the same URL space, which is what lets the harness resolve a relation
 * into a real record and build sequel and spin-off pairs rather than guessing at them.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'manami-project/anime-offline-database'
const ASSET = 'anime-offline-database.jsonl.zst'
// the same default the harness reads, so `npm run calibrate` needs no argument and a hand run with
// one still works
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = process.argv[2] ?? resolve(ROOT, 'node_modules/.cache/manami-titles.json')

if (existsSync(OUT)) {
  console.log(`already have ${OUT}`)
  process.exit(0)
}

const headers = { accept: 'application/vnd.github+json', 'user-agent': 'stub-calibration' }
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`

const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers })
if (!rel.ok) throw new Error(`releases/latest: HTTP ${rel.status}`)
const release = await rel.json()
const asset = (release.assets ?? []).find(a => a.name === ASSET)
// A GitHub API incident answers 200 with an empty list rather than erroring, so "no release carries
// the asset" is a truthful message about a false premise. Say which of the two happened.
if (!asset) {
  throw new Error(
    `release ${release.tag_name ?? '(untagged)'} lists ${(release.assets ?? []).length} assets and none is ${ASSET}. `
    + `An empty list usually means the API is degraded rather than that the asset is gone: `
    + `check https://www.githubstatus.com and retry before believing it.`
  )
}
console.log(`manami release ${release.tag_name}, downloading ${ASSET}`)

const res = await fetch(asset.browser_download_url)
if (!res.ok) throw new Error(`download: HTTP ${res.status}`)
const jsonl = zstdDecompressSync(Buffer.from(await res.arrayBuffer())).toString('utf8')

const lines = jsonl.split('\n').filter(Boolean)
const meta = JSON.parse(lines[0])
const entries = lines.slice(1).map(line => JSON.parse(line))
// the same floor the harness asserts on load, so a truncated download cannot pass as a corpus
if (entries.length < 30_000) throw new Error(`only ${entries.length} entries, expected 30000 or more`)

const records = entries.map(entry => ({
  sources: entry.sources ?? [],
  title: entry.title,
  synonyms: entry.synonyms ?? [],
  type: entry.type,
  year: entry.animeSeason?.year ?? null,
  season: entry.animeSeason?.season ?? null,
  episodes: entry.episodes ?? null,
  related: entry.relatedAnime ?? [],
}))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ tag: release.tag_name, updated: meta.lastUpdate, records }))
console.log(`${records.length} records, cut ${meta.lastUpdate} -> ${OUT}`)
