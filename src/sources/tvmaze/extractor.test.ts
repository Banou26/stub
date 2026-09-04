// A tvmaze id is a SHOW id: '52279' is every season of Mushoku Tensei at once, and it was fuzzy merged
// into season 1's cluster on the live site while season 3 asserted sameness through it. Only the
// '-s<n>' form names one run. So the bare row, the search row and the show's imdb handle all go out
// scoped CONTAINER, and the store keeps them out of every run's identity space.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const API = 'https://api.tvmaze.com'

const episode = (season: number, number: number) => ({ id: season * 100 + number, name: `S${season}E${number}`, season, number, airdate: `20${20 + season}-01-${String(number).padStart(2, '0')}` })

const SHOW = {
  id: 52279,
  url: 'https://www.tvmaze.com/shows/52279/mushoku-tensei-jobless-reincarnation',
  name: 'Mushoku Tensei: Jobless Reincarnation',
  premiered: '2021-01-11',
  externals: { imdb: 'tt13303712' },
  _embedded: { episodes: [episode(1, 1), episode(1, 2), episode(2, 1), episode(2, 2), episode(2, 3), episode(3, 1)] },
}

// a show tvmaze lists with NO episodes yet, so no season can be named for it
const EMPTY_SHOW = { id: 99, name: 'Announced Show', premiered: null, externals: { imdb: null }, _embedded: { episodes: [] } }

// misses are COLLECTED rather than thrown: `api` swallows a rejection with `.catch(() => undefined)`,
// so a drifted fixture would return no media and fail on a line that says nothing about the fixture.
const context = (misses: string[]) => ({
  key: () => undefined,
  fetch: async (url: string) => {
    if (url.startsWith(`${API}/shows/52279?embed=episodes`)) return { ok: true, status: 200, json: async () => SHOW }
    if (url.startsWith(`${API}/shows/99?embed=episodes`)) return { ok: true, status: 200, json: async () => EMPTY_SHOW }
    if (url.startsWith(`${API}/search/shows?q=`)) return { ok: true, status: 200, json: async () => [{ show: SHOW }] }
    misses.push(url)
    return { ok: false, status: 404, json: async () => ({}) }
  },
  // the empty show has no season to pick, so getMedia waits on the aggregated media; nothing arrives
  findAggregatedMedia: async () => undefined,
  listenForMediaChanges: async function* () {},
}) as never

type Row = { uri: string, scope?: string, handles: { relation: string, node: { uri: string, scope?: string } }[] }

const mediaFor = async (uri: string): Promise<Row> => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri } }, context(misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  expect(value?.media, 'the media itself must exist for its scope to mean anything').not.toBeNull()
  return value.media
}

const searchRows = async (): Promise<Row[]> => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const { value } = await subscribe(undefined, { input: { search: 'mushoku' } }, context(misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  return value.mediaPage.nodes
}

test('a season-scoped media is a RUN', async () => {
  const media = await mediaFor('tvmaze:52279-s3')

  expect(media.uri).toBe('tvmaze:52279-s3')
  expect(media.scope).toBe('RUN')
})

test('the imdb handle is the SHOW\'s id, so it is a CONTAINER even on a run', async () => {
  const media = await mediaFor('tvmaze:52279-s3')

  const imdb = media.handles.find(handle => handle.node.uri === 'imdb:tt13303712')
  expect(imdb, 'the fixture carries an imdb external, so the handle must be minted').toBeDefined()
  expect(imdb!.node.scope).toBe('CONTAINER')
})

test('a search row carries the bare show id and is a CONTAINER', async () => {
  const rows = await searchRows()

  expect(rows.map(row => row.uri)).toEqual(['tvmaze:52279'])
  expect(rows[0]!.scope).toBe('CONTAINER')
  expect(rows[0]!.handles.map(handle => handle.node.scope)).toEqual(['CONTAINER'])
})

// getMedia hands back the bare id when the show has no season to pick (no episodes at all), so the
// media path can mint a show-level row too, and it has to say so.
test('a media-path row that falls back to the bare show id is a CONTAINER', async () => {
  const media = await mediaFor('tvmaze:99')

  expect(media.uri).toBe('tvmaze:99')
  expect(media.scope).toBe('CONTAINER')
})
