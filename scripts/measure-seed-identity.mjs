#!/usr/bin/env node
/**
 * Measure the per-run IDENTITY COUNT distribution the seed gate's `SEED_MIN_MEDIAN_IDENTITY` reads.
 *
 *   node scripts/measure-seed-identity.mjs [--seed dist-seed/snapshots.jsonl]
 *                                          [--corpus corpus/season/<season>] [--top 100]
 *
 * An identity is the number of distinct catalogue uris a run carries, `offline` excluded, which is
 * exactly what `buildSeed` writes into `run.identity` and what `checkSeedCounts` takes the median of.
 * `offline` is excluded because the export excludes it (rule 3 of scripts/export-season-seed.mjs): the
 * bundle's handles form a star centred on `offline:<key>`, so counting it would have every run report
 * the bridge rather than what a live source asserted.
 *
 * THREE SOURCES, none of which agrees with another by construction, so a bar they all clear is not an
 * artefact of one walk:
 *
 *   seed        `dist-seed/snapshots.jsonl`, the store export of a real walk, run back through
 *               `buildSeed`. This is the gate's own number and not a reconstruction of it, so the
 *               script prints the builder's `report.medianIdentity` beside its own median as a
 *               control: a table that cannot reproduce the recorded number is measuring something
 *               else and says so.
 *   corpus      `corpus/season/<season>/answers.jsonl`, every source answer of a season walk. A run's
 *               identity is rebuilt from the SAME_AS claims the recorded media rows carry, unioned,
 *               with `offline` nodes left out of the graph entirely. Rows are deduped on `key` ACROSS
 *               pages, so a row cannot be attributed to the page it arrived on; it is attributed by
 *               CONTENT instead, which is what the union does. Reported whole and cut to `--top`,
 *               because the walk takes a season's most popular 100 and the tail of a season is a
 *               different population.
 *   cases       `tests/corpus/cases/*.json`, the hand-decided `together` sets. These are claims about
 *               what a cluster SHOULD hold, decided by a person from real payloads and never by
 *               running a store, so they are a third reading of the same quantity and not a sample of
 *               any walk.
 *
 * Quartiles are NEAREST RANK (the value at 1-based rank `ceil(p * n)`), and the median is the gate's
 * own, which averages the two middle values on an even count.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OFFLINE = 'offline'

/** The catalogue origins the record names, `offline` among them, kept for the manifest reading below. */
export const CATALOGUE_ORIGINS = ['mal', 'anilist', 'kitsu', 'anizip', 'offline', 'simkl']

/**
 * The median `checkSeedCounts` takes, to the digit: the two middle values are averaged on an even
 * count, and an empty list is 0 rather than NaN.
 */
export const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The value at 1-based rank `ceil(p * n)`, which is a value the sample actually held rather than an interpolation. */
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : 0

/**
 * The distribution of one list of identity counts: n, median, quartiles, and one bucket per count
 * carrying the runs at it and their share of the sample.
 *
 * `buckets` is sorted by count ascending and holds every count present, never a count that is absent,
 * so a gap in the middle of a distribution stays visible as a gap.
 */
export const summarise = (name, counts) => {
  const sorted = [...counts].sort((a, b) => a - b)
  const at = new Map()
  for (const count of sorted) at.set(count, (at.get(count) ?? 0) + 1)
  return {
    name,
    n: sorted.length,
    min: sorted.length ? sorted[0] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    q1: percentile(sorted, 0.25),
    median: median(sorted),
    q3: percentile(sorted, 0.75),
    buckets: [...at.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([count, runs]) => ({ count, runs, share: sorted.length ? runs / sorted.length : 0 })),
  }
}

const pad = (value, width) => String(value).padEnd(width)
const padStart = (value, width) => String(value).padStart(width)

