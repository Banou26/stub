// `tvdb:<seriesId>` names the whole SERIES, and /series/<id>/episodes/default answers with every
// season at once. Every media in this store is one run, so `episodeNumber` is within-season, and
// flattening several seasons into one list collides them: db.ts hangs a HAS_EPISODE edge off this uri
// for each episode and `Media.episodes` groups the union by episodeNumber ALONE, so the row count
// becomes the LONGEST season and whatever else the cluster holds shares rows with a season nobody
// asked for. Measured live 2026-08-31 through the same mechanism: 24 rows on a 14 episode season page.
import { expect, test } from 'vitest'

import { resolvers, origin } from './extractor'
import { makeMedia } from '../utils'

const BASE = 'https://api4.thetvdb.com/v4'

// the two remote ids buildHandles maps, spelled the way HANDLE_ORIGINS reads them
const REMOTE_IDS = [{ id: 'tt0944947', sourceName: 'IMDB' }, { id: '1399', sourceName: 'TheMovieDB' }]

type Row = { uri?: string, scope?: string, handles: { node: { uri: string, scope?: string } }[], episodes?: unknown[], episodeCount?: number }

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
      return { ok: true, status: 200, json: async () => ({ data: { id: 121361, name: 'Game of Thrones', firstAired: '2011-04-17', remoteIds: REMOTE_IDS } }) }
    }
    if (url.startsWith(`${BASE}/search?query=`)) {
      return { ok: true, status: 200, json: async () => ({ data: [{ tvdb_id: '121361', name: 'Game of Thrones', remote_ids: REMOTE_IDS }] }) }
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
  const media = value?.media as Row | null
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

// `tvdb:<seriesId>` names the whole series and the imdb and tmdb ids on it are the series' too, so
// none of them may enter a run's identity space: the row and both bare handles go out CONTAINER.
test('the series row and its bare imdb and tmdb handles are scoped CONTAINER', async () => {
  const media = await mediaFor([episode(1, 1), episode(2, 1)])

  expect(media.scope).toBe('CONTAINER')
  const handles = media.handles.map(handle => handle.node)
  expect(handles.map(handle => handle.uri).sort()).toEqual(['imdb:tt0944947', 'tmdb:1399'])
  for (const handle of handles) expect(handle.scope, handle.uri).toBe('CONTAINER')
})

// Scope comes from the id's grammar, never from the episode list: one season so far is still the series.
test('a one-season series is still scoped CONTAINER', async () => {
  const media = await mediaFor([episode(1, 1), episode(1, 2)])

  expect(media.scope).toBe('CONTAINER')
})

// Search mints through its own normalizer, so it gets its own assertion.
test('a search hit is scoped CONTAINER with its handles', async () => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const { value } = await subscribe(undefined, { input: { search: 'game of thrones' } }, context([], misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const rows = value?.mediaPage?.nodes as Row[]

  expect(rows.map(row => row.uri)).toEqual(['tvdb:121361'])
  expect(rows[0]!.scope).toBe('CONTAINER')
  expect(rows[0]!.handles.map(handle => handle.node.uri).sort()).toEqual(['imdb:tt0944947', 'tmdb:1399'])
  for (const handle of rows[0]!.handles) expect(handle.node.scope, handle.node.uri).toBe('CONTAINER')
})

// TVDB mints no run at all (it reads /series/ only), so the RUN control is the helper's default: the
// stamp above is this source's, and the assertion would fail without it.
test('the helper defaults to RUN, so CONTAINER is this source saying so', () => {
  expect(makeMedia({ origin, id: '121361' }).scope).toBe('RUN')
})
