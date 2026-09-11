// `trakt:<slug>` names the whole SHOW, and `fetchEpisodes` flatMaps EVERY season of it into one list.
// Every media in this store is one run, so `episodeNumber` is within-season, and flattening several
// seasons collides them: store/db.ts hangs a HAS_EPISODE edge off this uri for each and
// `Media.episodes` groups the union by episodeNumber ALONE, so the row count becomes the LONGEST
// season and whatever else the cluster holds shares rows with a season nobody asked for. Measured live
// 2026-08-31 through the same mechanism: 24 rows on a 14 episode season page.
import { expect, test } from 'vitest'

import { resolvers, origin } from '../../../../src/sources/trakt/extractor'
import { makeMedia } from '../../../../src/sources/utils'

const BASE = 'https://api.trakt.tv'

const season = (number: number, episodes: number) => ({
  number,
  episodes: Array.from({ length: episodes }, (_, i) => ({ number: i + 1, title: `S${number}E${i + 1}`, ids: { trakt: number * 100 + i } })),
})

// One season whose episodes carry the dates given, or no date at all where one is undefined. Built
// through a function so the extra field is not an excess property on a literal.
const datedSeason = (dates: readonly (string | undefined)[]) => ({
  number: 1,
  episodes: dates.map((first_aired, i) => ({
    number: i + 1,
    title: `S1E${i + 1}`,
    ids: { trakt: i },
    ...first_aired ? { first_aired } : {},
  })),
})

// misses are COLLECTED rather than thrown: `api` swallows a rejection with `.catch(() => undefined)`
// and an empty list is exactly the absence these tests assert, so a drifted fixture would pass them
// while proving nothing.
const context = (seasons: readonly object[], misses: string[]) => ({
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

const mediaFor = async (seasons: readonly object[]) => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'trakt:breaking-bad' } }, context(seasons, misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  const media = value?.media as { uri?: string, scope?: string, handles: { node: { uri: string, scope?: string } }[], episodes?: { releaseDate?: string }[], episodeCount?: number } | null
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

// `trakt:<slug>` names the show, and the imdb and tmdb ids on it are the show's too: the same three
// ids come back for every season of Breaking Bad. None of them may enter a run's identity space, so
// the row and both bare handles go out scoped CONTAINER. The tmdb one matters most, because tmdb is not
// in the store's show-level backstop and a bare tmdb tv id has welded seasons on the live site.
test('the show row and its bare imdb and tmdb handles are scoped CONTAINER', async () => {
  const media = await mediaFor([season(1, 7), season(2, 13)])

  expect(media.scope).toBe('CONTAINER')
  const handles = media.handles.map(handle => handle.node)
  expect(handles.map(handle => handle.uri).sort()).toEqual(['imdb:tt0903747', 'tmdb:1396'])
  for (const handle of handles) expect(handle.scope, handle.uri).toBe('CONTAINER')
})

// Scope comes from the id's grammar, never from the episode list: a show with one season so far is
// still the show, and its next season will carry the same three ids.
test('a one-season show is still scoped CONTAINER', async () => {
  const media = await mediaFor([season(1, 7)])

  expect(media.scope).toBe('CONTAINER')
  for (const handle of media.handles) expect(handle.node.scope, handle.node.uri).toBe('CONTAINER')
})

// THE EPISODE DATE. Trakt fetched `first_aired` and dropped it, so this source contributed nothing to
// the date alignment `store/consensus.ts` pairs episodes by. `first_aired` is an INSTANT and goes out
// as one; an episode trakt has no date for gets none.
test('an episode carries trakt\'s first_aired as the instant it names', async () => {
  const media = await mediaFor([datedSeason(['2008-01-21T02:00:00.000Z', undefined])])

  expect((media.episodes ?? []).map(episode => episode.releaseDate)).toEqual(['2008-01-21T02:00:00.000Z', undefined])
})

test('an episode trakt has no date for carries none', async () => {
  const media = await mediaFor([datedSeason([undefined])])

  expect((media.episodes ?? [])[0]!.releaseDate, 'a missing date is left missing, never invented').toBeUndefined()
})

// A DAY IS NOT AN INSTANT, and parsing one into an instant is the whole trap: `2008-01-21` parsed and
// re-emitted is midnight UTC, which utils/release-date.ts then renders in local time, showing the 20th
// everywhere west of Greenwich. A value already naming a day therefore comes out unchanged.
test('a day-shaped first_aired stays a day', async () => {
  const media = await mediaFor([datedSeason(['2008-01-21'])])

  expect((media.episodes ?? []).map(episode => episode.releaseDate)).toEqual(['2008-01-21'])
})

// Trakt mints no run at all (it reads /shows/ only), so the RUN control is the helper's default: the
// stamp above is this source's, and the assertion would fail without it.
test('the helper defaults to RUN, so CONTAINER is this source saying so', () => {
  expect(makeMedia({ origin, id: 'breaking-bad' }).scope).toBe('RUN')
})