/** The summary table, one block per source: the five-number line, then one line per identity count. */
export const formatTable = (summaries) => {
  const lines = []
  const width = Math.max(...summaries.map(summary => summary.name.length), 'source'.length)
  lines.push(`${pad('source', width)}  ${padStart('n', 5)}  ${padStart('min', 4)}  ${padStart('q1', 4)}  ${padStart('median', 7)}  ${padStart('q3', 4)}  ${padStart('max', 4)}`)
  lines.push('-'.repeat(width + 40))
  for (const summary of summaries) {
    lines.push(`${pad(summary.name, width)}  ${padStart(summary.n, 5)}  ${padStart(summary.min, 4)}  ${padStart(summary.q1, 4)}  ${padStart(summary.median, 7)}  ${padStart(summary.q3, 4)}  ${padStart(summary.max, 4)}`)
  }
  for (const summary of summaries) {
    lines.push('')
    lines.push(`${summary.name} (n = ${summary.n})`)
    for (const bucket of summary.buckets) {
      const bar = '#'.repeat(Math.round(bucket.share * 50))
      lines.push(`  identity ${padStart(bucket.count, 2)}  ${padStart(bucket.runs, 5)}  ${padStart((bucket.share * 100).toFixed(1), 5)}%  ${bar}`)
    }
  }
  return lines.join('\n')
}

/* --------------------------------------------------------------------------------------------- */
/* the seed export                                                                                 */
/* --------------------------------------------------------------------------------------------- */

/**
 * Identity counts from a store export, through `buildSeed` itself.
 *
 * Returns the builder's own `medianIdentity` alongside, which is the control: the recorded manifest
 * of the walk carries the same number, so a table that disagrees with it is not reading the seed.
 */
const readSeedExport = async (file) => {
  const { buildSeed } = await import('../src/sources/offline/seed-build.ts')
  const snapshots = readFileSync(file, 'utf-8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
  const { index, report } = buildSeed(snapshots, {
    generatedAt: new Date(0).toISOString(),
    commit: '0000000',
    appVersion: '0.0.0',
    walkedOrigin: 'http://localhost',
    seasonByUri: {},
  })
  return { counts: index.runs.map(run => run.identity.length), reported: report.medianIdentity, snapshots: snapshots.length }
}

/* --------------------------------------------------------------------------------------------- */
/* the season corpus                                                                               */
/* --------------------------------------------------------------------------------------------- */

const readLines = async (file, onLine) => {
  const reader = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of reader) if (line.trim()) onLine(line)
}

/**
 * Every run's identity, rebuilt from the recorded answers by unioning the SAME_AS claims the media
 * rows carry, with `offline` and every CONTAINER-scoped row left out of the graph.
 *
 * PART_OF is a container edge and never unions, which is the same split `buildSeed` makes between a
 * run's `identity` and its `containers`. A manifest run is located in the graph through its own
 * members, so a run whose enumerated uri moved between the listing and the walk is still found.
 */
const readCorpus = async (dir) => {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'))
  const parent = new Map()
  const find = (uri) => {
    let root = uri
    for (;;) {
      const next = parent.get(root)
      if (next === undefined || next === root) return root
      root = next
    }
  }
  const add = (uri) => { if (!parent.has(uri)) parent.set(uri, uri) }
  const nodes = new Set()
  const edges = []

  await readLines(join(dir, 'answers.jsonl'), (line) => {
    const answer = JSON.parse(line)
    if (answer.kind !== 'media') return
    let raw
    try { raw = JSON.parse(answer.raw) } catch { return }
    if (raw.origin === OFFLINE || raw.scope === 'CONTAINER') return
    add(raw.uri)
    nodes.add(raw.uri)
    for (const handle of raw.handles ?? []) {
      const node = handle?.node
      if (!node || handle.relation !== 'SAME_AS' || node.scope === 'CONTAINER' || node.origin === OFFLINE) continue
      add(node.uri)
      nodes.add(node.uri)
      edges.push([raw.uri, node.uri])
    }
  })

  for (const [a, b] of edges) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  const groups = new Map()
  for (const uri of nodes) {
    const root = find(uri)
    if (!groups.has(root)) groups.set(root, new Set())
    groups.get(root).add(uri)
  }

  const counts = []
  const shared = new Map()
  let unlocated = 0
  for (const run of manifest.runs ?? []) {
    const members = (run.members ?? [run.uri]).filter(uri => !uri.startsWith(`${OFFLINE}:`))
    const root = members.map(uri => parent.has(uri) ? find(uri) : null).find(Boolean)
    if (!root) {
      unlocated += 1
      counts.push(0)
      continue
    }
    counts.push(groups.get(root).size)
    shared.set(root, (shared.get(root) ?? 0) + 1)
  }

  const catalogue = (manifest.runs ?? []).map(run => (run.answerOrigins ?? []).filter(origin => CATALOGUE_ORIGINS.includes(origin)).length)
  return {
    counts,
    catalogue,
    unlocated,
    season: manifest.season,
    walkedAt: manifest.endedAt ?? manifest.startedAt,
    welded: [...shared.values()].filter(runs => runs > 1).length,
  }
}

