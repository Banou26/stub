// The builder turns raw store exports into the seed the gate accepts. Fixtures are StoreExport literals
// shaped exactly as worker/store/export.ts emits them, so what is pinned here is the contract between
// the exporter's snapshots and the runtime's reading of them.
import { describe, expect, test } from 'vitest'

import { SEED_COVERS_PER_RUN, SEED_EPISODES_PER_RUN, SEED_TITLES_PER_RUN } from '../../../../src/sources/offline/seed'
import { buildSeed, type SeedBuildMeta } from '../../../../src/sources/offline/seed-build'
import { checkSeedEpisodesSchema, checkSeedSchema } from '../../../../src/sources/offline/seed-gate'
import type { ExportedCluster, StoreExport } from '../../../../src/worker/store/export'
import type { Episode, Media } from '../../../../src/worker/store/types'

const CURRENT = '2026-SUMMER'
const NEXT = '2026-FALL'

const row = (uri: string, { titles, ...fields }: Omit<Partial<Media>, 'titles'> & { titles?: (string | Media['titles'][number])[] } = {}): Media => ({
  uri: uri as Media['uri'],
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  url: `https://example.test/${uri}`,
  score: 0.5,
  type: null,
  categories: [],
  status: null,
  descriptions: [],
  shortDescriptions: [],
  trailers: [],
  covers: [],
  banners: [],
  averageScore: null,
  popularity: null,
  startDate: null,
  endDate: null,
  isAdult: null,
  episodeCount: null,
  scope: 'RUN',
  ...fields,
  titles: (titles ?? [uri]).map(title =>
    typeof title === 'string' ? { language: 'en', title, score: fields.score ?? 0.5 } : title),
})

const episode = (uri: string, mediaUri: string, episodeNumber: number | null, fields: Partial<Episode> = {}): Episode => ({
  uri: uri as Episode['uri'],
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  url: `https://example.test/watch/${uri}`,
  embedUrl: null,
  mediaUri: mediaUri as Episode['mediaUri'],
  score: 0.5,
  titles: [{ language: 'en', title: `Episode ${episodeNumber}`, score: 0.5 }],
  descriptions: [],
  shortDescriptions: [],
  thumbnails: [{ url: `https://img.example.test/${uri}.jpg`, score: 0.5 }],
  releaseDate: null,
  seasonNumber: null,
  episodeNumber,
  absoluteEpisodeNumber: null,
  runtime: null,
  ...fields,
})

const cluster = (members: Media[], partOf: Media[] = [], episodes: Episode[] = []): ExportedCluster => ({ members, partOf, episodes })
const snapshot = (...clusters: ExportedCluster[]): StoreExport => ({ exportedAt: '2026-09-05T04:20:00.000Z', excludedOrigins: [], clusters })

const meta = (seasonByUri: Record<string, string> = {}): SeedBuildMeta => ({
  generatedAt: '2026-09-05T04:17:00.000Z',
  commit: 'abc1234',
  appVersion: '0.0.17',
  walkedOrigin: 'http://localhost:4599',
  seasonByUri,
})

/** a healthy run: catalogue ids, a streaming id, an offline row, a series container, two episodes */
const healthyRun = () => cluster(
  [
    row('anilist:1', { score: 0.9, status: 'RELEASING', type: 'TV', categories: ['ANIME', 'SERIES'], startDate: '2026-07-04', episodeCount: 12, popularity: 5000, averageScore: 80, isAdult: false, titles: ['Show', 'Show Season 2'], covers: [{ url: 'https://img.example.test/a.jpg', score: 0.9 }], banners: [{ url: 'https://img.example.test/ab.jpg', score: 0.9 }] }),
    row('cr:G1', { score: 0.7, titles: ['Show Season 2'] }),
    row('kitsu:2', { score: 0.3, titles: ['Show'] }),
    row('mal:3', { score: 0.9, titles: ['Show'] }),
    row('offline:mal-3', { score: 0.2, titles: ['Show (offline)'], covers: [{ url: 'https://img.example.test/offline.jpg', score: 0.2 }] }),
  ],
  [row('cr:SERIES', { scope: 'CONTAINER', score: 0.7 })],
  [episode('anilist:1-1', 'anilist:1', 1), episode('anilist:1-2', 'anilist:1', 2), episode('offline:mal-3-1', 'offline:mal-3', 1)],
)

