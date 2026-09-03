/**
 * Corpus for the AniDB link measurement in scripts/measure-jikan-anidb-links.probe.ts.
 *
 * Fetches once into node_modules/.cache and is a no-op afterwards, the same shape as
 * scripts/measure-kitsu-stream-ids.mjs.
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
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/jikan-anidb-pool.json', import.meta.url).pathname

if (existsSync(OUT)) {
  console.log(`already have ${OUT}`)
  process.exit(0)
}

// a spread over the whole MAL id range, not the popular end of it
const IDS = []
for (let id = 1; id <= 60000; id += 79) IDS.push(id)

const full = async id => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    if (res.status === 404) return undefined
    if (res.ok) return res.json()
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }
  return undefined
}

const records = []
for (const id of IDS) {
  const body = await full(id)
  const data = body?.data
  if (data) {
    records.push({
      malId: data.mal_id,
      title: data.title ?? null,
      type: data.type ?? null,
      external: (data.external ?? []).map(({ name, url }) => ({ name, url })),
    })
  }
  if (records.length % 25 === 0) process.stdout.write(`\r${records.length} records`)
  await new Promise(r => setTimeout(r, 1150))
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ records }, null, 2))
const withAniDB = records.filter(r => r.external.some(e => e.name === 'AniDB')).length
console.log(`\nwrote ${records.length} records (${withAniDB} carrying an AniDB link) to ${OUT}`)
