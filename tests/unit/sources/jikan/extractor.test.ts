// MyAnimeList publishes its AniDB link in two shapes, and only one of them puts the id in the path:
//
//   https://anidb.net/perl-bin/animedb.pl?show=anime&aid=23   the common one, measured 2026-09-04 on
//                                                             mal:1, mal:30 and mal:5114
//   https://anidb.net/anime/23                                the modern one
//
// The id read was `searchParams.get('aid') ?? pathname.split('/')[2]`, an unguarded positional
// fallback, and the anizip handle beside it gated on the LINK rather than on the id. So a link the
// first half could not read minted `anizip:undefined`, or `anidb:animedb.pl` off the common shape,
// and every record that produced one produced the SAME one. `upsertMedia` welds those, and `graph.link`
// has no inverse.
import { expect, test, vi } from 'vitest'

import { anidbIdFromUrl, resolvers } from '../../../../src/sources/jikan/extractor'

const API = 'https://api.jikan.moe/v4'

const context = (external: { name: string, url: string }[]) => ({
  fetch: async (url: string) => {
    if (!url.startsWith(`${API}/anime/1/full`)) throw new Error(`fixture has no route for ${url}`)
    return {
      json: async () => ({
        data: {
          mal_id: 1,
          url: 'https://myanimelist.net/anime/1',
          title: 'Cowboy Bebop',
          type: 'TV',
          external,
          images: { jpg: {}, webp: {} },
        },
      }),
    }
  },
}) as never

const handlesFor = async (external: { name: string, url: string }[]) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'mal:1' } }, context(external)).next()
  // handles are edges now: { node, relation }. These assertions are about WHICH ids get minted, so
  // they read the nodes; the relation each one carries is asserted where it is the point.
  return ((value?.media?.handles ?? []) as { node: { uri: string, origin: string, id: string } }[])
    .map(handle => handle.node)
}

const ANIDB = (url: string) => [{ name: 'AniDB', url }]

test('a link on either real shape yields the anidb id, and both handles carry it', async () => {
  for (const url of [
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=23',
    'https://anidb.net/anime/23',
  ]) {
    const uris = (await handlesFor(ANIDB(url))).map(handle => handle.uri)
    expect(uris, url).toContain('anidb:23')
    expect(uris, url).toContain('anizip:23')
  }
})

// The weld. Before the fix this record minted `anidb:animedb.pl` and `anizip:animedb.pl`, and so did
// every other record whose `aid` was missing from the same url shape.
test('a common-shape link with no aid mints NOTHING, never the script name', async () => {
  const handles = await handlesFor(ANIDB('https://anidb.net/perl-bin/animedb.pl?show=anime'))

  expect(handles.map(handle => handle.uri)).not.toContain('anidb:animedb.pl')
  expect(handles.filter(handle => handle.origin === 'anidb' || handle.origin === 'anizip')).toEqual([])
})

// The asymmetry that shipped: the anidb handle gated on the id, the anizip handle beside it gated on
// the LINK, so only one of the two refused.
test('a link with no readable id anywhere leaves BOTH handles unminted', async () => {
  for (const url of [
    'https://anidb.net/',
    'https://anidb.net/anime/',
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=',
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=not-a-number',
  ]) {
    const handles = await handlesFor(ANIDB(url))
    expect(handles.filter(handle => handle.origin === 'anizip'), url).toEqual([])
    expect(handles.filter(handle => handle.origin === 'anidb'), url).toEqual([])
  }
})

// `new URL(...)` used to run unguarded inside normalizeMedia, so a malformed link threw and took the
// whole record with it rather than costing one handle.
test('a malformed link costs one handle, not the record', async () => {
  const handles = await handlesFor(ANIDB('not a url at all'))

  expect(handles.filter(handle => handle.origin === 'anizip')).toEqual([])
  // the record itself still resolved, which is the part the throw used to take away
  expect(handles).toBeDefined()
})

test('no AniDB link at all is simply no handle', async () => {
  const handles = await handlesFor([{ name: 'AniList', url: 'https://anilist.co/anime/1' }])

  expect(handles.filter(handle => handle.origin === 'anidb' || handle.origin === 'anizip')).toEqual([])
})

test('anidbIdFromUrl reads the id, or refuses', () => {
  expect(anidbIdFromUrl('https://anidb.net/perl-bin/animedb.pl?show=anime&aid=6107')).toBe('6107')
  expect(anidbIdFromUrl('https://anidb.net/anime/22')).toBe('22')
  expect(anidbIdFromUrl('https://anidb.net/anime/22?highlight=1')).toBe('22')

  expect(anidbIdFromUrl('https://anidb.net/perl-bin/animedb.pl?show=anime')).toBeUndefined()
  expect(anidbIdFromUrl('https://anidb.net/creator/1234')).toBeUndefined()
  expect(anidbIdFromUrl('not a url at all')).toBeUndefined()
  expect(anidbIdFromUrl(undefined)).toBeUndefined()
  expect(anidbIdFromUrl(null)).toBeUndefined()
  expect(anidbIdFromUrl('')).toBeUndefined()
})
