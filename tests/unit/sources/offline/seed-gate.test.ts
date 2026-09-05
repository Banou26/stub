// The gate decides what gets published to every user. Every check has a control that passes first and
// one mutation that must produce exactly one failure, so a check that fires on the valid fixture or
// stays silent on the broken one is caught here rather than in a green run that published nothing.
import { describe, expect, test } from 'vitest'

import {
  SEED_MAX_INDEX_BYTES, SEED_MIN_CURRENT_SEASON_RUNS, SEED_MIN_MEDIAN_IDENTITY, SEED_MIN_RUNS, SEED_MIN_STREAMING_SHARE,
  checkSeedCounts, checkSeedEpisodesSchema, checkSeedSchema, dropWeldedRuns, extendsId, findSeedWelds, gateSeed, isSeedIndex,
} from '../../../../src/sources/offline/seed-gate'
import type { SeedEpisode, SeedEpisodes, SeedHandle, SeedIndex, SeedRun } from '../../../../src/sources/offline/seed'

const SEASON = '2026-SUMMER'

const handle = (uri: string, scope: SeedHandle['scope'] = 'RUN'): SeedHandle => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  scope,
})

const run = (key: string, identityUris: string[], season: string | null, overrides: Partial<SeedRun> = {}): SeedRun => ({
  key,
  season,
  identity: identityUris.sort().map(uri => handle(uri)),
  containers: [handle('cr:SERIES', 'CONTAINER')],
  titles: [{ language: 'en', title: `Show ${key}` }],
  covers: [{ url: 'https://img.example.test/cover.jpg', language: null }],
  banners: [],
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  episodeCount: 12,
  averageScore: 75,
  isAdult: false,
  ...overrides,
})

/** three runs: two listed under the season, the third walked as a side effect and in no bucket */
const validIndex = (): SeedIndex => ({
  version: 1,
  generatedAt: '2026-09-05T04:17:00.000Z',
  commit: 'abc1234',
  appVersion: '0.0.17',
  walkedOrigin: 'http://localhost:4599',
  seasons: { [SEASON]: ['mal-1', 'mal-2'] },
  runs: [
    run('mal-1', ['mal:1', 'anilist:11', 'kitsu:21', 'cr:G1'], SEASON),
    run('mal-2', ['mal:2', 'anilist:12', 'kitsu:22', 'nf:80001'], SEASON),
    run('anilist-13', ['anilist:13', 'kitsu:23', 'jw:ts1-1', 'cr:G3'], null),
  ],
})

const episode = (number: number, overrides: Partial<SeedEpisode> = {}): SeedEpisode => ({
  number,
  titles: [{ language: 'en', title: `Episode ${number}` }],
  thumbnails: [{ url: 'https://img.example.test/thumb.jpg', language: null }],
  urls: [{ origin: 'cr', url: `https://cr.example.test/watch/${number}` }],
  releaseDate: '2026-07-04',
  seasonNumber: 1,
  absoluteEpisodeNumber: number,
  runtime: 24,
  ...overrides,
})

const validEpisodes = (index = validIndex()): SeedEpisodes => ({
  version: 1,
  generatedAt: index.generatedAt,
  commit: index.commit,
  episodes: { 'mal-1': [episode(1), episode(2)], 'mal-2': [episode(1)] },
})

/** `count` runs, every identity of length 4, `streamingOn` of them carrying a crunchyroll id, all under the season */
const manyRuns = (count: number, streamingOn: number, identitySize = 4): SeedIndex => {
  const index = validIndex()
  index.runs = Array.from({ length: count }, (_, i) => {
    const n = i + 1
    const uris = [`mal:${n}`, `anilist:${1000 + n}`, `kitsu:${2000 + n}`, `tvmaze:${3000 + n}`, `tmdb:${4000 + n}`]
      .slice(0, identitySize)
    if (i < streamingOn) uris[uris.length - 1] = `cr:G${n}`
    return run(`mal-${n}`, uris, SEASON)
  })
  index.seasons = { [SEASON]: index.runs.map(r => r.key) }
  return index
}

const mutate = (change: (index: SeedIndex) => void): SeedIndex => {
  const index = validIndex()
  change(index)
  return index
}

describe('controls', () => {
  test('the fixture passes the schema and holds no weld', () => {
    expect(checkSeedSchema(validIndex())).toEqual([])
    expect(isSeedIndex(validIndex())).toBe(true)
    expect(findSeedWelds(validIndex())).toEqual([])
    expect(checkSeedEpisodesSchema(validEpisodes(), validIndex())).toEqual([])
  })

  test('the schema check never throws on garbage', () => {
    for (const value of [null, undefined, 42, 'x', [], {}, { version: 1, runs: 'no' }]) {
      expect(Array.isArray(checkSeedSchema(value)), String(value)).toBe(true)
      expect(checkSeedSchema(value).length, String(value)).toBeGreaterThan(0)
    }
  })
})