/* --------------------------------------------------------------------------------------------- */
/* the hand-decided cases                                                                          */
/* --------------------------------------------------------------------------------------------- */

/** Every `together` group's size, `offline` members dropped so the three sources count one thing. */
const readCases = (dir) => {
  const counts = []
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    const test = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
    for (const group of test.expect?.together ?? []) {
      counts.push(group.filter(uri => !uri.startsWith(`${OFFLINE}:`)).length)
    }
  }
  return counts
}

/* --------------------------------------------------------------------------------------------- */
/* main                                                                                            */
/* --------------------------------------------------------------------------------------------- */

const flag = (argv, name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1]
}

/** The freshest season directory under `corpus/season`, or undefined when nothing has been walked. */
const freshestSeason = () => {
  const root = resolve(ROOT, 'corpus/season')
  if (!existsSync(root)) return undefined
  const dirs = readdirSync(root)
    .map(name => join(root, name))
    .filter(path => statSync(path).isDirectory() && existsSync(join(path, 'manifest.json')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return dirs[0]
}

const main = async (argv) => {
  const seedFile = resolve(ROOT, String(flag(argv, 'seed', 'dist-seed/snapshots.jsonl')))
  const corpusDir = flag(argv, 'corpus', undefined) ? resolve(ROOT, String(flag(argv, 'corpus'))) : freshestSeason()
  const casesDir = resolve(ROOT, 'tests/corpus/cases')
  const top = Math.max(1, Number(flag(argv, 'top', 100)))
  const summaries = []
  const notes = []

  if (existsSync(seedFile)) {
    const seed = await readSeedExport(seedFile)
    summaries.push(summarise(`seed export, ${seed.snapshots} runs`, seed.counts))
    const computed = median(seed.counts)
    notes.push(`seed export: buildSeed reports medianIdentity ${seed.reported}, this table computes ${computed}${computed === seed.reported ? '' : ', WHICH DISAGREE'}`)
  } else {
    notes.push(`seed export: ${seedFile} is absent, so the walked source was not measured`)
  }

  if (corpusDir && existsSync(join(corpusDir, 'manifest.json'))) {
    const corpus = await readCorpus(corpusDir)
    summaries.push(summarise(`corpus ${corpus.season}, all ${corpus.counts.length}`, corpus.counts))
    summaries.push(summarise(`corpus ${corpus.season}, top ${top}`, corpus.counts.slice(0, top)))
    summaries.push(summarise(`corpus ${corpus.season}, answer origins`, corpus.catalogue))
    notes.push(`corpus: ${corpusDir}, walked to ${corpus.walkedAt}`)
    notes.push(`corpus answer origins: the manifest's own count of ${CATALOGUE_ORIGINS.join('/')} rows landing on a run's PAGE, which is a page-level reading and not a run's identity`)
    if (corpus.unlocated) notes.push(`corpus: ${corpus.unlocated} run(s) had no member in the recorded answers and were counted 0`)
    if (corpus.welded) notes.push(`corpus: ${corpus.welded} cluster(s) hold more than one enumerated run, so those runs share an identity`)
    notes.push('corpus: the manifest is in the enumeration\'s popularity order, so the top rows are the population a --top walk takes')
  } else {
    notes.push('corpus: no season directory with a manifest was found under corpus/season')
  }

  if (existsSync(casesDir)) summaries.push(summarise('cases, together sets', readCases(casesDir)))

  console.log(formatTable(summaries))
  console.log('')
  for (const note of notes) console.log(note)
  console.log('')
  console.log(`medians: ${summaries.map(summary => `${summary.name} = ${summary.median}`).join(', ')}`)
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) await main(process.argv.slice(2))
