// `trakt:<slug>` names the whole SHOW, and `fetchEpisodes` flatMaps EVERY season of it into one list.
// Every media in this store is one run, so `episodeNumber` is within-season, and flattening several
// seasons collides them: store/db.ts hangs a HAS_EPISODE edge off this uri for each and
// `Media.episodes` groups the union by episodeNumber ALONE, so the row count becomes the LONGEST
// season and whatever else the cluster holds shares rows with a season nobody asked for. Measured live
// 2026-08-31 through the same mechanism: 24 rows on a 14 episode season page.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const BASE = 'https://api.trakt.tv'

const season = (number: number, episodes: number) => ({
  number,
  episodes: Array.from({ length: episodes }, (_, i) => ({ number: i + 1, title: `S${number}E${i + 1}`, ids: { trakt: number * 100 + i } })),
})

// misses are COLLECTED rather than thrown: `api` swallows a rejection with `.catch(() => undefined)`
// and an empty list is exactly the absence these tests assert, so a drifted fixture would pass them
// while proving nothing.
const context = (seasons: ReturnType<typeof season>[], misses: string[]) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    if (url.startsWith(`${BASE}/shows/breaking-bad?extended=full`)) {
      return { ok: true, status: 200, json: async () => ({ title: 'Breaking Bad', year: 2008, ids: { slug: 'breaking-bad', trakt: 1, imdb: 'tt0903747', tmdb: 1396 } }) }
    }
    if (url.startsWith(`${BASE}/shows/breaking-bad/seasons`)) {
      return { ok: true, status: 200, json: async () => seasons }
    }
    misses.push(url)
    return { ok: false, status: 404, json: async () => ({}) }
  },
}) as never

const mediaFor = async (seasons: ReturnType<typeof season>[]) => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'trakt:breaking-bad' } }, context(seasons, misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const media = value?.media as { uri?: string, episodes?: unknown[], episodeCount?: number } | null
  // a null media satisfies every `episodes ?? []` assertion below, so it is ruled out here once
  expect(media, 'the media itself must exist; only its episode list is ever refused').not.toBeNull()
  return media!
}

test('a show spanning several seasons contributes NO episode list', async () => {
  const media = await mediaFor([season(1, 7), season(2, 13)])

  expect(media.episodes ?? []).toEqual([])
  expect(media.episodeCount).toBeUndefined()
})

test('the media itself still exists, only its episode list is refused', async () => {
  const media = await mediaFor([season(1, 7), season(2, 13)])

  expect(media.uri).toBe('trakt:breaking-bad')
})

// The control, and the reason this is a check on the seasons present rather than a blanket refusal.
// Season 0 is already filtered out as specials, so a one-season show reaches here as one season.
test('a show whose episodes are all one season keeps them', async () => {
  const media = await mediaFor([season(0, 4), season(1, 7)])

  expect(media.episodes).toHaveLength(7)
  expect(media.episodeCount).toBe(7)
})
