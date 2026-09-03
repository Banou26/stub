// Simkl keeps a SEPARATE record per run of an anime, which is what stub wants, and then puts the
// SHOW's tmdb id on every one of them. Measured live: all five Mushoku Tensei runs carry
// `tmdb:94664`. A handle is an identity claim, so minting it says the five runs are one media, and
// `upsertMedia` unions them at insert time. Simkl's own `season` field cannot scope it either: it is
// null on the first runs and repeats `2` across three of them.
//
// A movie record is no better and fails differently. TMDB numbers movies and tv shows in separate
// sequences that both start at 1, measured 2026-09-04: themoviedb.org/movie/550 is Fight Club and
// /tv/550 is Till Death Us Do Part. Stub's uri is `tmdb:550` for both.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const API = 'https://api.simkl.com'

// the id block simkl really publishes on an anime run, trimmed to what buildHandles reads
const IDS = { simkl: 1080329, imdb: 'tt13303712', tmdb: '94664', mal: '39535', anilist: '108465', kitsu: '42323' }

const context = (type: 'anime' | 'movies', ids: Record<string, unknown> = IDS) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    const detail = `${API}/${type === 'movies' ? 'movies' : 'anime'}/1080329?extended=full`
    if (url === detail) {
      return {
        json: async () => ({
          title: 'Mushoku Tensei: Jobless Reincarnation',
          ids,
          first_aired: '2021-01-11',
        }),
      }
    }
    // every other detail path is a miss, which is how getMedia walks tv -> anime -> movies
    if (url.startsWith(`${API}/tv/`) || url.startsWith(`${API}/anime/`) || url.startsWith(`${API}/movies/`)) {
      return { json: async () => undefined }
    }
    if (url.startsWith(`${API}/anime/episodes/`) || url.startsWith(`${API}/tv/episodes/`)) {
      return { json: async () => [] }
    }
    throw new Error(`fixture has no route for ${url}`)
  },
}) as never

const handlesFor = async (type: 'anime' | 'movies', ids?: Record<string, unknown>) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'simkl:1080329' } }, context(type, ids)).next()
  // handles are edges now: { node, relation }. These assertions are about WHICH ids get minted, so
  // they read the nodes; the relation each one carries is asserted where it is the point.
  return ((value?.media?.handles ?? []) as { node: { uri: string, origin: string, id: string } }[])
    .map(handle => handle.node)
}

test('an anime run does not mint the show-level tmdb id it carries', async () => {
  const handles = await handlesFor('anime')

  expect(handles.map(handle => handle.uri)).not.toContain('tmdb:94664')
  expect(handles.filter(handle => handle.origin === 'tmdb')).toEqual([])
})

// A film's tmdb id is in a different sequence from a series', and stub's uri cannot tell them apart,
// so this one is refused for a reason the anime case does not share. Both refusals are the same line.
test('a movie does not mint its tmdb id either, the sequences being separate', async () => {
  const handles = await handlesFor('movies', { ...IDS, tmdb: '550' })

  expect(handles.map(handle => handle.uri)).not.toContain('tmdb:550')
  expect(handles.filter(handle => handle.origin === 'tmdb')).toEqual([])
})

// The control, and the reason this is a refusal of ONE origin rather than of simkl's id block. Every
// other id simkl publishes is per-run and clusters correctly, so a run where these vanish too has
// broken the source rather than fixed the weld.
test('every other id simkl publishes is still minted', async () => {
  const uris = (await handlesFor('anime')).map(handle => handle.uri)

  expect(uris).toContain('mal:39535')
  expect(uris).toContain('anilist:108465')
  expect(uris).toContain('kitsu:42323')
  expect(uris).toContain('imdb:tt13303712')
})
