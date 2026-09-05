// The seed is one more source's rows, published to every user with no inverse, so the two things
// pinned hardest here are that a live row beats it in BOTH arrival orders and that every failure of
// the fetch leaves the bundled half answering exactly what it answers today.
//
// Rows are driven through the real store the way worker/extractor.ts drives them, through
// `recursivelyUnwrapMediaHandles` and `normalizeToStoreMedia`, never by hand-writing store rows.
import type { AddressInfo } from 'node:net'

import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Episode as GQLEpisode, Media as GQLMedia } from '../../../../src/generated/schema/types.generated'
import type { Episode as StoreEpisode } from '../../../../src/worker/store/types'
import type { SeedEpisode, SeedEpisodes, SeedHandle, SeedIndex, SeedRun } from '../../../../src/sources/offline/seed'

import { animeSeasonOf } from '../../../../src/sources/season'
import { makeMedia, sameAs } from '../../../../src/sources/utils'
import { originsOfUri } from '../../../../src/utils/uri'
import { aggregateEpisode, aggregateMedia, recursivelyUnwrapMediaHandles } from '../../../../src/worker/store/aggregate'
import {
  findAggregatedEpisodesForMedia, findAggregatedMedia, findPartOfMedia, resetStore, upsertEpisodes, upsertMedia,
} from '../../../../src/worker/store/db'
import { normalizeToStoreMedia } from '../../../../src/worker/store/normalize'
import { SEED_EPISODES_ASSET, SEED_INDEX_ASSET, seedAssetUrl } from '../../../../src/sources/offline/seed'
import { checkSeedEpisodesSchema, checkSeedSchema } from '../../../../src/sources/offline/seed-gate'
import { SCORE, seasonKey, seasonPage } from '../../../../src/sources/offline/normalize'
import { resolvers } from '../../../../src/sources/offline/extractor'
import {
  loadSeedEpisodes, loadSeedIndex, resetSeedCache, seedMedia, seedRunFor, seedSeasonPage,
} from '../../../../src/sources/offline/seed-source'

const CURRENT_SEASON = seasonKey(animeSeasonOf())
const COMMIT = 'a1b2c3d'
const GENERATED_AT = '2026-09-05T04:17:00.000Z'

// ids far outside every catalogue, so the bundled half of the source knows nothing about them and a
// yield carrying one can only have come from the seed
const RUN_KEY = 'mal-99999901'
const MAL_URI = 'mal:99999901'
const ANILIST_URI = 'anilist:99999902'

const handle = (uri: string, scope: 'RUN' | 'CONTAINER' = 'RUN'): SeedHandle => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  scope,
})

const seedRun = (overrides: Partial<SeedRun> = {}): SeedRun => ({
  key: RUN_KEY,
  season: CURRENT_SEASON,
  identity: [handle(ANILIST_URI), handle(MAL_URI)],
  containers: [],
  titles: [{ language: 'en', title: 'Seeded title' }],
  covers: [{ url: 'https://example.test/cover.jpg', language: null }],
  banners: [],
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  episodeCount: 12,
  averageScore: 60,
  isAdult: false,
  ...overrides,
})

const seedIndex = (runs: SeedRun[] = [seedRun()]): SeedIndex => ({
  version: 1,
  generatedAt: GENERATED_AT,
  commit: COMMIT,
  appVersion: '0.0.17',
  walkedOrigin: 'http://localhost:4599',
  seasons: { [CURRENT_SEASON]: runs.filter(run => run.season === CURRENT_SEASON).map(run => run.key) },
  runs,
})

const seedEpisode = (number: number, overrides: Partial<SeedEpisode> = {}): SeedEpisode => ({
  number,
  titles: [{ language: 'en', title: `Seeded episode ${number}` }],
  thumbnails: [{ url: `https://example.test/thumb-${number}.jpg`, language: null }],
  urls: [{ origin: 'cr', url: `https://example.test/watch-${number}` }],
  releaseDate: '2026-07-04',
  seasonNumber: 1,
  absoluteEpisodeNumber: number,
  runtime: 24,
  ...overrides,
})

