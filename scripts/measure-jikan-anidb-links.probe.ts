/**
 * Whether MyAnimeList's AniDB link yields an id that identifies ONE title, driven through the repo's
 * own `anidbIdFromUrl` rather than a copy of it.
 *
 *   node scripts/measure-jikan-anidb-links.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-jikan-anidb-links.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no measurement.
 *
 * THE METRIC. `normalizeMedia` mints `anidb:<id>` and `anizip:<id>`, and `upsertMedia` links both,
 * which is a union-find union with NO inverse. So if two DIFFERENT MyAnimeList records yield the same
 * id, their clusters merge permanently for the session. That count is the whole measurement.
 *
 * TWO ARMS. `was` is what shipped: `searchParams.get('aid') ?? pathname.split('/')[2]`, an unguarded
 * positional fallback, with the anizip handle gated on the LINK rather than on the id. `now` reads the
 * path only when it is shaped `/anime/<n>`, requires the id to be numeric, and gates both handles on
 * it.
 *
 * WHAT THE PROBE IS ALLOWED TO CONCLUDE. If `was` welds here, the fix is a repair and the number says
 * how much. If it does not, the fix is a GUARD: the landmine is real and reachable (the fallback
 * returns the literal `animedb.pl` for the url shape MyAnimeList publishes most) but this sample did
 * not step on it, and the honest report says so rather than claiming a win. The assertions below are
 * written to hold either way, and the printed table is what carries the answer.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { anidbIdFromUrl } from '../src/sources/jikan/extractor'

type Record = {
  malId: number
  title: string | null
  type: string | null
  external: { name: string, url: string }[]
}

const POOL = new URL('../node_modules/.cache/jikan-anidb-pool.json', import.meta.url).pathname
const { records } = JSON.parse(readFileSync(POOL, 'utf8')) as { records: Record[] }

const anidbUrl = (record: Record) => record.external.find(site => site.name === 'AniDB')?.url

/** The read exactly as it shipped, kept verbatim as the control arm. */
const wasAnidbId = (url: string | undefined): string | undefined => {
  if (url === undefined) return undefined
  const { searchParams, pathname } = new URL(url)
  return searchParams.get('aid') ?? pathname.split('/')[2]
}

/** What each arm mints: `was` gates anizip on the LINK, `now` gates both on the ID. */
const wasHandles = (record: Record) => {
  const url = anidbUrl(record)
  if (url === undefined) return []
  const id = wasAnidbId(url)
  return [...id ? [`anidb:${id}`] : [], `anizip:${id}`]
}
const nowHandles = (record: Record) => {
  const id = anidbIdFromUrl(anidbUrl(record))
  return id ? [`anidb:${id}`, `anizip:${id}`] : []
}

const score = (mint: (record: Record) => string[]) => {
  const held = new Map<string, Set<number>>()
  let handles = 0
  for (const record of records) {
    for (const uri of mint(record)) {
      handles++
      if (!held.has(uri)) held.set(uri, new Set())
      held.get(uri)!.add(record.malId)
    }
  }
  return { handles, welds: [...held.entries()].filter(([, ids]) => ids.size > 1), ids: held.size }
}

const was = score(wasHandles)
const now = score(nowHandles)

test('the corpus reaches records that carry an AniDB link at all', () => {
  const withLink = records.filter(record => anidbUrl(record))
  const shapes = new Map<string, number>()
  for (const record of withLink) {
    const url = anidbUrl(record)!
    const shape =
      /[?&]aid=\d/.test(url) ? '?aid=<n>'
      : /\/anime\/\d/.test(url) ? '/anime/<n>'
      : url.slice(0, 60)
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
  }
  console.log(`\ncorpus: ${records.length} MyAnimeList records, ${withLink.length} carrying an AniDB link`)
  console.log('link shapes:')
  for (const [shape, count] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${count.toString().padStart(5)}  ${shape}`)

  expect(withLink.length, 'control: records with an AniDB link').toBeGreaterThan(20)
})

test('the shipped read never mints an id the new one refuses to, except a bad one', () => {
  console.log(`\n  was  ${was.handles.toString().padStart(5)} handles over ${was.ids} ids, ${was.welds.length} welded`)
  console.log(`  now  ${now.handles.toString().padStart(5)} handles over ${now.ids} ids, ${now.welds.length} welded`)

  const bad = records.filter(record => {
    const url = anidbUrl(record)
    if (url === undefined) return false
    const before = wasAnidbId(url)
    return before !== undefined && anidbIdFromUrl(url) === undefined
  })
  console.log(`\n${bad.length} records where the shipped read produced something and the new one refuses:`)
  for (const record of bad.slice(0, 10)) {
    console.log(`  mal:${record.malId} ${record.title} -> ${anidbUrl(record)} yielded "${wasAnidbId(anidbUrl(record))}"`)
  }
  if (was.welds.length) {
    console.log('\nwhat the shipped read welded:')
    for (const [uri, ids] of was.welds) console.log(`  ${uri} (${ids.size}) <- mal:${[...ids].slice(0, 6).join(', mal:')}`)
  }

  // The one claim that holds whatever the sample contains: the new read never LOSES a good id. Every
  // record the old read gave a usable id, the new one gives the same id.
  const lostGood = records.filter(record => {
    const before = anidbUrl(record) === undefined ? undefined : wasAnidbId(anidbUrl(record)!)
    return before !== undefined && /^\d+$/.test(before) && anidbIdFromUrl(anidbUrl(record)) !== before
  })
  expect(lostGood.map(record => `mal:${record.malId} ${anidbUrl(record)}`)).toEqual([])

  // and it never welds
  expect(now.welds.map(([uri, ids]) => `${uri} <- ${[...ids].join(' + ')}`)).toEqual([])
  expect(now.handles, 'and it is not a blanket refusal wearing a different name').toBeGreaterThan(20)
})

// The landmine, independent of whether this sample stepped on it. `pathname.split('/')[2]` on the url
// shape MyAnimeList publishes most is the literal string `animedb.pl`, which is the same string for
// every record that produces it. This is the assertion that survives the corpus changing.
test('the shipped read turns the common url shape into one shared string when aid is missing', () => {
  const withoutAid = 'https://anidb.net/perl-bin/animedb.pl?show=anime'
  expect(wasAnidbId(withoutAid)).toBe('animedb.pl')
  expect(anidbIdFromUrl(withoutAid)).toBeUndefined()
  console.log(`\nthe landmine: ${withoutAid}\n  shipped read -> "${wasAnidbId(withoutAid)}"   new read -> ${anidbIdFromUrl(withoutAid)}`)
})
