// `paramount:<slug>` names the whole SHOW, and the episode fetch asks for `season/0` at
// `size/100000`, which is every episode of every season. Every media in this store is one run, so
// `episodeNumber` is within-season, and flattening several seasons into one list collides them:
// store/db.ts hangs a HAS_EPISODE edge off this uri for each and `Media.episodes` groups the union by
// episodeNumber ALONE, so the row count becomes the LONGEST season and whatever else the cluster holds
// shares rows with a season nobody asked for. Measured live 2026-08-31 through the same mechanism:
// 24 rows on a 14 episode season page.
//
// This source is UNKEYED, unlike tvdb, omdb and trakt which carry the same guard.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const episode = (season_num: number, episode_num: number) => ({
  content_id: `c-${season_num}-${episode_num}`,
  title: `S${season_num}E${episode_num}`,
  season_num,
  episode_num,
})

// misses are COLLECTED rather than thrown: the fetch swallows a rejection with `.catch(() => undefined)`
// and an empty result is exactly the absence these tests assert, so a drifted fixture would pass them
// while proving nothing.
const context = (episodes: ReturnType<typeof episode>[], misses: string[]) => ({
  fetch: async (url: string) => {
    if (url.includes('/shows/star-trek/xhr/episodes/')) {
      return { json: async () => ({ result: { data: episodes } }) }
    }
    misses.push(url)
    return { json: async () => ({}) }
  },
}) as never

const mediaFor = async (episodes: ReturnType<typeof episode>[]) => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'paramount:star-trek' } }, context(episodes, misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const media = value?.media as { uri?: string, episodes?: unknown[], episodeCount?: number } | null
  // a null media satisfies every `episodes ?? []` assertion below, so it is ruled out here once
  expect(media, 'the media itself must exist; only its episode list is ever refused').not.toBeNull()
  return media!
}

test('a show spanning several seasons contributes NO episode list', async () => {
  const media = await mediaFor([episode(1, 1), episode(1, 2), episode(2, 1), episode(2, 2)])

  expect(media.episodes ?? []).toEqual([])
  expect(media.episodeCount).toBeUndefined()
})

test('the media itself still exists, only its episode list is refused', async () => {
  const media = await mediaFor([episode(1, 1), episode(2, 1)])

  expect(media.uri).toBe('paramount:star-trek')
})

// The control, and the reason this is a check on the seasons present rather than a blanket refusal.
test('a show whose episodes are all one season keeps them', async () => {
  const media = await mediaFor([episode(1, 1), episode(1, 2), episode(1, 3)])

  expect(media.episodes).toHaveLength(3)
  expect(media.episodeCount).toBe(3)
})

// The slug is the show's, so the row lives in the CONTAINER identity space: a run that claims to be it
// is read by the store as PART_OF and unions nothing. This source mints no run at all, so the RUN
// control for the same stamp is unogs', whose film and season ids sit next to its bare series id.
test('the show slug is scoped CONTAINER', async () => {
  const media = await mediaFor([episode(1, 1), episode(2, 1)]) as { scope?: string }

  expect(media.scope, 'paramount:<slug> is the whole show').toBe('CONTAINER')
})