const seedEpisodes = (episodes: Record<string, SeedEpisode[]> = { [RUN_KEY]: [seedEpisode(1)] }): SeedEpisodes => ({
  version: 1,
  generatedAt: GENERATED_AT,
  commit: COMMIT,
  episodes,
})

const gzipped = (value: unknown) => new Response(gzipSync(Buffer.from(JSON.stringify(value))), { status: 200 })

/** Answers each asset from a table, and counts the calls so "once per session" is observable. */
const stubFetch = (bodies: Record<string, () => Response | Promise<Response>>) => {
  const calls: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const body = bodies[url]
    if (!body) throw new Error(`nothing stubbed for ${url}`)
    return body()
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const indexUrl = seedAssetUrl(SEED_INDEX_ASSET)
const episodesUrl = seedAssetUrl(SEED_EPISODES_ASSET)

const storeEpisode = (episode: GQLEpisode): StoreEpisode => ({
  uri: episode.uri,
  origin: episode.origin,
  id: episode.id,
  url: episode.url ?? null,
  embedUrl: episode.embedUrl ?? null,
  mediaUri: episode.mediaUri,
  score: episode.score ?? null,
  titles: episode.titles ?? [],
  descriptions: [],
  shortDescriptions: [],
  thumbnails: episode.thumbnails ?? [],
  releaseDate: episode.releaseDate ?? null,
  seasonNumber: episode.seasonNumber ?? null,
  episodeNumber: episode.episodeNumber ?? null,
  absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
  runtime: episode.runtime ?? null,
}) as StoreEpisode

const insert = async (...medias: GQLMedia[]) => {
  const rows = medias.flatMap(recursivelyUnwrapMediaHandles)
  const pairs = rows.flatMap(row => (row.handles ?? []).map(handleNode => ({
    mediaUri: row.uri, handleUri: handleNode.node.uri, relation: handleNode.relation,
  })))
  await upsertMedia(rows.map(normalizeToStoreMedia), pairs)
  const episodes = medias.flatMap(media => media.episodes ?? [])
  if (episodes.length) await upsertEpisodes(episodes.map(storeEpisode), [])
}

/** A live row: real titles, a real score, everything the seed deliberately does not carry. */
const liveMedia = (uri: string, fields: Partial<GQLMedia> = {}) =>
  makeMedia({
    origin: uri.slice(0, uri.indexOf(':')),
    id: uri.slice(uri.indexOf(':') + 1),
    url: `https://live.test/${uri}`,
    score: 0.9,
    titles: [{ language: 'en', title: 'Live title', score: 0.9 }],
    status: 'FINISHED',
    popularity: 999,
    episodeCount: 24,
    ...fields,
  })

// what the media resolver does with a cluster's episodes, which cannot be imported here: it reaches
// worker/extractor.ts and, through urql, a CommonJS require('react')
const episodesByNumber = async (uris: string[]) => {
  const groups = (await findAggregatedEpisodesForMedia(uris)).flat().filter(episode => episode.episodeNumber != null)
  const byNumber = new Map<number, typeof groups>()
  for (const episode of groups) {
    const list = byNumber.get(episode.episodeNumber!) ?? []
    list.push(episode)
    byNumber.set(episode.episodeNumber!, list)
  }
  return [...byNumber.values()].map(group => aggregateEpisode(group, 'https://stub.test'))
}

type Subscribe = (parent: unknown, args: { input: Record<string, unknown> }, ctx: unknown) => AsyncGenerator<unknown>
const subscribeTo = (field: 'media' | 'mediaPage'): Subscribe =>
  ((resolvers.Subscription as Record<string, { subscribe: Subscribe }>)[field]!).subscribe

const drain = async (iterator: AsyncGenerator<unknown>) => {
  const yielded: unknown[] = []
  for await (const value of iterator) yielded.push(value)
  return yielded
}

const bundledSeason = async () => {
  const bundle = (await import('../../../../src/generated/anime-seasons')).default as {
    seasons: Record<string, Parameters<typeof seasonPage>[0]>
  }
  return seasonPage(bundle.seasons[CURRENT_SEASON] ?? [])
}

// `makeMedia` mints a random `_id` per call, so two runs of the same bundle are never deeply equal
const urisOf = (nodes: readonly GQLMedia[]) => nodes.map(node => node.uri)

beforeEach(() => {
  resetStore()
  resetSeedCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The control: every refusal below is a claim about the gate, so the fixture has to be the thing the
// gate calls valid before any mutation of it means anything.
test('the fixtures are what the gate calls a valid index and a valid episodes file', () => {
  const index = seedIndex()
  expect(checkSeedSchema(index)).toEqual([])
  expect(checkSeedEpisodesSchema(seedEpisodes(), index)).toEqual([])
})

test('the index is read once per session, from the release download url', async () => {
  const { fetch, calls } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()) })
  const first = await loadSeedIndex(fetch)
  const second = await loadSeedIndex(fetch)
  const third = await loadSeedIndex(fetch)

  expect(calls).toEqual([indexUrl])
  expect(first?.runs[0]?.key).toBe(RUN_KEY)
  expect(second).toBe(first)
  expect(third).toBe(first)
})