describe('identity', () => {
  test('two tabs sharing a member produce one run whose partOf and episodes are unioned by uri', () => {
    const tabA = snapshot(cluster(
      [row('anilist:1', { score: 0.9 }), row('kitsu:2', { score: 0.3 })],
      [row('cr:SERIES', { scope: 'CONTAINER' })],
      [episode('anilist:1-1', 'anilist:1', 1)],
    ))
    const tabB = snapshot(cluster(
      [row('kitsu:2', { score: 0.3 }), row('mal:3', { score: 0.9 })],
      [row('cr:SERIES', { scope: 'CONTAINER' }), row('tvmaze:9', { scope: 'CONTAINER' })],
      [episode('anilist:1-1', 'anilist:1', 1), episode('mal:3-2', 'mal:3', 2)],
    ))
    const { index, episodes, report } = buildSeed([tabA, tabB], meta())
    expect(report.runs).toBe(1)
    expect(index.runs[0]!.key).toBe('mal-3')
    expect(index.runs[0]!.identity.map(h => h.uri)).toEqual(['anilist:1', 'kitsu:2', 'mal:3'])
    expect(index.runs[0]!.containers.map(h => h.uri)).toEqual(['cr:SERIES', 'tvmaze:9'])
    expect(episodes.episodes['mal-3']!.map(e => e.number)).toEqual([1, 2])
  })

  test('offline rows are dropped from identity, metadata and episodes', () => {
    const { index, episodes } = buildSeed([snapshot(healthyRun())], meta())
    const run = index.runs[0]!
    expect(run.identity.map(h => h.uri)).toEqual(['anilist:1', 'cr:G1', 'kitsu:2', 'mal:3'])
    expect(run.titles.map(t => t.title)).not.toContain('Show (offline)')
    expect(run.covers.map(c => c.url)).not.toContain('https://img.example.test/offline.jpg')
    expect(episodes.episodes['mal-3']!.map(e => e.number)).toEqual([1, 2])
    expect(episodes.episodes['mal-3']!.flatMap(e => e.urls.map(u => u.origin))).toEqual(['anilist', 'anilist'])
  })

  test('a run whose only key origin was offline is dropped and counted', () => {
    const { index, report } = buildSeed([snapshot(cluster([row('cr:G1'), row('offline:mal-3')]))], meta())
    expect(index.runs).toEqual([])
    expect(report.droppedNoKey).toBe(1)
  })

  test('CONTAINER members move to containers, RUN-scoped partOf targets are dropped', () => {
    const { index } = buildSeed([snapshot(cluster(
      [row('anilist:1'), row('imdb:tt1', { scope: 'CONTAINER' })],
      [row('cr:SERIES', { scope: 'CONTAINER' }), row('kitsu:9', { scope: 'RUN' })],
    ))], meta())
    const run = index.runs[0]!
    expect(run.identity.map(h => h.uri)).toEqual(['anilist:1'])
    expect(run.containers.map(h => [h.uri, h.scope])).toEqual([['cr:SERIES', 'CONTAINER'], ['imdb:tt1', 'CONTAINER']])
  })

  test('a member with no url is counted, and no handle publishes one', () => {
    const { index, report } = buildSeed([snapshot(cluster([row('anilist:1'), row('kitsu:2', { url: null })]))], meta())
    expect(report.nullUrlMembers).toBe(1)
    expect(index.runs[0]!.identity.every(h => !('url' in h))).toBe(true)
  })

  // Four browser contexts are four independent stores: one can hold a uri as a run's SAME_AS member
  // while another holds it as a PART_OF target, and nothing merges those two groups, because a partOf
  // target is not a member. Publishing both readings welds a container into a run cluster at runtime,
  // on whichever way the dataloader happens to batch the two rows.
  test('a uri another snapshot saw as a CONTAINER leaves identity and is counted', () => {
    const tabA = snapshot(cluster([row('mal:1'), row('cr:GSERIES')]))
    const tabB = snapshot(cluster([row('mal:2')], [row('cr:GSERIES', { scope: 'CONTAINER' })]))
    const { index, report } = buildSeed([tabA, tabB], meta())
    const first = index.runs.find(r => r.key === 'mal-1')!
    expect(first.identity.map(h => h.uri)).toEqual(['mal:1'])
    expect(first.containers.map(h => h.uri)).toEqual(['cr:GSERIES'])
    expect(report.scopeConflicts).toBe(1)
    expect(checkSeedSchema(index)).toEqual([])
  })
})

