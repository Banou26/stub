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
import { getMedia, searchNodes } from './extractor'

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

// A SEASON-scoped media may never carry the SHOW's year. `normalizeTitle` stamps `${title.year}-01-01`,
// Netflix's year for the whole title, and until 2026-09-05 the season rewrite touched only the id.
//
// The damage is not inaccuracy, it is a WELD by a route that looks nothing like a date problem:
// `profileCluster` builds its `years` set from every member's startDate and `fuzzyMergeMediaClusters`
// buckets by year, so every season of a show landed in season 1's bucket, where a shared title is
// enough. Measured on production: `nf:80987039-3` carried 2021 and put Mushoku Tensei season 3 into
// season 1's bucket. tvmaze, appletv and tmdb each fixed this in their own file; this one was missed.
test('a season-scoped media asserts no start date, rather than the show year', async () => {
  const table = routes('70000005', 'series', [{ season: 1, episodes: 12 }, { season: 3, episodes: 14 }])
  const season = await getMedia('70000005', ctxFor(table), 3, true)

  expect(season?.uri).toBe('nf:70000005-3')
  expect(season?.startDate, "the show's year here buckets this run with season 1").toBeUndefined()
})

// The control: an unscoped browse still carries the show year, which is the only media it is true of.
// A run where both go quiet has removed the date everywhere rather than only where it lies.
test('the show-level media still carries the show year', async () => {
  const table = routes('70000006', 'series', [{ season: 1, episodes: 12 }, { season: 3, episodes: 14 }])
  const show = await getMedia('70000006', ctxFor(table), undefined, false)

  expect(show?.uri).toBe('nf:70000006')
  expect(show?.startDate, 'the only media the show year is true of').toBe('2021-01-01')
})

// A bare `nf:<netflixid>` is the whole Netflix TITLE. For a film that is exact, and for a series it
// names every season at once, which is the id that welds them. The search endpoint returns no season
// information, so there is nothing to scope a series with and the honest answer is to not offer it.
//
// Measured on the deployed site before this: searching "Mushoku Tensei" put `nf:80987039` inside season
// 1's cluster with no media page ever opened (scripts/reproduce-season-weld.mjs, ARM A). justwatch has
// refused seasonless series from its own search for the same reason since `showRequiresSeason`.
test('a search returns films and refuses series, which have no season here to be scoped by', async () => {
  const results = [
    { nfid: 70000010, title: 'A Show', vtype: 'series', synopsis: '', img: '', year: 2021 },
    { nfid: 70000011, title: 'A Film', vtype: 'movie', synopsis: '', img: '', year: 2021 },
  ]
  const table = {
    'https://unogs.com/api/user': { token: { access_token: 'test-token' } },
    [`${UNOGS}/search?limit=50&offset=0&query=anything&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`]: { results },
  }

  const nodes = await searchNodes('anything', ctxFor(table))

  expect(nodes.map(node => node.uri), 'the series id names every season of it at once').toEqual(['nf:70000011'])
})

// The control: a run where the film is dropped too has stopped the source contributing at all rather
// than stopping it lying, and nothing above would tell those apart.
test('a search of nothing but films still returns all of them', async () => {
  const results = [
    { nfid: 70000012, title: 'Film One', vtype: 'movie', synopsis: '', img: '', year: 2016 },
    { nfid: 70000013, title: 'Film Two', vtype: 'movie', synopsis: '', img: '', year: 2018 },
  ]
  const table = {
    'https://unogs.com/api/user': { token: { access_token: 'test-token' } },
    [`${UNOGS}/search?limit=50&offset=0&query=films&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`]: { results },
  }

  const nodes = await searchNodes('films', ctxFor(table))
  expect(nodes.map(node => node.uri)).toEqual(['nf:70000012', 'nf:70000013'])
})