describe('welds', () => {
  test('two disagreeing ids of one origin in one identity is a weld naming both', () => {
    const index = mutate(i => { i.runs[0]!.identity.push(handle('cr:G2')) })
    expect(findSeedWelds(index)).toEqual([{ key: 'mal-1', origin: 'cr', ids: ['G1', 'G2'] }])
    expect(gateSeed(index, validEpisodes(index), { currentSeasonKey: SEASON }).failures).toContain('weld mal-1 cr: G1 + G2')
  })

  test('a season-scoped id beside its own bare series id is specificity, not a weld', () => {
    expect(extendsId('G24H1N3MP', 'G24H1N3MP-GS00374452')).toBe(true)
    expect(extendsId('G24H1N3MP-GS00374452', 'G24H1N3MP')).toBe(true)
    expect(extendsId('G24H1N3MP', 'G24H1N3MPX')).toBe(false)
    const index = mutate(i => { i.runs[0]!.identity.push(handle('cr:G1-GS00374452')) })
    expect(findSeedWelds(index)).toEqual([])
  })

  // The exception is a season id beside ITS OWN parent. Two season ids beside a shared parent are two
  // runs of one series fused into one published cluster, and reading `extendsId` symmetrically filtered
  // BOTH of them out through that parent, so the weld reported nothing.
  test('two season ids are a weld even when their shared series id is in the cluster', () => {
    const index = mutate(i => {
      i.runs[0]!.identity[0]!.uri = 'cr:G1-S1'
      i.runs[0]!.identity[0]!.id = 'G1-S1'
      i.runs[0]!.identity[0]!.origin = 'cr'
      i.runs[0]!.identity.push(handle('cr:G1-S2'))
    })
    expect(findSeedWelds(index)).toEqual([{ key: 'mal-1', origin: 'cr', ids: ['G1-S1', 'G1-S2'] }])
    expect(gateSeed(index, validEpisodes(index), { currentSeasonKey: SEASON }).failures)
      .toContain('weld mal-1 cr: G1-S1 + G1-S2')
  })

  test('a repeated id is not a disagreement with itself', () => {
    const index = mutate(i => { i.runs[0]!.identity.push(handle('cr:G1')) })
    expect(findSeedWelds(index)).toEqual([])
  })
})

describe('index schema', () => {
  const cases: [string, (index: SeedIndex) => void, string][] = [
    ['an offline identity member', i => { i.runs[0]!.identity.push(handle('offline:mal-1')) }, 'offline'],
    ['a handle whose uri is not origin:id', i => { i.runs[0]!.identity[0]!.uri = 'mal:999' }, 'uri'],
    ['an id carrying a comma', i => { i.runs[0]!.identity[0] = handle('cr:a,b') }, 'routable'],
    ['a CONTAINER in identity', i => { i.runs[0]!.identity[0]!.scope = 'CONTAINER' }, 'scope'],
    ['a RUN in containers', i => { i.runs[0]!.containers[0]!.scope = 'RUN' }, 'scope'],
    ['a key of the wrong shape', i => { i.runs[2]!.key = 'foo-1' }, 'key'],
    ['a key naming no identity member', i => { i.runs[2]!.key = 'mal-999' }, 'key'],
    ['one uri in two runs', i => { i.runs[1]!.identity.push(handle('kitsu:21')) }, 'kitsu:21'],
    ['a season bucket naming a missing run', i => { i.seasons[SEASON]!.push('mal-404') }, 'mal-404'],
    ['version 2', i => { (i as { version: number }).version = 2 }, 'version'],
    ['a commit that is not a sha', i => { i.commit = 'xyz' }, 'commit'],
    ['an empty title', i => { i.runs[0]!.titles = [{ language: 'en', title: '' }] }, 'title'],
    ['a title with no language', i => { i.runs[0]!.titles = [{ language: '', title: 'Show' }] }, 'title'],
    ['a cover that is not http', i => { i.runs[0]!.covers.push({ url: 'ftp://img.example.test/x.jpg', language: null }) }, 'cover'],
    ['two titles on one run', i => { i.runs[0]!.titles.push({ language: 'ja', title: 'ショー' }) }, 'cap'],
    // Reachable, and not through one broken run: four browser contexts are four independent stores, so
    // one can hold a uri as a run's SAME_AS member while another holds it as a container. Publishing
    // both welds the container into a run cluster on whichever way the dataloader batches.
    ['one uri as a RUN here and a CONTAINER there', i => { i.runs[1]!.containers.push(handle('cr:G1', 'CONTAINER')) }, 'cr:G1'],
  ]
  for (const [name, change, needle] of cases) {
    test(`${name} is exactly one failure`, () => {
      const failures = checkSeedSchema(mutate(change))
      expect(failures, failures.join('\n')).toHaveLength(1)
      expect(failures[0]).toContain(needle)
    })
  }

  test('a bucket and a run\'s own season are checked in both directions', () => {
    const claimed = checkSeedSchema(mutate(i => { i.runs[2]!.season = SEASON }))
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toContain('season')
    const missing = checkSeedSchema(mutate(i => { i.runs[0]!.season = null }))
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('season')
  })

  test('a flood of problems is capped with a summary line', () => {
    const index = manyRuns(120, 0)
    for (const r of index.runs) r.identity[0]!.scope = 'CONTAINER'
    const failures = checkSeedSchema(index)
    expect(failures.length).toBe(51)
    expect(failures[50]).toMatch(/70 more/)
  })
})