describe('metadata', () => {
  test('titles dedupe by title in score order and cap, covers cap, scalars take the first non-null by score', () => {
    const members = [
      row('kitsu:2', { score: 0.3, status: 'FINISHED', type: 'ONA', episodeCount: 10, startDate: '2026-01-01', popularity: 10, titles: ['Low', 'Shared'], covers: [{ url: 'https://img.example.test/k.jpg', score: 0.3 }] }),
      row('anilist:1', { score: 0.9, status: 'RELEASING', type: 'TV', episodeCount: 12, popularity: null, titles: ['Shared', 'High', 'Extra 1', 'Extra 2', 'Extra 3', 'Extra 4', 'Extra 5'], covers: [1, 2, 3, 4].map(n => ({ url: `https://img.example.test/a${n}.jpg`, score: 0.9 })) }),
    ]
    const { index } = buildSeed([snapshot(cluster(members))], meta())
    const run = index.runs[0]!
    expect(run.titles).toHaveLength(SEED_TITLES_PER_RUN)
    expect(run.titles.map(t => t.title)).toEqual(['Shared'])
    expect(run.covers).toHaveLength(SEED_COVERS_PER_RUN)
    expect(run.covers[0]!.url).toBe('https://img.example.test/a1.jpg')
    expect(run.type).toBe('TV')
    expect(run.episodeCount).toBe(12)
    expect(run.averageScore).toBeNull()
  })

  // Three the bundle withholds and the seed with it: at the offline score they would beat a live
  // source scoring the same 0.2 on arrival order, and a seeded startDate opens justwatch's gate.
  // POPULARITY is published, and is the reason the seed exists: the listing sorts on it, so a seed
  // without it paints in bundle order. No 0.2 source supplies one, so there is no tie to steal.
  test('status, startDate and endDate are not published, and popularity is', () => {
    const { index } = buildSeed([snapshot(cluster([
      row('anilist:1', { score: 0.9, status: 'RELEASING', startDate: '2026-07-04', endDate: '2026-09-20', popularity: 5000 }),
    ]))], meta())
    expect(Object.keys(index.runs[0]!).sort()).toEqual([
      'averageScore', 'banners', 'categories', 'containers', 'covers', 'episodeCount', 'identity',
      'isAdult', 'key', 'popularity', 'season', 'titles', 'type',
    ])
    expect(index.runs[0]!.popularity, 'taken from the live row that reported it').toBe(5000)
  })

  test('categories are ANIME plus the highest-scored format only', () => {
    const { index } = buildSeed([snapshot(cluster([
      row('kitsu:2', { score: 0.3, categories: ['ANIME', 'MOVIE'] }),
      row('anilist:1', { score: 0.9, categories: ['ANIME', 'SERIES'] }),
    ]))], meta())
    expect(index.runs[0]!.categories).toEqual(['ANIME', 'SERIES'])
  })
})

// A gate failure refuses the whole day's publish, so a build that emitted these would take the seed
// down for every user over one upstream field. Each is dropped and counted instead.
describe('rows the gate would refuse', () => {
  test('a title with no language, an image that is not http, an episode url that is not http', () => {
    const { index, episodes, report } = buildSeed([snapshot(cluster(
      [row('anilist:1', {
        score: 0.9,
        titles: [{ language: '', title: 'No language' }, { language: 'en', title: 'Kept' }],
        covers: [{ url: '//cdn.test/a.jpg', score: 0.9 }, { url: 'https://img.example.test/a.jpg', score: 0.9 }],
      })],
      [],
      [episode('anilist:1-1', 'anilist:1', 1, { url: 'about:blank' })],
    ))], meta())
    const run = index.runs[0]!
    expect(run.titles.map(t => t.title)).toEqual(['Kept'])
    expect(run.covers.map(c => c.url)).toEqual(['https://img.example.test/a.jpg'])
    expect(episodes.episodes['anilist-1']![0]!.urls).toEqual([])
    expect([report.droppedTitles, report.droppedImages, report.droppedUrls]).toEqual([1, 1, 1])
    expect(checkSeedSchema(index)).toEqual([])
    expect(checkSeedEpisodesSchema(episodes, index)).toEqual([])
  })

  // tvdb and tmdb both pass a specials list's numbering straight through, and the gate reads a run's
  // numbers as strictly ascending from zero.
  test('an episode numbered zero is dropped and the rest of the run is published', () => {
    const { episodes, report } = buildSeed([snapshot(cluster(
      [row('anilist:1')],
      [],
      [episode('anilist:1-0', 'anilist:1', 0), episode('anilist:1-1', 'anilist:1', 1)],
    ))], meta())
    expect(episodes.episodes['anilist-1']!.map(e => e.number)).toEqual([1])
    expect(report.droppedEpisodes).toBe(1)
  })

  test('a slug id is not borrowed as a key, so the run drops rather than the publish', () => {
    const { index, report } = buildSeed([snapshot(cluster([
      row('anilist:Keroro-Gunsou-Shin-Anime'), row('cr:G1'),
    ]))], meta())
    expect(index.runs).toEqual([])
    expect(report.droppedNoKey).toBe(1)
  })
})

