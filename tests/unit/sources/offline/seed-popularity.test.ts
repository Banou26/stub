// The whole point of the seed, stated by the owner with two screenshots on 2026-09-05: a cold home
// page must paint Mushoku Tensei, Saga of Tanya the Evil II and Bleach, which is what the settled
// listing shows, instead of the obscure shows manami's rating puts first. The listing sorts on
// `popularity` with a stable sort, so a seed carrying none sorts exactly as badly as the bundle it
// replaced: the feature cannot work without this field.
//
// An earlier review had it removed along with status, startDate and endDate, because a seeded field
// at the offline score of 0.2 beats a live source scoring 0.2 on arrival order. Popularity is not in
// that class: the 0.2 sources (justwatch, appletv, paramount, unogs) supply NO popularity at all, and
// every source that does supply one outranks 0.2 (anilist 0.8, kitsu 0.3). The seeded value is also
// harvested from those same sources, so winning a tie would restate their own number.
import { expect, test } from 'vitest'

import { seedMedia, seedSeasonPage } from '../../../../src/sources/offline/seed-source'
import type { SeedIndex, SeedRun } from '../../../../src/sources/offline/seed'

const run = (key: string, popularity: number | null): SeedRun => ({
  key,
  season: '2026-SUMMER',
  identity: [{ uri: `mal:${key.slice(4)}`, origin: 'mal', id: key.slice(4), scope: 'RUN' }],
  containers: [],
  titles: [{ language: 'en', title: `Show ${key}` }],
  covers: [],
  banners: [],
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  episodeCount: 12,
  averageScore: 80,
  isAdult: false,
  popularity,
})

const index = (runs: SeedRun[]): SeedIndex => ({
  version: 1,
  generatedAt: '2026-09-05T04:17:00.000Z',
  commit: 'abc1234',
  appVersion: '0.0.17',
  walkedOrigin: 'https://anime.fkn.app',
  seasons: { '2026-SUMMER': runs.map(entry => entry.key) },
  runs,
})

test('a seeded row carries the popularity the listing sorts on', () => {
  expect(seedMedia(run('mal-59193', 184_000), undefined).popularity)
    .toBe(184_000)
})

test('a run the live sources gave no popularity carries none, rather than a zero that outranks nothing', () => {
  expect(seedMedia(run('mal-1', null), undefined).popularity).toBeNull()
})

test('the season page carries every row its popularity, so a cold listing can sort', () => {
  const page = seedSeasonPage(index([run('mal-1', 40), run('mal-2', 184_000)]), '2026-SUMMER')

  expect(page.map(media => media.popularity), 'the listing sorts these itself; the seed only has to supply them')
    .toEqual([40, 184_000])
})
