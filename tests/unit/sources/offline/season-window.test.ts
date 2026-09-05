// The bundle answers SIX season buckets, not one, and the key it was found under is the only place
// either half of this source states a row's season. Two things are pinned here: that the key reaches
// every row it built, and that a request for a season this build does not hold answers NOTHING. The
// second is the load-bearing one. The store's filter is strict on season so a substituted bucket
// would be dropped anyway, but it costs an upstream call and leaks on every axis that filter cannot
// see.
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Media as GQLMedia } from '../../../../src/generated/schema/types.generated'
import type { SeedHandle, SeedIndex, SeedRun } from '../../../../src/sources/offline/seed'

import { animeSeasonOf } from '../../../../src/sources/season'
import { SEED_INDEX_ASSET, seedAssetUrl } from '../../../../src/sources/offline/seed'
import { checkSeedSchema } from '../../../../src/sources/offline/seed-gate'
import { parseSeasonKey, seasonKey, seasonMedia, seasonPage, type ManamiRecord } from '../../../../src/sources/offline/normalize'
import { resetSeedCache, seedMedia, seedSeasonPage } from '../../../../src/sources/offline/seed-source'
import { resolvers } from '../../../../src/sources/offline/extractor'

const CURRENT_SEASON = seasonKey(animeSeasonOf())
const indexUrl = seedAssetUrl(SEED_INDEX_ASSET)

const record = (overrides: Partial<ManamiRecord> = {}): ManamiRecord => ({
  t: 'Some Show',
  ty: 'TV',
  p: '1234/56789.jpg',
  ml: 51478,
  ...overrides,
})

const bundle = async () =>
  (await import('../../../../src/generated/anime-seasons')).default as {
    tag: string
    seasons: Record<string, ManamiRecord[]>
  }

/** A bucket the bundle holds that is NOT the clock's, so answering it cannot be the old behaviour. */
const otherHeldSeason = async () => {
  const { seasons } = await bundle()
  const key = Object.keys(seasons).find(candidate => candidate !== CURRENT_SEASON && (seasons[candidate]?.length ?? 0) > 0)
  expect(key, 'control: the bundle has to hold a season besides the clock\'s for this to prove anything').toBeDefined()
  return key!
}

// `makeMedia` mints a random `_id` per call, so two runs over one bucket are never deeply equal
const urisOf = (nodes: readonly GQLMedia[]) => nodes.map(node => node.uri)

type Subscribe = (parent: unknown, args: { input: Record<string, unknown> }, ctx: unknown) => AsyncGenerator<unknown>
const subscribeTo = (field: 'media' | 'mediaPage'): Subscribe =>
  ((resolvers.Subscription as Record<string, { subscribe: Subscribe }>)[field]!).subscribe

type Page = { mediaPage: { nodes: GQLMedia[] } }

/** The seed half is not what these assert, so it is answered with a 404 and stays out of the way. */
const noSeed = { fetch: (async () => new Response('Not Found', { status: 404 })) as unknown as typeof globalThis.fetch }

const pagesFor = async (input: Record<string, unknown>, ctx: unknown = noSeed) => {
  const yielded: Page[] = []
  for await (const value of subscribeTo('mediaPage')(undefined, { input }, ctx)) yielded.push(value as Page)
  return yielded
}

const handle = (uri: string): SeedHandle => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  scope: 'RUN',
})

// an id far outside every catalogue, so the bundled half knows nothing about it and a yield carrying
// it can only have come from the seed
const RUN_KEY = 'mal-99999901'

const seedRun = (overrides: Partial<SeedRun> = {}): SeedRun => ({
  key: RUN_KEY,
  season: CURRENT_SEASON,
  popularity: null,
  identity: [handle('mal:99999901')],
  containers: [],
  titles: [{ language: 'en', title: 'Seeded title' }],
  covers: [],
  banners: [],
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  episodeCount: 12,
  averageScore: 60,
  isAdult: false,
  ...overrides,
})

const seedIndex = (season: string): SeedIndex => ({
  version: 1,
  generatedAt: '2026-09-05T04:17:00.000Z',
  commit: 'a1b2c3d',
  appVersion: '0.0.17',
  walkedOrigin: 'http://localhost:4599',
  seasons: { [season]: [RUN_KEY] },
  runs: [seedRun({ season })],
})