describe('episodes schema', () => {
  test('a generatedAt that is not the index\'s is refused', () => {
    const episodes = validEpisodes()
    episodes.generatedAt = '2026-09-04T04:17:00.000Z'
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
  })

  test('a key naming no run is refused', () => {
    const episodes = validEpisodes()
    episodes.episodes['mal-404'] = [episode(1)]
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
  })

  test('61 episodes on one run is refused', () => {
    const episodes = validEpisodes()
    episodes.episodes['mal-1'] = Array.from({ length: 61 }, (_, i) => episode(i + 1))
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
    episodes.episodes['mal-1'] = Array.from({ length: 60 }, (_, i) => episode(i + 1))
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toEqual([])
  })

  test('numbers that do not strictly ascend are refused', () => {
    const episodes = validEpisodes()
    episodes.episodes['mal-1'] = [episode(2), episode(1)]
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
    episodes.episodes['mal-1'] = [episode(1), episode(1)]
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
  })

  test('an episode url of origin offline is refused', () => {
    const episodes = validEpisodes()
    episodes.episodes['mal-1']![0]!.urls = [{ origin: 'offline', url: 'https://example.test/x' }]
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
  })

  test('two urls of one origin, or a second thumbnail, are refused', () => {
    const episodes = validEpisodes()
    episodes.episodes['mal-1']![0]!.urls = [{ origin: 'cr', url: 'https://a.test/1' }, { origin: 'cr', url: 'https://a.test/2' }]
    expect(checkSeedEpisodesSchema(episodes, validIndex())).toHaveLength(1)
    const more = validEpisodes()
    more.episodes['mal-1']![0]!.thumbnails.push({ url: 'https://img.example.test/2.jpg', language: null })
    expect(checkSeedEpisodesSchema(more, validIndex())).toHaveLength(1)
  })
})

describe('counts', () => {
  const options = { currentSeasonKey: SEASON }

  test('the thin fixture fails on runs, with the count in the text', () => {
    const { failures, stats } = checkSeedCounts(validIndex(), validEpisodes(), options)
    expect(stats.runs).toBe(3)
    expect(failures.some(f => f.includes('runs 3') && f.includes(String(SEED_MIN_RUNS)))).toBe(true)
  })

  test('zero streaming origins is the relay-dead signature and carries the per-origin counts', () => {
    const { failures, stats } = checkSeedCounts(manyRuns(300, 0), validEpisodes(manyRuns(300, 0)), options)
    expect(stats.streamingShare).toBe(0)
    expect(failures.some(f => f.includes('cr=0 nf=0 jw=0 over 300 runs')), failures.join('\n')).toBe(true)
  })

  test('crunchyroll on 120 of 300 runs clears the share', () => {
    const index = manyRuns(300, 120)
    const { failures, stats } = checkSeedCounts(index, validEpisodes(index), options)
    expect(stats.streamingShare).toBe(0.4)
    expect(stats.streamingCounts).toEqual({ cr: 120, nf: 0, jw: 0 })
    expect(stats.streamingShare).toBeGreaterThanOrEqual(SEED_MIN_STREAMING_SHARE)
    expect(failures.filter(f => f.includes('streaming'))).toEqual([])
    expect(failures, failures.join('\n')).toEqual([])
  })

  test('median identity 3 fails and 4 passes', () => {
    const three = manyRuns(300, 120, 3)
    const { failures, stats } = checkSeedCounts(three, validEpisodes(three), options)
    expect(stats.medianIdentity).toBe(3)
    expect(failures.some(f => f.includes('median identity 3') && f.includes(String(SEED_MIN_MEDIAN_IDENTITY)))).toBe(true)
    const four = manyRuns(300, 120, 4)
    expect(checkSeedCounts(four, validEpisodes(four), options).failures).toEqual([])
  })

  test('the current season below its floor fails even when the total passes', () => {
    const index = manyRuns(300, 120)
    index.seasons = { [SEASON]: index.runs.slice(0, 119).map(r => r.key), '2026-FALL': index.runs.slice(119).map(r => r.key) }
    for (const r of index.runs.slice(119)) r.season = '2026-FALL'
    const { failures, stats } = checkSeedCounts(index, validEpisodes(index), options)
    expect(stats.perSeason).toEqual({ [SEASON]: 119, '2026-FALL': 181 })
    expect(failures.some(f => f.includes(SEASON) && f.includes(String(SEED_MIN_CURRENT_SEASON_RUNS)))).toBe(true)
  })

  test('an index past the byte budget fails', () => {
    const index = manyRuns(300, 120)
    index.runs[0]!.titles.push({ language: 'en', title: 'x'.repeat(SEED_MAX_INDEX_BYTES) })
    const { failures, stats } = checkSeedCounts(index, validEpisodes(index), options)
    expect(stats.bytes.index).toBeGreaterThan(SEED_MAX_INDEX_BYTES)
    expect(failures.some(f => f.includes('index') && f.includes('bytes'))).toBe(true)
  })
})

