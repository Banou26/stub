/**
 * Corpus for the Kitsu streaming-link measurement in scripts/measure-kitsu-stream-ids.probe.ts.
 *
 * Fetches once into node_modules/.cache and is a no-op afterwards, the same shape as
 * scripts/measure-justwatch-offer-ids.mjs.
 *
 *   node scripts/measure-kitsu-stream-ids.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-kitsu-stream-ids.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * WHAT IT COLLECTS. Every streaming link kitsu publishes for a title, as a bare url, next to the
 * `subtype` and `startDate` the extractor reads. That is exactly the input `streamHandles` sees, so
 * the probe can drive the REAL `streamPointers` over it and ask whether two DIFFERENT kitsu ids come
 * back holding one provider id. That is a weld, and `graph.link` cannot undo one.
 *
 * It pages MOVIES and TV separately, because the question is about movies and they are a small
 * minority of the catalogue: a popularity-sorted sweep of anime in general returns almost none, and a
 * corpus that cannot reach the branch under test cannot measure it.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/kitsu-stream-pool.json', import.meta.url).pathname

if (existsSync(OUT)) {
  console.log(`already have ${OUT}`)
  process.exit(0)
}

const API = 'https://kitsu.io/api/edge'
const PAGES = 30
const LIMIT = 20

const page = async (subtype, offset) => {
  const url =
    `${API}/anime?filter%5Bsubtype%5D=${subtype}&page%5Blimit%5D=${LIMIT}&page%5Boffset%5D=${offset}` +
    `&sort=-userCount&include=streamingLinks`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } })
    if (res.ok) return res.json()
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
  }
  throw new Error(`kitsu refused ${subtype} offset ${offset}`)
}

const records = []
for (const subtype of ['movie', 'TV', 'ONA', 'OVA', 'special']) {
  for (let i = 0; i < PAGES; i++) {
    const body = await page(subtype, i * LIMIT)
    const data = body?.data ?? []
    if (!data.length) break
    const links = new Map(
      (body.included ?? [])
        .filter(inc => inc.type === 'streamingLinks')
        .map(inc => [inc.id, inc.attributes?.url])
    )
    for (const resource of data) {
      const attr = resource.attributes ?? {}
      records.push({
        id: resource.id,
        title: attr.canonicalTitle ?? null,
        subtype: attr.subtype ?? null,
        startDate: attr.startDate ?? null,
        episodeCount: attr.episodeCount ?? null,
        streams: (resource.relationships?.streamingLinks?.data ?? [])
          .map(ref => links.get(ref.id))
          .filter(Boolean)
      })
    }
    process.stdout.write(`\r${subtype} ${records.length} titles`)
    await new Promise(r => setTimeout(r, 120))
  }
  process.stdout.write('\n')
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ records }, null, 2))
const withStreams = records.filter(r => r.streams.length).length
console.log(`wrote ${records.length} titles (${withStreams} with a streaming link) to ${OUT}`)
