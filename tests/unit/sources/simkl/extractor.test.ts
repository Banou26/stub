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

import { resolvers } from '../../../../src/sources/simkl/extractor'

const API = 'https://api.simkl.com'

// the id block simkl really publishes on an anime run, trimmed to what buildHandles reads
const IDS = { simkl: 1080329, imdb: 'tt13303712', tmdb: '94664', mal: '39535', anilist: '108465', kitsu: '42323' }

type Row = { uri?: string, scope?: string, handles: { node: { uri: string, origin: string, id: string, scope?: string } }[] }

const context = (type: 'tv' | 'anime' | 'movies', ids: Record<string, unknown> = IDS) => ({
  key: () => 'test-key',
  fetch: async (url: string) => {
    const detail = `${API}/${type}/1080329?extended=full`
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

const mediaFor = async (type: 'tv' | 'anime' | 'movies', ids?: Record<string, unknown>) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'simkl:1080329' } }, context(type, ids)).next()
  const media = value?.media as Row | null
  expect(media, 'the media itself must exist').not.toBeNull()
  return media!
}

const handlesFor = async (type: 'anime' | 'movies', ids?: Record<string, unknown>) =>
  // handles are edges now: { node, relation }. These assertions are about WHICH ids get minted, so
  // they read the nodes; the relation each one carries is asserted where it is the point.
  (await mediaFor(type, ids)).handles.map(handle => handle.node)

const handle = (media: Row, origin: string) => {
  const found = media.handles.map(handle => handle.node).find(node => node.origin === origin)
  expect(found, `no ${origin} handle was minted`).toBeDefined()
  return found!
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

// Scope, from simkl's own grammar. A tv record is one SHOW with every season under it (the episodes
// endpoint answers with a season field), so the row is a container and the imdb id on it is the
// show's. An anime record is one RUN, which is the reason simkl is worth reading at all: Mushoku
// Tensei is five records here, each with its own mal, anilist and kitsu id, while the imdb id on all
// five is the one show-level tt13303712.
test('a tv record is a show, so its row and imdb handle are scoped CONTAINER', async () => {
  const media = await mediaFor('tv', { simkl: 1080329, imdb: 'tt0903747' })

  expect(media.scope).toBe('CONTAINER')
  expect(handle(media, 'imdb').scope).toBe('CONTAINER')
})

test('an anime record is one run: RUN row, RUN mal/anilist/kitsu, CONTAINER imdb', async () => {
  const media = await mediaFor('anime')

  expect(media.scope).toBe('RUN')
  expect(handle(media, 'mal').scope).toBe('RUN')
  expect(handle(media, 'anilist').scope).toBe('RUN')
  expect(handle(media, 'kitsu').scope).toBe('RUN')
  expect(handle(media, 'imdb').scope).toBe('CONTAINER')
})

// A film is a run and its imdb id names the film itself, so nothing on a movie is a container.
test('a movie is a run and its imdb handle follows it', async () => {
  const media = await mediaFor('movies', { simkl: 1080329, imdb: 'tt0137523' })

  expect(media.scope).toBe('RUN')
  expect(handle(media, 'imdb').scope).toBe('RUN')
})

// Search mints through its own normalizer, keyed on endpoint_type, so it gets its own assertion.
test('search rows are scoped by endpoint_type the same way', async () => {
  const entries: Record<string, unknown[]> = {
    tv: [{ title: 'Breaking Bad', endpoint_type: 'tv', ids: { simkl: 1, imdb: 'tt0903747' } }],
    anime: [{ title: 'Mushoku Tensei', endpoint_type: 'anime', ids: { simkl: 2, imdb: 'tt13303712', mal: '39535' } }],
    movie: [{ title: 'Fight Club', endpoint_type: 'movies', ids: { simkl: 3, imdb: 'tt0137523' } }],
  }
  const ctx = {
    key: () => 'test-key',
    fetch: async (url: string) => {
      const segment = url.match(/\/search\/(tv|anime|movie)\?/)?.[1]
      if (!segment) throw new Error(`fixture has no route for ${url}`)
      return { json: async () => entries[segment] }
    },
  } as never
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const { value } = await subscribe(undefined, { input: { search: 'x' } }, ctx).next()
  const rows = value?.mediaPage?.nodes as Row[]
  const byId = Object.fromEntries(rows.map(row => [row.uri, row]))

  expect(byId['simkl:1']!.scope).toBe('CONTAINER')
  expect(handle(byId['simkl:1']!, 'imdb').scope).toBe('CONTAINER')
  expect(byId['simkl:2']!.scope).toBe('RUN')
  expect(handle(byId['simkl:2']!, 'mal').scope).toBe('RUN')
  expect(handle(byId['simkl:2']!, 'imdb').scope).toBe('CONTAINER')
  expect(byId['simkl:3']!.scope).toBe('RUN')
  expect(handle(byId['simkl:3']!, 'imdb').scope).toBe('RUN')
})