const gzipped = (value: unknown) => new Response(gzipSync(Buffer.from(JSON.stringify(value))), { status: 200 })

beforeEach(() => {
  resetSeedCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('parseSeasonKey reads back what seasonKey wrote, for every season', () => {
  expect(parseSeasonKey('2026-SUMMER')).toEqual({ season: 'SUMMER', year: 2026 })
  expect(parseSeasonKey(seasonKey({ season: 'winter', year: 2027 }))).toEqual({ season: 'WINTER', year: 2027 })
  expect(parseSeasonKey(seasonKey({ season: 'fall', year: 2026 }))).toEqual({ season: 'FALL', year: 2026 })
  expect(parseSeasonKey(seasonKey({ season: 'spring', year: 2026 }))).toEqual({ season: 'SPRING', year: 2026 })
})

// The keys reach it off a generated module and, through the page resolver, off a caller's input, so
// a shape neither promises has to cost a season and never a page.
test('parseSeasonKey refuses a key it does not recognise instead of throwing', () => {
  for (const key of ['', '2026', 'SUMMER', '2026-SOMMER', '2026-summer', '20x6-SUMMER', '2026-SUMMER-EXTRA']) {
    expect(parseSeasonKey(key), key).toBeUndefined()
  }
})

test('a media built from a bucket carries that bucket season and year', () => {
  const media = seasonMedia(record(), '2026-SUMMER')!
  expect(media.season).toBe('SUMMER')
  expect(media.seasonYear).toBe(2026)

  const page = seasonPage([record(), record({ ml: 2 })], '2027-WINTER')
  expect(page.map(node => [node.season, node.seasonYear])).toEqual([['WINTER', 2027], ['WINTER', 2027]])
})

// A row is worth more than its season: the bundle is what answers when every upstream is down, so an
// unreadable key costs the season and never the record.
test('a key that does not parse yields a media with no season, rather than throwing', () => {
  for (const key of ['not-a-season', '', undefined]) {
    const media = seasonMedia(record(), key)
    expect(media, key).toBeDefined()
    expect(media!.titles[0]?.title, key).toBe('Some Show')
    expect(media!.season, key).toBeNull()
    expect(media!.seasonYear, key).toBeNull()
  }
  expect(seasonPage([record()], 'not-a-season')).toHaveLength(1)
})

test('an input naming a season the bundle holds answers that bucket', async () => {
  const key = await otherHeldSeason()
  const { seasons } = await bundle()
  const { season, year } = parseSeasonKey(key)!

  const yielded = await pagesFor({ season, seasonYear: year })
  expect(yielded).toHaveLength(1)
  expect(urisOf(yielded[0]!.mediaPage.nodes)).toEqual(urisOf(seasonPage(seasons[key]!, key)))
  expect(yielded[0]!.mediaPage.nodes[0]?.season).toBe(season)
  expect(urisOf(yielded[0]!.mediaPage.nodes), 'and it is not the clock season wearing another name')
    .not.toEqual(urisOf(seasonPage(seasons[CURRENT_SEASON] ?? [], CURRENT_SEASON)))
})

// The window is six buckets around the dump's cut date, with no history behind it, so a season
// outside it is data this build will never hold. Substituting the current season wastes the call and
// leaks on every axis the store's filter cannot see.
test('an input naming a season the bundle does not hold answers an empty page, never another season', async () => {
  const { seasons } = await bundle()
  expect(seasons['2019-WINTER'], 'control: 2019-WINTER has to be outside the window').toBeUndefined()
  expect((seasons[CURRENT_SEASON] ?? []).length, 'control: the bundle has to answer for the clock season').toBeGreaterThan(0)

  const yielded = await pagesFor({ season: 'WINTER', seasonYear: 2019 })
  expect(yielded).toHaveLength(1)
  expect(yielded[0]!.mediaPage.nodes).toEqual([])
})

// A season with no year names four buckets of the window and a year with no season names six, so
// there is no bucket to answer and the clock's is not it.
test('a season named with no year answers nothing rather than the clock season', async () => {
  const yielded = await pagesFor({ status: 'RELEASING', season: 'WINTER' })
  expect(yielded).toHaveLength(1)
  expect(yielded[0]!.mediaPage.nodes).toEqual([])
})

// The other half of the pair, and it went unpinned when the season half was written. A year alone
// with status RELEASING fell straight through to the clock: asking for 2019 answered the 2026 bucket,
// 147 rows every one stamped SUMMER 2026. `filter.ts` is strict on seasonYear so none of them reached
// the page, which is exactly why nothing caught it: the substitution was invisible rather than absent,
// and the rows still went into the store to be offered to the fuzzy merge.
test('a year named with no season answers nothing rather than the clock season', async () => {
  for (const input of [{ status: 'RELEASING', seasonYear: 2019 }, { status: 'RELEASING', seasonYear: 2026 }]) {
    const yielded = await pagesFor(input)
    expect(yielded).toHaveLength(1)
    expect(yielded[0]!.mediaPage.nodes, JSON.stringify(input)).toEqual([])
  }
})

test('status RELEASING with no season named still answers the clock season', async () => {
  const { seasons } = await bundle()
  const current = seasonPage(seasons[CURRENT_SEASON] ?? [], CURRENT_SEASON)
  expect(current.length, `control: the bundle has to answer for ${CURRENT_SEASON} for this to prove anything`).toBeGreaterThan(0)

  const yielded = await pagesFor({ status: 'RELEASING' })
  expect(urisOf(yielded[0]!.mediaPage.nodes)).toEqual(urisOf(current))
  expect(yielded[0]!.mediaPage.nodes[0]?.season).toBe(parseSeasonKey(CURRENT_SEASON)!.season)
})

test('a search, and anything that is neither a season nor RELEASING, is still unanswered', async () => {
  expect((await pagesFor({ search: 'mushoku' }))[0]!.mediaPage.nodes).toEqual([])
  expect((await pagesFor({ status: 'FINISHED' }))[0]!.mediaPage.nodes).toEqual([])
})

// The seeded half takes the same key. Its index carries the current and the next season only, so a
// request for the season the walk listed has to reach it rather than the clock's.
test('the seeded half is asked for the season the input named', async () => {
  const key = await otherHeldSeason()
  const { season, year } = parseSeasonKey(key)!
  const index = seedIndex(key)
  expect(checkSeedSchema(index), 'control: the fixture has to be what the gate calls an index').toEqual([])

  const yielded = await pagesFor({ season, seasonYear: year }, {
    fetch: (async () => gzipped(index)) as unknown as typeof globalThis.fetch,
  })

  expect(yielded).toHaveLength(2)
  expect(yielded[1]!.mediaPage.nodes.map(node => node.uri)).toEqual([`offline:${RUN_KEY}`])
})

test('a seeded run carries the season it was walked under, and none when it was a side effect', () => {
  const media = seedMedia(seedRun({ season: '2027-WINTER' }))
  expect(media.season).toBe('WINTER')
  expect(media.seasonYear).toBe(2027)

  const side = seedMedia(seedRun({ season: null }))
  expect(side.season).toBeNull()
  expect(side.seasonYear).toBeNull()

  expect(seedSeasonPage(seedIndex('2027-WINTER'), '2027-WINTER')[0]?.season).toBe('WINTER')
})

// The seasonal half is walked by key so the row a media ask resolves to states its season too. Read
// as values that key is thrown away and every one of these rows is season-less.
test('a media resolved out of the bundle carries the season of the bucket it was found in', async () => {
  const key = await otherHeldSeason()
  const { seasons } = await bundle()
  const first = seasonPage(seasons[key]!, key)[0]!

  const yielded: { media: GQLMedia | null }[] = []
  for await (const value of subscribeTo('media')(undefined, { input: { uri: first.uri } }, noSeed)) {
    yielded.push(value as { media: GQLMedia | null })
  }

  expect(yielded[0]?.media?.uri).toBe(first.uri)
  expect(yielded[0]?.media?.season).toBe(parseSeasonKey(key)!.season)
  expect(yielded[0]?.media?.seasonYear).toBe(parseSeasonKey(key)!.year)
})
