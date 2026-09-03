/**
 * Corpus for the AniDB link measurement in scripts/measure-jikan-anidb-links.probe.ts.
 *
 *   node scripts/measure-jikan-anidb-links.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-jikan-anidb-links.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * WHAT IT COLLECTS. The `external` array off /anime/<id>/full, which is the ONLY jikan endpoint that
 * carries one: search and seasons return `SearchAnimeData`, which omits the field, so `normalizeMedia`
 * sees no AniDB source there at all and the question is only about the media path.
 *
 * The id list is deliberately spread rather than popularity sorted. The failure needs an AniDB url
 * that is neither `?aid=<n>` nor `/anime/<n>`, and a well known title is exactly the one whose
 * external links someone has already tidied, so a top-100 sweep is the sample least likely to contain
 * the case under test.
 *
 * IT CHECKPOINTS, AND IT RESUMES. The first version held everything in memory and wrote once at the
 * end, which is fine until the upstream is having a bad day: on 2026-09-04 jikan answered 504 to most
 * cold ids while serving cached ones, so a 45 minute run was killed having written nothing and having
 * shown nothing. Re-running now skips every id already on disk, so an outage costs the ids it ate and
 * nothing else. It also RECORDS the failures, because a corpus that quietly contains only the ids a
 * degraded api felt like serving is a biased sample that looks like a complete one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/jikan-anidb-pool.json', import.meta.url).pathname
const PARTIAL = `${OUT}.partial`

// a spread over the whole MAL id range, not the popular end of it
const IDS = []
for (let id = 1; id <= 60000; id += 199) IDS.push(id)

const load = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { records: [], missing: [], failed: [] }
const state = existsSync(OUT) ? load(OUT) : load(PARTIAL)
const done = new Set([...state.records.map(r => r.malId), ...state.missing, ...state.failed])

if (existsSync(OUT) && !state.failed.length) {
  console.log(`already have ${OUT} (${state.records.length} records)`)
  process.exit(0)
}
// a resumed run retries only what failed last time
state.failed = state.failed.filter(id => !done.has(id) || true)
const retry = new Set(state.failed)
state.failed = []
for (const id of retry) done.delete(id)

const full = async id => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
      if (res.status === 404) return { gone: true }
      if (res.ok) return { body: await res.json() }
    } catch {}
    await new Promise(r => setTimeout(r, 800))
  }
  return { failed: true }
}

const save = () => {
  mkdirSync(dirname(PARTIAL), { recursive: true })
  writeFileSync(PARTIAL, JSON.stringify(state, null, 2))
}

let n = 0
for (const id of IDS) {
  if (done.has(id)) continue
  const { body, gone, failed } = await full(id)
  const data = body?.data
  if (data) {
    state.records.push({
      malId: data.mal_id,
      title: data.title ?? null,
      type: data.type ?? null,
      external: (data.external ?? []).map(({ name, url }) => ({ name, url })),
    })
  } else if (gone) state.missing.push(id)
  else if (failed) state.failed.push(id)

  if (++n % 20 === 0) {
    save()
    process.stdout.write(`\r${state.records.length} records, ${state.missing.length} absent, ${state.failed.length} upstream failures`)
  }
  await new Promise(r => setTimeout(r, 1100))
}

save()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(state, null, 2))
const withAniDB = state.records.filter(r => r.external.some(e => e.name === 'AniDB')).length
console.log(
  `\nwrote ${state.records.length} records (${withAniDB} carrying an AniDB link) to ${OUT}` +
  `\n${state.missing.length} ids do not exist, ${state.failed.length} were refused by the api and are NOT in the sample`
)