test('a body that arrived already decompressed still parses', async () => {
  const { fetch } = stubFetch({ [indexUrl]: () => new Response(JSON.stringify(seedIndex()), { status: 200 }) })
  expect((await loadSeedIndex(fetch))?.runs[0]?.key).toBe(RUN_KEY)
})

const failures: [string, () => Response | Promise<Response>][] = [
  ['the fetch rejects', () => Promise.reject(new Error('the relay refused'))],
  ['the asset is not published yet', () => new Response('Not Found', { status: 404 })],
  ['the body is neither gzip nor json', () => new Response(new TextEncoder().encode('<html>nope</html>'), { status: 200 })],
  ['the payload is not a seed index', () => gzipped({ version: 2, runs: 'no' })],
]

for (const [what, body] of failures) {
  test(`${what}: the index is undefined and the bundled season still answers`, async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetch } = stubFetch({ [indexUrl]: body })
    expect(await loadSeedIndex(fetch)).toBeUndefined()

    resetSeedCache()
    const bundled = await bundledSeason()
    expect(bundled.length, `control: the bundle has to answer for ${CURRENT_SEASON} for this to prove anything`).toBeGreaterThan(0)
    const yielded = await drain(subscribeTo('mediaPage')(undefined, { input: { status: 'RELEASING' } }, { fetch })) as { mediaPage: { nodes: GQLMedia[] } }[]
    expect(yielded).toHaveLength(1)
    expect(urisOf(yielded[0]!.mediaPage.nodes)).toEqual(urisOf(bundled))
  })
}

// The status is read before the body, so an error page that happens to parse is still not data. A
// plain 404 is covered above; this is the case that makes the check observable at all.
test('a non-200 is refused even when its body would have parsed', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { fetch } = stubFetch({
    [indexUrl]: () => new Response(gzipSync(Buffer.from(JSON.stringify(seedIndex()))), { status: 404 }),
  })
  expect(await loadSeedIndex(fetch)).toBeUndefined()
})

test('a fetch that never answers is dropped at the budget, and the index is undefined', async () => {
  vi.useFakeTimers()
  const { fetch } = stubFetch({ [indexUrl]: () => new Promise<Response>(() => {}) })
  const pending = loadSeedIndex(fetch)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await pending).toBeUndefined()
})

test('an episodes file that does not belong to this index is refused, and the index still answers', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const stranger = { ...seedEpisodes(), commit: 'f00dfeed' }
  const { fetch } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()), [episodesUrl]: () => gzipped(stranger) })

  const index = await loadSeedIndex(fetch)
  expect(index?.runs).toHaveLength(1)
  expect(await loadSeedEpisodes(fetch, index!)).toBeUndefined()
})

