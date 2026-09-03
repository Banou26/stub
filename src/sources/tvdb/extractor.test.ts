// `tvdb:<seriesId>` names the whole SERIES, and /series/<id>/episodes/default answers with every
// season at once. Every media in this store is one run, so `episodeNumber` is within-season, and
// flattening several seasons into one list collides them: db.ts hangs a HAS_EPISODE edge off this uri
// for each episode and `Media.episodes` groups the union by episodeNumber ALONE, so the row count
// becomes the LONGEST season and whatever else the cluster holds shares rows with a season nobody
// asked for. Measured live 2026-08-31 through the same mechanism: 24 rows on a 14 episode season page.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const BASE = 'https://api4.thetvdb.com/v4'

const episode = (seasonNumber: number, number: number) => ({
  id: seasonNumber * 1000 + number,
  name: `S${seasonNumber}E${number}`,
  seasonNumber,
  number,
})

// `ok` is load bearing: `api` returns undefined on a falsy `res.ok`, and its `.catch(() => undefined)`
// swallows a thrown fixture miss, so a wrong route reports "no episodes" rather than failing. That is
// the exact absence these tests assert, so a drifted fixture would pass them while proving nothing.
// Misses are therefore COLLECTED and asserted on, rather than thrown.
const context = (episodes: ReturnType<typeof episode>[], misses: string[]) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    if (url === `${BASE}/login`) {
      return { ok: true, status: 200, json: async () => ({ data: { token: 'test-token' } }) }
    }
    if (url.startsWith(`${BASE}/series/121361/extended`)) {
      return { ok: true, status: 200, json: async () => ({ data: { id: 121361, name: 'Game of Thrones', firstAired: '2011-04-17' } }) }
    }
    if (url.startsWith(`${BASE}/series/121361/episodes/default`)) {
      return { ok: true, status: 200, json: async () => ({ data: { episodes }, links: {} }) }
    }
    misses.push(url)
    return { ok: false, status: 404, json: async () => ({}) }
  },
}) as never

const mediaFor = async (episodes: ReturnType<typeof episode>[]) => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'tvdb:121361' } }, context(episodes, misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const media = value?.media as { uri?: string, episodes?: unknown[], episodeCount?: number } | null
  // a null media satisfies every `episodes ?? []` assertion below, so it is ruled out here once
  expect(media, 'the media itself must exist; only its episode list is ever refused').not.toBeNull()
  return media!
}

// The guard. Two seasons in one list is not this run's episode list, it is two runs'.
test('a series spanning several seasons contributes NO episode list', async () => {
  const media = await mediaFor([episode(1, 1), episode(1, 2), episode(2, 1), episode(2, 2), episode(2, 3)])

  expect(media.episodes ?? []).toEqual([])
  expect(media.episodeCount).toBeUndefined()
})

// The media itself has to survive: mediaPage mints exactly these ids for SEARCH, so dropping it would
// take the search hit down with it.
test('the media itself still exists, only its episode list is refused', async () => {
  const media = await mediaFor([episode(1, 1), episode(2, 1)])

  expect(media.uri).toBe('tvdb:121361')
})

// The control, and the reason this is a check on the seasons present rather than a blanket refusal:
// one season is one run, so its list is honest and is kept.
test('a series whose episodes are all one season keeps them', async () => {
  const media = await mediaFor([episode(1, 1), episode(1, 2), episode(1, 3)])

  expect(media.episodes).toHaveLength(3)
  expect(media.episodeCount).toBe(3)
})
