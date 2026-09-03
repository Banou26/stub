// Watchmode's source rows are provider deep links, and the id used to be read as
// `new URL(webUrl).pathname.split('/').filter(Boolean).at(-1)`: a positional read with no shape test.
// The last path segment is the id for almost none of these hosts.
//
//   watch.amazon.com/detail?gti=<id>     pathname '/detail', so EVERY Amazon title minted `amazon:detail`
//   crunchyroll.com/series/<id>/<slug>   the last segment is the SLUG, shared by every run of the show
//   hulu.com/series/<uuid>               a container uuid, shared by every season
//
// It now reads through justwatch/id.ts's `extractContentId`, which shape tests per host, and then
// `providerContentId`, which refuses crunchyroll outright. This file also has no season concept
// anywhere in it, which is why no season number is passed and the crunchyroll refusal fires.
//
// And every id that survives is minted PART_OF, because a watchmode record IS the show: `nf:80987039`
// off one names the Netflix title, not this run. That relation is what let the source be plugged back
// in at all, so it is asserted here rather than left implied.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const API = 'https://api.watchmode.com/v1'

const source = (web_url: string) => ({ source_id: 1, name: 'x', type: 'sub', region: 'US', web_url })

const context = (sources: { web_url: string }[], detail: Record<string, unknown> = {}) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    if (url.startsWith(`${API}/title/345/details/`)) {
      return { json: async () => ({ id: 345, title: 'A Show', type: 'tv_series', imdb_id: 'tt1234567', tmdb_id: 550, tmdb_type: 'tv', ...detail }) }
    }
    if (url.startsWith(`${API}/title/345/sources/`)) return { json: async () => sources }
    throw new Error(`fixture has no route for ${url}`)
  },
}) as never

const edgesFor = async (sources: { web_url: string }[], detail?: Record<string, unknown>) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'watchmode:345' } }, context(sources, detail)).next()
  return (value?.media?.handles ?? []) as { relation: string, node: { uri: string, origin: string, id: string } }[]
}

// Most assertions here are about WHICH ids get minted, so they read the nodes. The relation is asserted
// on its own, below, because it is what let this source be plugged back in.
const handlesFor = async (sources: { web_url: string }[], detail?: Record<string, unknown>) =>
  (await edgesFor(sources, detail)).map(handle => handle.node)

test('every handle it mints is PART_OF, never SAME_AS', async () => {
  const edges = await edgesFor([source('https://www.netflix.com/title/80987039')])

  expect(edges.length, 'control: it must mint something, or the assertion below is vacuous').toBeGreaterThan(0)
  expect([...new Set(edges.map(edge => edge.relation))]).toEqual(['PART_OF'])
})

// The weld with the widest blast radius: one handle for every Amazon title Watchmode has ever listed.
test('an amazon deep link yields its gti, never the literal word "detail"', async () => {
  const handles = await handlesFor([
    source('https://watch.amazon.com/detail?gti=amzn1.dv.gti.80d4a3ed-21d5-4ed1-b3f4-054b29da3ec2'),
  ])

  expect(handles.map(handle => handle.uri)).not.toContain('amazon:detail')
  expect(handles.map(handle => handle.id)).toContain('amzn1.dv.gti.80d4a3ed-21d5-4ed1-b3f4-054b29da3ec2')
})

// Two different Amazon titles must not collapse onto one handle, which is what the old read did to
// every single one of them.
test('two different amazon titles do not share a handle', async () => {
  const first = await handlesFor([source('https://watch.amazon.com/detail?gti=amzn1.dv.gti.AAA')])
  const second = await handlesFor([source('https://watch.amazon.com/detail?gti=amzn1.dv.gti.BBB')])

  const shared = first.map(h => h.uri).filter(uri => second.map(h => h.uri).includes(uri) && uri.startsWith('amazon:'))
  expect(shared).toEqual([])
})

// A crunchyroll series url names the show, and on Crunchyroll it names the show's films too. There is
// no season number here to scope it with, so providerContentId refuses it outright.
test('a crunchyroll series link mints nothing, neither the slug nor the series id', async () => {
  const handles = await handlesFor([
    source('https://www.crunchyroll.com/series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba'),
  ])

  expect(handles.map(handle => handle.id)).not.toContain('demon-slayer-kimetsu-no-yaiba')
  expect(handles.filter(handle => handle.origin === 'cr')).toEqual([])
})

// The fallback used to mint the WATCHMODE title id under the provider's origin, asserting an id from
// one space inside another. Netflix ids are integers too, so `nf:345` can name a real, unrelated title.
test('a url with no readable id mints nothing, never the watchmode id', async () => {
  const handles = await handlesFor([source('https://www.netflix.com/browse')])

  expect(handles.map(handle => handle.uri)).not.toContain('nf:345')
  expect(handles.filter(handle => handle.origin === 'nf')).toEqual([])
})

// tmdb, and the two cases fail differently, which is why one survives as PART_OF and one does not.
//
// A TV id names the SHOW, so PART_OF is exactly true: this record is part of that. A MOVIE id is in a
// DIFFERENT SEQUENCE that also starts at 1, measured 2026-09-04: themoviedb.org/movie/550 is Fight Club
// and /tv/550 is Till Death Us Do Part. Stub's uri is `tmdb:550` for both, so a PART_OF there would
// point at the wrong ROW, which is not a weaker claim but a wrong one.
test('a tmdb tv id is kept as PART_OF, and a tmdb movie id is refused outright', async () => {
  const series = await edgesFor([], { tmdb_type: 'tv' })
  const tmdbEdge = series.find(edge => edge.node.origin === 'tmdb')
  expect(tmdbEdge?.node.id).toBe('550')
  expect(tmdbEdge?.relation).toBe('PART_OF')

  const film = await handlesFor([], { tmdb_type: 'movie' })
  expect(film.filter(handle => handle.origin === 'tmdb')).toEqual([])
})

// The control. imdb survives because worker/store/db.ts declines to LINK a show-level origin, so it is
// carried without being asserted, and a netflix title id reads correctly off its own url shape. A run
// where these vanish too has broken the source rather than fixed the weld.
test('imdb and a readable netflix id are still minted', async () => {
  const handles = await handlesFor([source('https://www.netflix.com/title/80987039')])

  expect(handles.map(handle => handle.uri)).toContain('imdb:tt1234567')
  expect(handles.map(handle => handle.uri)).toContain('nf:80987039')
})