test('the episodes file is read once per session too', async () => {
  const { fetch, calls } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()), [episodesUrl]: () => gzipped(seedEpisodes()) })
  const index = (await loadSeedIndex(fetch))!
  const first = await loadSeedEpisodes(fetch, index)
  const second = await loadSeedEpisodes(fetch, index)

  expect(calls).toEqual([indexUrl, episodesUrl])
  expect(first?.episodes[RUN_KEY]).toHaveLength(1)
  expect(second).toBe(first)
})

// Every other case here builds its Response locally. This one goes over a real socket, served the way
// a release asset is served: application/octet-stream, no content-encoding, so nothing decompresses
// on the way in and the explicit DecompressionStream is what has to do it.
test('a real gzip body over http, served the way the release serves it, parses', async () => {
  const bytes = gzipSync(Buffer.from(JSON.stringify(seedIndex())))
  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(bytes)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  try {
    const index = await loadSeedIndex((async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(indexUrl)
      return globalThis.fetch(`http://127.0.0.1:${port}/${SEED_INDEX_ASSET}`)
    }) as typeof globalThis.fetch)
    expect(index?.runs[0]?.key).toBe(RUN_KEY)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('a seed row unions with a live row and the live row wins the merge, in both arrival orders', async () => {
  const orders: [string, GQLMedia[]][] = [
    ['seed first', [seedMedia(seedRun()), liveMedia(ANILIST_URI)]],
    ['live first', [liveMedia(ANILIST_URI), seedMedia(seedRun())]],
  ]

  for (const [order, rows] of orders) {
    resetStore()
    for (const row of rows) await insert(row)

    const cluster = await findAggregatedMedia(ANILIST_URI)
    expect(cluster.map(media => media.uri).sort(), order).toEqual([ANILIST_URI, `offline:${RUN_KEY}`])

    const media = aggregateMedia(cluster, 'https://stub.test')
    expect(media.titles[0]?.title, order).toBe('Live title')
    expect(media.score, order).toBe(0.9)
    expect(media.status, order).toBe('FINISHED')
    expect(media.popularity, order).toBe(999)
    expect(media.episodeCount, order).toBe(24)
    // and the seed still supplies what nobody else has, which is the whole point of the low score
    expect(media.covers.map(cover => cover.url), order).toEqual(['https://example.test/cover.jpg'])
  }
})

// `aggregateMedia` sorts by score with a stable sort, so at an equal score the row that arrived first
// wins every `??` field, and justwatch, appletv, paramount and unogs all score exactly the offline
// SCORE. The seed exists to arrive first, so the only safe answer is to carry none of these fields.
test('a live source scoring the same 0.2 keeps its status, date and popularity against the seed', async () => {
  for (const order of ['seed first', 'live first']) {
    resetStore()
    const tied = liveMedia(ANILIST_URI, {
      score: SCORE,
      titles: [{ language: 'en', title: 'Tied title', score: SCORE }],
      status: 'RELEASING',
      startDate: '2026-07-04',
      popularity: 42,
    })
    const rows = order === 'seed first' ? [seedMedia(seedRun()), tied] : [tied, seedMedia(seedRun())]
    for (const row of rows) await insert(row)

    const media = aggregateMedia(await findAggregatedMedia(ANILIST_URI), 'https://stub.test')
    expect(media.status, order).toBe('RELEASING')
    expect(media.startDate, order).toBe('2026-07-04')
    expect(media.popularity, order).toBe(42)
  }
})

// A placeholder is not stored, so the seed writes no row of its own for a member and cannot overwrite
// a live one. It also means a seeded id NO live source knows never enters a cluster, never reaches an
// aggregated uri, and so is never re-asserted by the next source that reads one.
test('a seed handle node is a placeholder: unstored until the owning source describes that uri', async () => {
  await insert(seedMedia(seedRun()))
  expect(await findAggregatedMedia(MAL_URI)).toEqual([])
  expect((await findAggregatedMedia(`offline:${RUN_KEY}`)).map(media => media.uri)).toEqual([`offline:${RUN_KEY}`])

  await insert(liveMedia(MAL_URI))
  const cluster = await findAggregatedMedia(MAL_URI)
  expect(cluster.map(media => media.uri).sort()).toEqual([MAL_URI, `offline:${RUN_KEY}`])
  expect(cluster.find(media => media.uri === MAL_URI)?.url).toBe(`https://live.test/${MAL_URI}`)

  const media = aggregateMedia(cluster, 'https://stub.test')
  expect(originsOfUri(media.uri).sort()).toEqual(['mal', 'offline'])
})

// `partOf` from sources/utils stamps the node CONTAINER, the store keeps CONTAINER for good, and the
// seed would re-assert it on every load, so a wrong one could never be recovered and a live SAME_AS to
// that uri would be demoted to an edge for as long as the seed shipped it.
test('a seeded container stamps no scope, so a live SAME_AS to that uri still unions', async () => {
  await insert(seedMedia(seedRun({ containers: [handle('cr:SERIES', 'CONTAINER')] })))
  expect(await findAggregatedMedia('cr:SERIES'), 'the container claim waits for a row').toEqual([])

  await insert(liveMedia(MAL_URI, { handles: [sameAs(liveMedia('cr:SERIES'))] }))
  const cluster = await findAggregatedMedia(MAL_URI)
  expect(cluster.map(media => media.uri).sort()).toEqual(['cr:SERIES', MAL_URI, `offline:${RUN_KEY}`])
  // and the seed's own PART_OF claim, now pointing into this very cluster, is not rendered as a show
  // this run belongs to
  expect(findPartOfMedia(cluster)).toEqual([])
})

test('a seeded container becomes a PART_OF edge once its owning source calls it a container', async () => {
  await insert(seedMedia(seedRun({ containers: [handle('cr:SERIES', 'CONTAINER')] })))
  await insert(liveMedia(MAL_URI), liveMedia('cr:SERIES', { scope: 'CONTAINER' }))

  const cluster = await findAggregatedMedia(MAL_URI)
  expect(cluster.map(media => media.uri)).not.toContain('cr:SERIES')
  expect(findPartOfMedia(cluster).map(media => [media.uri, media.scope])).toEqual([['cr:SERIES', 'CONTAINER']])
})

test('a seeded episode lands under the run and groups with the live episode of the same number', async () => {
  await insert(seedMedia(seedRun(), [seedEpisode(1), seedEpisode(2)]))

  const seeded = await episodesByNumber([`offline:${RUN_KEY}`])
  expect(seeded.map(episode => [episode.uri, episode.episodeNumber])).toEqual([
    [`offline:${RUN_KEY}-1`, 1],
    [`offline:${RUN_KEY}-2`, 2],
  ])
  expect(seeded[0]?.titles[0]?.title, 'control: the seeded episode answers on its own').toBe('Seeded episode 1')
  expect(seeded[0]?.score).toBe(SCORE)

  const live = liveMedia(ANILIST_URI)
  live.episodes = [{
    ...makeMedia({ origin: 'anilist', id: '99999902' }),
    uri: `${ANILIST_URI}-1`,
    origin: 'anilist',
    id: '99999902-1',
    mediaUri: ANILIST_URI,
    url: 'https://live.test/watch-1',
    score: 0.9,
    episodeNumber: 1,
    titles: [{ language: 'en', title: 'Live episode 1', score: 0.9 }],
    thumbnails: [],
  } as unknown as GQLEpisode]
  await insert(live)

  const merged = await episodesByNumber([`offline:${RUN_KEY}`, MAL_URI, ANILIST_URI])
  const first = merged.find(episode => episode.episodeNumber === 1)
  expect(merged).toHaveLength(2)
  expect(first?.handles.map(node => node.node.uri).sort()).toEqual([`${ANILIST_URI}-1`, `offline:${RUN_KEY}-1`])
  expect(first?.titles[0]?.title).toBe('Live episode 1')
  expect(first?.score).toBe(0.9)
  // and the seeded thumbnail survives, because no live row carries one
  expect(first?.thumbnails.map(thumbnail => thumbnail.url)).toEqual(['https://example.test/thumb-1.jpg'])
})

test('seedRunFor answers by an identity member and by the borrowed offline id, and refuses a stranger', () => {
  const index = seedIndex()
  expect(seedRunFor(index, [{ origin: 'anilist', id: '99999902' }])?.key).toBe(RUN_KEY)
  expect(seedRunFor(index, [{ origin: 'offline', id: RUN_KEY }])?.key).toBe(RUN_KEY)
  expect(seedRunFor(index, [{ origin: 'kitsu', id: '1' }])).toBeUndefined()
})

test('seedSeasonPage answers the bucket for that season, carrying no episodes', () => {
  const other = seedRun({ key: 'mal-99999903', season: null, identity: [handle('mal:99999903')] })
  const index = seedIndex([seedRun(), other])

  const nodes = seedSeasonPage(index, CURRENT_SEASON)
  expect(nodes.map(node => node.uri)).toEqual([`offline:${RUN_KEY}`])
  expect(nodes[0]?.episodes).toEqual([])
  expect(nodes[0]?.titles).toEqual([{ language: 'en', title: 'Seeded title', score: SCORE }])
  expect(seedSeasonPage(index, '2019-WINTER')).toEqual([])
})

test('mediaPage yields the bundled season before the seed is asked for, then the seeded rows', async () => {
  const asked: string[] = []
  const { fetch } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()) })
  const seen: string[] = []

  const iterator = subscribeTo('mediaPage')(undefined, { input: { status: 'RELEASING' } }, {
    fetch: (input: RequestInfo | URL) => {
      asked.push(`${String(input)} after ${seen.length} yields`)
      return fetch(input)
    },
  })

  const yielded: { mediaPage: { nodes: GQLMedia[] } }[] = []
  for await (const value of iterator) {
    yielded.push(value as { mediaPage: { nodes: GQLMedia[] } })
    seen.push('yield')
  }

  const bundled = await bundledSeason()
  expect(bundled.length, `control: the bundle has to answer for ${CURRENT_SEASON} for this to prove anything`).toBeGreaterThan(0)
  expect(urisOf(yielded[0]!.mediaPage.nodes)).toEqual(urisOf(bundled))
  expect(asked).toEqual([`${indexUrl} after 1 yields`])
  expect(yielded[1]?.mediaPage.nodes.map(node => node.uri)).toEqual([`offline:${RUN_KEY}`])
})