describe('episodes', () => {
  test('the highest numbers survive the cap, and the cap is counted', () => {
    const rows = Array.from({ length: SEED_EPISODES_PER_RUN + 1 }, (_, i) => episode(`anilist:1-${i + 1}`, 'anilist:1', i + 1))
    const { episodes, report } = buildSeed([snapshot(cluster([row('anilist:1')], [], rows))], meta())
    const numbers = episodes.episodes['anilist-1']!.map(e => e.number)
    expect(numbers).toHaveLength(SEED_EPISODES_PER_RUN)
    expect(numbers[0]).toBe(2)
    expect(numbers.at(-1)).toBe(SEED_EPISODES_PER_RUN + 1)
    expect(report.cappedEpisodeRuns).toBe(1)
  })

  test('one number from two origins is one episode with two urls and one thumbnail', () => {
    const { episodes } = buildSeed([snapshot(cluster(
      [row('anilist:1', { score: 0.9 }), row('cr:G1', { score: 0.7 })],
      [],
      [
        episode('cr:G1-1', 'cr:G1', 1, { score: 0.7, releaseDate: '2026-07-04', runtime: 24 }),
        episode('anilist:1-1', 'anilist:1', 1, { score: 0.9 }),
        episode('anilist:1-x', 'anilist:1', null),
      ],
    ))], meta())
    const list = episodes.episodes['anilist-1']!
    expect(list).toHaveLength(1)
    expect(list[0]!.urls.map(u => u.origin)).toEqual(['anilist', 'cr'])
    expect(list[0]!.thumbnails).toHaveLength(1)
    expect(list[0]!.thumbnails[0]!.url).toBe('https://img.example.test/anilist:1-1.jpg')
    expect(list[0]!.releaseDate).toBe('2026-07-04')
    expect(list[0]!.runtime).toBe(24)
  })
})

describe('seasons', () => {
  test('listing uris take the current key, a bare offline uri the next, both take the earlier, neither is null', () => {
    const listed = cluster([row('anilist:1'), row('offline:anilist-1')])
    const next = cluster([row('offline:mal-2'), row('mal:2')])
    const both = cluster([row('anilist:3'), row('offline:anilist-3')])
    const neither = cluster([row('anilist:4')])
    const { index } = buildSeed([snapshot(listed, next, both, neither)], meta({
      'anilist:1': CURRENT,
      'offline:mal-2': NEXT,
      'anilist:3': NEXT,
      'offline:anilist-3': CURRENT,
    }))
    const seasonOf = (key: string) => index.runs.find(r => r.key === key)!.season
    expect(seasonOf('anilist-1')).toBe(CURRENT)
    expect(seasonOf('mal-2')).toBe(NEXT)
    expect(seasonOf('anilist-3')).toBe(CURRENT)
    expect(seasonOf('anilist-4')).toBeNull()
    expect(index.seasons).toEqual({ [CURRENT]: ['anilist-1', 'anilist-3'], [NEXT]: ['mal-2'] })
    expect(index.runs.map(r => r.key)).toEqual(['anilist-1', 'anilist-3', 'anilist-4', 'mal-2'])
  })
})

describe('agreement with the gate and the report', () => {
  test('the output passes both schema checks', () => {
    const { index, episodes } = buildSeed([snapshot(healthyRun(), cluster([row('anilist:5', { score: 0.9, titles: ['Other'] }), row('nf:80001', { score: 0.6 })]))], meta({ 'anilist:1': CURRENT, 'anilist:5': CURRENT }))
    expect(checkSeedSchema(index)).toEqual([])
    expect(checkSeedEpisodesSchema(episodes, index)).toEqual([])
    expect(index.generatedAt).toBe('2026-09-05T04:17:00.000Z')
    expect(index.commit).toBe('abc1234')
    expect(episodes.generatedAt).toBe(index.generatedAt)
  })

  test('streamingShare and originCounts match a hand count', () => {
    const { report } = buildSeed([snapshot(
      healthyRun(),
      cluster([row('anilist:5'), row('nf:80001')]),
      cluster([row('anilist:6'), row('kitsu:60')]),
      cluster([row('mal:7'), row('kitsu:70')]),
    )], meta())
    expect(report.runs).toBe(4)
    expect(report.streamingShare).toBe(0.5)
    expect(report.originCounts).toEqual({ anilist: 3, cr: 1, kitsu: 3, mal: 2, nf: 1 })
    expect(report.medianIdentity).toBe(2)
  })
})
