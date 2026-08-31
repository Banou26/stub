// A Netflix id with no season names the WHOLE title, and stub has no such thing: every media here is
// one run. This source resolves which Netflix season is ours and scopes the uri to it, but when it
// cannot, the answer has to be nothing rather than the show.
//
// It used to be the show. `resolveSeasonNumber` returning undefined fell straight through to
// `getMedia(id, ctx, undefined)`, which skipped the suffix and left the bare `nf:<showId>`, attached
// every season's episodes, and let the caller link the cluster's handles to it. Two runs of one show
// that both failed to resolve then carried the identical uri and union-find welded them, with no
// inverse. Measured over 33 multi-season Netflix series and 105 runs, that path was 30 of 41 welds.
import { expect, test } from 'vitest'

import type { ExtractorServerContext } from '../../worker/extractor'
import { getMedia } from './extractor'

const UNOGS = 'https://unogs.com/api'

type Season = { season: number, episodes: number }

const routes = (id: string, vtype: 'series' | 'movie', seasons: Season[]) => ({
  'https://unogs.com/api/user': { token: { access_token: 'test-token' } },
  [`${UNOGS}/title/detail?netflixid=${id}`]: [{
    netflixid: Number(id),
    title: 'A Show',
    vtype,
    synopsis: 'A show.',
    year: '2021',
    img: '',
    runtime: '',
    avgrating: '',
    top250: 0,
    top250tv: 0,
    poster: '',
    clist: '',
    imdbid: '',
  }],
  [`${UNOGS}/title/bgimages?netflixid=${id}`]: {},
  [`${UNOGS}/title/episodes?netflixid=${id}`]: seasons.map(season => ({
    season: season.season,
    episodes: Array.from({ length: season.episodes }, (_, index) => ({
      epid: `${id}-s${season.season}e${index + 1}`,
      episode: index + 1,
      title: `S${season.season}E${index + 1}`,
      synopsis: '',
      runtime: '',
      img: '',
    })),
  })),
})

// throws on an unlisted url, so fixture drift fails loudly instead of returning undefined and being
// read as "the source had nothing to say"
const ctxFor = (table: Record<string, unknown>): ExtractorServerContext => ({
  fetch: (async (url: string) => {
    const key = typeof url === 'string' ? url : String(url)
    if (!(key in table)) throw new Error(`unstubbed url: ${key}`)
    return { json: async () => table[key], ok: true, status: 200 }
  }) as unknown as ExtractorServerContext['fetch'],
} as unknown as ExtractorServerContext)

test('a series whose season could not be resolved mints NOTHING, not the show', async () => {
  const table = routes('70000001', 'series', [{ season: 1, episodes: 12 }, { season: 2, episodes: 13 }])
  const media = await getMedia('70000001', ctxFor(table), undefined, true)
  expect(media, 'a show-level media here is the uri that welds every run of the show').toBeUndefined()
})

test('a resolved season is scoped to that season and carries only its episodes', async () => {
  const table = routes('70000002', 'series', [{ season: 1, episodes: 12 }, { season: 2, episodes: 13 }])
  const media = await getMedia('70000002', ctxFor(table), 2, true)
  expect(media?.uri).toBe('nf:70000002-2')
  expect(media?.episodeCount, 'season 2 has 13, the union of both would be 25').toBe(13)
})

test('a movie is unaffected, having no season to be confused between', async () => {
  const table = routes('70000003', 'movie', [])
  const media = await getMedia('70000003', ctxFor(table), undefined, true)
  expect(media?.uri).toBe('nf:70000003')
  expect(media?.episodeCount).toBe(1)
})

// The direct-browse path attaches no cluster handles, so it cannot weld and must keep working: the
// user naming a Netflix title is entitled to see it even when no run of ours matches a season.
test('without requireSeason the show-level media is still returned, for a direct browse', async () => {
  const table = routes('70000004', 'series', [{ season: 1, episodes: 12 }, { season: 2, episodes: 13 }])
  const media = await getMedia('70000004', ctxFor(table), undefined, false)
  expect(media?.uri).toBe('nf:70000004')
})