test('media yields the bundled answer before the seed is asked for, then the seeded run with its episodes', async () => {
  const asked: string[] = []
  const { fetch } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()), [episodesUrl]: () => gzipped(seedEpisodes()) })
  let yields = 0

  const iterator = subscribeTo('media')(undefined, { input: { uri: ANILIST_URI } }, {
    fetch: (input: RequestInfo | URL) => {
      asked.push(`${String(input)} after ${yields} yields`)
      return fetch(input)
    },
  })

  const yielded: { media: GQLMedia | null }[] = []
  for await (const value of iterator) {
    yielded.push(value as { media: GQLMedia | null })
    yields++
  }

  expect(yielded[0], 'the bundle knows nothing about this id, which is what makes the second yield the seed').toEqual({ media: null })
  expect(asked).toEqual([`${indexUrl} after 1 yields`, `${episodesUrl} after 1 yields`])
  expect(yielded[1]?.media?.uri).toBe(`offline:${RUN_KEY}`)
  expect(yielded[1]?.media?.episodes.map(episode => episode.uri)).toEqual([`offline:${RUN_KEY}-1`])
})

test('media never asks for the episodes file when no seeded run is named', async () => {
  const { fetch, calls } = stubFetch({ [indexUrl]: () => gzipped(seedIndex()) })
  const yielded = await drain(subscribeTo('media')(undefined, { input: { uri: 'kitsu:99999904' } }, { fetch }))

  expect(calls).toEqual([indexUrl])
  expect(yielded).toEqual([{ media: null }])
})
