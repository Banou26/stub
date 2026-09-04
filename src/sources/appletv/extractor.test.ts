// One stub media is one run, and Apple TV's bare content id is the id every season of a show shares.
// A row minted from that id names the show, so it goes out scoped CONTAINER and the store keeps it out
// of every run's identity space: the unscoped search row is exactly the shape that welded runs of one
// show together when it reached graph.link as a run. A film and a season-scoped row each name one run.
import { expect, test } from 'vitest'

import type { ExtractorServerContext } from '../../worker/extractor'
import { resolvers } from './extractor'

const ATV = 'https://uts-api.itunes.apple.com/uts/v3'
const PARAMS = 'caller=web&sf=143441&v=58&pfm=web&locale=en-US&utsk=0'
const url = (path: string) => `${ATV}${path}${path.includes('?') ? '&' : '?'}${PARAMS}`

// throws on an unlisted url, so fixture drift fails loudly instead of reading as an empty answer
const ctxFor = (table: Record<string, unknown>): ExtractorServerContext => ({
  fetch: (async (input: string) => {
    const key = typeof input === 'string' ? input : String(input)
    if (!(key in table)) throw new Error(`unstubbed url: ${key}`)
    return { json: async () => table[key], ok: true, status: 200 }
  }) as unknown as ExtractorServerContext['fetch'],
} as unknown as ExtractorServerContext)

const subscriptions = resolvers.Subscription as any

const first = async (iterator: AsyncIterator<any>): Promise<any> => (await iterator.next()).value

const searchPage = async (term: string, items: unknown[]) => {
  const ctx = ctxFor({ [url(`/search?searchTerm=${encodeURIComponent(term)}`)]: { data: { canvas: { shelves: [{ items }] } } } })
  const result = await first(subscriptions.mediaPage.subscribe(undefined, { input: { search: term } }, ctx))
  return result.mediaPage.nodes
}

const resolveMedia = async (uri: string, table: Record<string, unknown>) => {
  const result = await first(subscriptions.media.subscribe(undefined, { input: { uri } }, ctxFor(table)))
  return result.media
}

const SHOW = 'umc.cmc.show'
const SEASON_1 = 'umc.cmc.show.season1'
const SEASON_2 = 'umc.cmc.show.season2'

const showRoutes = () => ({
  [url(`/shows/${SHOW}`)]: {
    data: {
      content: { id: SHOW, type: 'Show', title: 'A Show', releaseDate: Date.UTC(2021, 0, 11) },
      seasons: {
        [SEASON_1]: { id: SEASON_1, seasonNumber: 1, releaseDate: Date.UTC(2021, 0, 11) },
        [SEASON_2]: { id: SEASON_2, seasonNumber: 2, releaseDate: Date.UTC(2023, 3, 3) },
      },
    },
  },
  [url(`/shows/${SHOW}/episodes?selectedSeasonId=${SEASON_2}`)]: {
    data: { episodes: [{ id: 'ep-2-1', title: 'S2E1', seasonNumber: 2, episodeNumber: 1 }] },
  },
})

test('a search row for a Show carries the id every season shares, so it is a CONTAINER', async () => {
  const nodes = await searchPage('A Show', [{ id: SHOW, type: 'Show', title: 'A Show' }])

  expect(nodes.map((node: any) => node.uri)).toEqual([`appletv:${SHOW}`])
  expect(nodes[0].scope, 'the bare show id names every run of the show at once').toBe('CONTAINER')
})

// The controls. A film has no seasons to be confused between, and a season-scoped row names one
// season only; a run where either of those read CONTAINER has stamped everything rather than the show.
test('a search row for a Movie names one run', async () => {
  const nodes = await searchPage('A Film', [{ id: 'umc.cmc.film', type: 'Movie', title: 'A Film' }])

  expect(nodes.map((node: any) => node.uri)).toEqual(['appletv:umc.cmc.film'])
  expect(nodes[0].scope).toBe('RUN')
})

test('a season-scoped media names one run, and attaches only that season', async () => {
  const media = await resolveMedia(`appletv:${SHOW}-s2`, showRoutes())

  expect(media?.uri).toBe(`appletv:${SHOW}-s2`)
  expect(media?.scope).toBe('RUN')
  expect(media?.episodeCount).toBe(1)
})

test('a movie resolved by id names one run', async () => {
  const media = await resolveMedia('appletv:umc.cmc.film', {
    [url('/shows/umc.cmc.film')]: { code: 404, title: 'NotFound', message: 'show not found' },
    [url('/movies/umc.cmc.film')]: { data: { content: { id: 'umc.cmc.film', type: 'Movie', title: 'A Film', releaseDate: Date.UTC(2020, 5, 1) } } },
  })

  expect(media?.uri).toBe('appletv:umc.cmc.film')
  expect(media?.scope).toBe('RUN')
  expect(media?.episodeCount).toBe(1)
})
