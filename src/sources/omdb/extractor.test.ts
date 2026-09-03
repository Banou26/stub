// This source's media id is an IMDb id, which is the one origin worker/store/db.ts exempts outright
// because IMDb models no seasons at all. So the media is SHOW level by construction, and it used to
// hang every season's episodes off it: `fetchEpisodes` loops 1..totalSeasons and flattens the lot.
//
// Every media in this store is one run, so `episodeNumber` is within-season. `db.ts` hangs a
// HAS_EPISODE edge off this uri for each episode and `Media.episodes` groups the union by
// episodeNumber ALONE, so the row count becomes the LONGEST season and whatever else the cluster holds
// shares rows with a season nobody asked for. Measured live 2026-08-31 through the same mechanism:
// 24 rows on a 14 episode season page.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const seasonEpisodes = (n: number) => ({ Episodes: Array.from({ length: n }, (_, i) => ({ Title: `E${i + 1}`, Episode: String(i + 1), imdbID: `tt-s-e${i + 1}` })) })

// `api` swallows a thrown fixture miss with `.catch(() => undefined)`, so a wrong route would report
// "no episodes" rather than failing, and that is the exact absence these tests assert. Misses are
// therefore COLLECTED and asserted on rather than thrown.
const context = (totalSeasons: string | undefined, type: string, misses: string[]) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    if (url.includes('i=tt0903747&plot=full')) {
      return { json: async () => ({ imdbID: 'tt0903747', Title: 'Breaking Bad', Type: type, Year: '2008', totalSeasons, Response: 'True' }) }
    }
    const season = url.match(/Season=(\d+)/)?.[1]
    if (season) return { json: async () => seasonEpisodes(Number(season) === 1 ? 7 : 13) }
    misses.push(url)
    return { json: async () => ({ Response: 'False' }) }
  },
}) as never

const mediaFor = async (totalSeasons: string | undefined, type = 'series') => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'omdb:tt0903747' } }, context(totalSeasons, type, misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const media = value?.media as { uri?: string, episodes?: unknown[], episodeCount?: number } | null
  // a null media satisfies every `episodes ?? []` assertion below, so it is ruled out here once
  expect(media, 'the media itself must exist; only its episode list is ever refused').not.toBeNull()
  return media!
}

// The guard. Five seasons flattened into one list is not this run's episode list, it is five runs'.
test('a series with several seasons contributes NO episode list', async () => {
  const media = await mediaFor('5')

  expect(media.episodes ?? []).toEqual([])
  expect(media.episodeCount).toBeUndefined()
})

// The media itself has to survive: mediaPage mints exactly these ids for SEARCH, so dropping it would
// take the search hit down with it.
test('the media itself still exists, only its episode list is refused', async () => {
  const media = await mediaFor('5')

  expect(media.uri).toBe('omdb:tt0903747')
})

// The control, and the reason this is a check on the season count rather than a blanket refusal: one
// season is one run, so its list is honest and is kept.
test('a single-season series keeps its episodes, being one run', async () => {
  const media = await mediaFor('1')

  expect(media.episodes).toHaveLength(7)
  expect(media.episodeCount).toBe(7)
})

test('a movie is unaffected and still gets its single synthetic episode', async () => {
  const media = await mediaFor(undefined, 'movie')

  expect(media.episodes).toHaveLength(1)
  expect(media.episodeCount).toBe(1)
})