describe('gateSeed', () => {
  test('an invalid shape reports only schema failures, welds are not run', () => {
    const index = mutate(i => {
      (i as { version: number }).version = 2
      i.runs[0]!.identity.push(handle('cr:G2'))
    })
    const result = gateSeed(index, validEpisodes(index), { currentSeasonKey: SEASON })
    expect(result.ok).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('version')
  })

  test('a valid, weld-free, well-populated seed is ok', () => {
    const index = manyRuns(300, 120)
    const result = gateSeed(index, validEpisodes(index), { currentSeasonKey: SEASON })
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.stats!.runs).toBe(300)
  })

  test('valid index with refused episodes is not ok', () => {
    const index = manyRuns(300, 120)
    const episodes = validEpisodes(index)
    episodes.commit = 'fffffff'
    const result = gateSeed(index, episodes, { currentSeasonKey: SEASON })
    expect(result.ok).toBe(false)
    expect(result.failures.some(f => f.includes('commit'))).toBe(true)
  })
})

// The first real walk (2026-09-05, 358 runs) carried ONE welded run, `mal-63736` holding two Netflix
// ids, and the gate refused the whole seed for it. Refusing to publish that run is right; refusing
// the other 357 means one bad show blocks every daily publish until somebody notices. So a weld drops
// its run and is counted, the way `buildSeed` already drops a row the gate would refuse, and the gate
// fails on the SHARE instead: a spike means the app broke and the seed must not ship.
describe('welded runs are dropped, and a spike still refuses the seed', () => {
  const welded = () => {
    const index = validIndex()
    index.runs[0] = run('mal-1', ['mal:1', 'nf:80081846', 'nf:80091938'], SEASON)
    return index
  }

  test('a welded run leaves the seed with its episodes, and the rest survive', () => {
    const index = welded()
    const dropped = dropWeldedRuns(index, validEpisodes(index))

    expect(dropped.dropped).toEqual(['mal-1'])
    expect(dropped.index.runs.map(entry => entry.key)).toEqual(['mal-2', 'anilist-13'])
    expect(Object.keys(dropped.episodes.episodes), 'the dropped run takes its episodes with it').toEqual(['mal-2'])
    expect(dropped.index.seasons[SEASON], 'and its place in the season bucket').toEqual(['mal-2'])
    expect(findSeedWelds(dropped.index), 'nothing welded is left to publish').toEqual([])
  })

  test('one weld in a full walk publishes, and a spike does not', () => {
    const index = manyRuns(358, 358)
    const episodes = validEpisodes(index)

    const one = gateSeed(index, episodes, { currentSeasonKey: SEASON, weldedDropped: 1 })
    const spike = gateSeed(index, episodes, { currentSeasonKey: SEASON, weldedDropped: 40 })

    expect(one.failures.filter(line => line.includes('welded')), '1 of 359 is the walk that was measured').toEqual([])
    expect(spike.failures.filter(line => line.includes('welded')), '40 of 398 is something breaking').toHaveLength(1)
  })

  test('a weld the caller failed to drop still refuses the seed', () => {
    const index = welded()

    expect(gateSeed(index, validEpisodes(index), { currentSeasonKey: SEASON }).failures.some(line => line.startsWith('weld ')))
      .toBe(true)
  })
})
