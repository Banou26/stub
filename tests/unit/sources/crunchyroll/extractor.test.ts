// A Crunchyroll id with no season component names the SHOW, and a show has no honest episode list in
// a store where every media is one season. Asking for one used to answer with every season's episodes
// at once, each carrying a WITHIN-season `episodeNumber`, which is how the Mushoku Tensei season 3
// page came to list 24 rows for a 14 episode season (measured on the live site 2026-08-31: rows 1 to
// 10 correct, row 11 an AniZip season 3 title over a season 1 description, rows 12 to 24 season 1).
//
// The bare handle reached that cluster from Kitsu, which publishes the show's Crunchyroll link on
// every season record. That half is pinned in tests/unit/sources/kitsu/stream-id.test.ts. This file pins the other
// half: even handed a show-level id, this source must not hand back a show's worth of episodes.
import { beforeEach, expect, test, vi } from 'vitest'

import { getMedia, resetCrunchyrollCaches, resolvers } from '../../../../src/sources/crunchyroll/extractor'

const CMS = 'https://www.crunchyroll.com/content/v2/cms'

type Season = { id: string, seasonNumber: number, episodes: number, airDate?: string }

// Crunchyroll's own shape, trimmed to the fields getMedia reads. The three season lengths are what
// make the count observable: grouped by episodeNumber alone the union is max(23, 24, 14) = 24, which
// is the reported symptom, so a fixture where every season were the same length could not show it.
const series = (id: string, seasons: Season[]) => ({
  [`${CMS}/series/${id}?preferred_audio_language=ja-JP&locale=en-US`]: {
    data: [{ id, title: 'Mushoku Tensei', slug_title: 'mushoku-tensei', description: 'A show.', images: {} }]
  },
  [`${CMS}/series/${id}/seasons?force_locale=&preferred_audio_language=ja-JP&locale=en-US`]: {
    data: seasons.map(season => ({
      id: season.id,
      title: `Season ${season.seasonNumber}`,
      description: `Season ${season.seasonNumber} of the show.`,
      audio_locale: 'ja-JP',
    }))
  },
  ...Object.fromEntries(seasons.map(season => [
    `${CMS}/seasons/${season.id}/episodes?preferred_audio_language=ja-JP&locale=en-US`,
    {
      data: Array.from({ length: season.episodes }, (_, index) => ({
        id: `${season.id}-EP${index + 1}`,
        title: `S${season.seasonNumber}E${index + 1}`,
        description: '',
        // within-season, exactly as Crunchyroll numbers it: this is why the union collides
        episode_number: index + 1,
        season_number: season.seasonNumber,
        season_id: season.id,
        series_id: id,
        sequence_number: index + 1,
        // seasonAirDates reads the FIRST episode's air date as the season's premiere, which is what
        // the date axis compares against
        episode_air_date: season.airDate ?? '2026-07-04T15:00:00Z',
      }))
    },
  ])),
})

// Every url getMedia can reach, answered from a table. An unlisted url throws rather than returning
// an empty payload, so a fixture that has drifted out of step with the source fails loudly instead of
// quietly producing the zero this file is trying to assert is a refusal.
const context = (routes: Record<string, unknown>) => ({
  fetch: async (url: string) => {
    if (url === 'https://www.crunchyroll.com/auth/v1/token') {
      return { json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
    }
    if (!(url in routes)) throw new Error(`fixture has no route for ${url}`)
    return { json: async () => routes[url] }
  }
}) as never

// The same table, counting how many times each url is asked for, so a test can say what a request
// path COSTS and not only what it answers.
const counting = (routes: Record<string, unknown>) => {
  const calls = new Map<string, number>()
  const inner = context(routes) as { fetch: (url: string) => Promise<unknown> }
  const ctx = {
    fetch: async (url: string) => {
      calls.set(url, (calls.get(url) ?? 0) + 1)
      return inner.fetch(url)
    }
  } as never
  return { ctx, calls }
}

// The season walk is a module-level cache keyed by series id, so without this a test would read the
// walk the test before it made and a count of requests would be a count of test order.
beforeEach(() => resetCrunchyrollCaches())

// The real premiere dates, so the date axis has something honest to choose between. Season 2 and
// season 2 part 2 are the pair that matters: both are "season 2" by ordinal, 273 days apart.
const MUSHOKU = series('G24H1N3MP', [
  { id: 'GSSEASON1', seasonNumber: 1, episodes: 23, airDate: '2021-01-11T00:00:00Z' },
  { id: 'GSSEASON2', seasonNumber: 2, episodes: 24, airDate: '2023-07-09T00:00:00Z' },
  { id: 'GS00374452', seasonNumber: 3, episodes: 14, airDate: '2026-07-04T00:00:00Z' },
])

test('a show-level id answers with the metadata and NO episodes', async () => {
  const media = await getMedia('G24H1N3MP', context(MUSHOKU))

  expect(media?.uri).toBe('cr:G24H1N3MP')
  // 61 before the guard, and 24 distinct episode numbers once the resolver groups them
  expect(media?.episodes ?? []).toHaveLength(0)
})

// The control, and it is the half that matters: a source that answered nothing for every id would
// pass the assertion above unconditionally, so this proves the fixture can produce episodes at all.
test('the season-scoped id for the same series still answers with its own 14', async () => {
  const media = await getMedia('G24H1N3MP-GS00374452', context(MUSHOKU))

  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(media?.episodes ?? []).toHaveLength(14)
  expect([...new Set((media?.episodes ?? []).map(episode => episode.seasonNumber))]).toEqual([3])
})

// A one-season series has no seasons to be confused between, so its bare id is already exact and
// `targetSeason` falls back to that single season. The guard must not cost it its episodes.
test('a single-season series keeps its episodes when asked by the bare series id', async () => {
  const media = await getMedia('SOLO', context(series('SOLO', [{ id: 'GSONLY', seasonNumber: 1, episodes: 3 }])))

  expect(media?.uri).toBe('cr:SOLO-GSONLY')
  expect(media?.episodes ?? []).toHaveLength(3)
})

// `similarMedia` is how a source holding nothing but a SHOW link gets a run out of this source without
// minting a show-level handle. Driven through the real resolver rather than through `seasonForShow`,
// because the yield-once shape is part of the contract: a generator that ends without yielding makes
// yoga answer 204 and the caller waits out its timeout instead of reading the refusal.
type Ask = { showId: string, startDate?: string, titles?: string[], episodeCount?: number, episodeTitles?: string[] }

const askSeason = async (input: Ask, routes: Record<string, unknown>, ctx: unknown = context(routes)) => {
  const subscribe = (resolvers.Subscription as any).similarMedia.subscribe
  const { value } = await subscribe(undefined, { input }, ctx).next()
  return value?.similarMedia ?? null
}

test('a show plus a date resolves to that one run', async () => {
  const media = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU)

  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(media?.episodes ?? []).toHaveLength(14)
})

// The pair an ordinal cannot separate. Both of these are "season 2" of this show, so a caller passing
// seasonNumber 2 would have no way to say which it meant; 273 days says it unambiguously.
test('the date, not the ordinal, is what picks between two runs sharing a season number', async () => {
  const cour1 = await askSeason({ showId: 'G24H1N3MP', startDate: '2023-07-09T00:00:00Z' }, MUSHOKU)
  const cour3 = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU)

  expect(cour1?.uri).toBe('cr:G24H1N3MP-GSSEASON2')
  expect(cour3?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(cour1?.uri).not.toBe(cour3?.uri)
})

test('an unparseable date with nothing else is a refusal, never a nearest-of-anything', async () => {
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: 'not a date' }, MUSHOKU)).toBeNull()
})

// Crunchyroll answers an unknown or seasonless series with an empty `data`, which is a refusal here
// and not an error. A source that THROWS instead is also a refusal, but one handled a layer up:
// `firstSimilarMedia` in worker/extractor.ts settles undefined on `result.error`.
test('a show with no seasons is a refusal', async () => {
  const routes = { ...MUSHOKU, ...series('SEASONLESS', []) }

  expect(await askSeason({ showId: 'SEASONLESS', startDate: '2026-07-04T00:00:00Z' }, routes)).toBeNull()
})

// The window, which this source did NOT apply until 2026-08-31: `matchSeasonByDate` returned the
// nearest season at any distance, so a date from a different year still came back with a season.
// 2019 is nearest to season 1 (2021) and 731 days away, which is not a rounding difference.
test('a date outside the window is a refusal, not the nearest season anyway', async () => {
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: '2019-04-06T00:00:00Z' }, MUSHOKU)).toBeNull()
})

// The control for the test above. Without it, a source that refused everything would pass that
// assertion and this file would be pinning nothing.
test('a date inside the window still resolves, so the refusal above is the window and not a wall', async () => {
  const media = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-20T00:00:00Z' }, MUSHOKU)

  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
})

// A day-precise date that nothing else contradicts is still not enough when TWO seasons sit inside
// its window: two parts released together are two runs, and the date cannot say which is ours.
test('two seasons inside one window is an ambiguity, and a refusal', async () => {
  const routes = series('GPAIR', [
    { id: 'GP1', seasonNumber: 1, episodes: 12, airDate: '2024-04-05T00:00:00Z' },
    { id: 'GP2', seasonNumber: 2, episodes: 12, airDate: '2024-04-15T00:00:00Z' },
  ])

  expect(await askSeason({ showId: 'GPAIR', startDate: '2024-04-08T00:00:00Z' }, routes)).toBeNull()
})

// Season 3 and a season 4 in the same year, so a year alone cannot tell them apart and the later
// rules have to do the work the date rule cannot.
const TWO_IN_2026 = series('GTWO2026', [
  { id: 'GT1', seasonNumber: 1, episodes: 23, airDate: '2021-01-11T00:00:00Z' },
  { id: 'GT2', seasonNumber: 2, episodes: 24, airDate: '2023-07-09T00:00:00Z' },
  { id: 'GT3', seasonNumber: 3, episodes: 14, airDate: '2026-07-04T00:00:00Z' },
  { id: 'GT4', seasonNumber: 4, episodes: 12, airDate: '2026-10-05T00:00:00Z' },
])

// Seven extractors template a bare year as `YYYY-01-01` and two more answer `YYYY-MM-01` when only
// the month is known. Against a 45 day window that is a year pretending to be a day, so the window
// never sees it: `2026-07-01` is three days from season 3's premiere and is NOT matched as a date.
// What a year-only date can still do is name the one season dated that year when our count shows that
// season is not a fold, and no more: no count, or two seasons in the year, is a refusal, whatever the
// distance to either.
test('a year-only date never reaches the window: it names the one season of its year, or nothing', async () => {
  const one = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-01-01T00:00:00Z', episodeCount: 14 }, MUSHOKU)
  expect(one?.uri, '2026 holds season 3 alone, so the year names it').toBe('cr:G24H1N3MP-GS00374452')
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: '2026-01-01T00:00:00Z' }, MUSHOKU), 'a year with no count checks nothing').toBeNull()

  expect(await askSeason({ showId: 'GTWO2026', startDate: '2026-01-01T00:00:00Z', episodeCount: 14 }, TWO_IN_2026)).toBeNull()
  expect(
    await askSeason({ showId: 'GTWO2026', startDate: '2026-07-01T00:00:00Z', episodeCount: 14 }, TWO_IN_2026),
    'three days from a premiere, and still not a date: a first-of-month names a month'
  ).toBeNull()
})

// An announced season, or one this region cannot list, answers an EMPTY episodes payload. Offered as a
// season of 0 episodes it fit under every run's count, and two runs two years apart both took it
// (2026-09-05). A season with nothing listed has no length, and a lone season with no length is not
// a season still listing: it is nothing to match.
test('a season with no episodes listed is never the answer', async () => {
  const routes = series('GEMPTY', [{ id: 'GE1', seasonNumber: 1, episodes: 0 }])

  expect(await askSeason({ showId: 'GEMPTY', titles: ['Show'], episodeCount: 12, startDate: '2024-04-07T00:00:00Z' }, routes)).toBeNull()
  expect(await askSeason({ showId: 'GEMPTY', titles: ['Another Run Of It'], episodeCount: 24, startDate: '2022-10-02T00:00:00Z' }, routes)).toBeNull()

  const listed = series('GLISTED', [{ id: 'GL1', seasonNumber: 1, episodes: 5 }])
  expect(
    (await askSeason({ showId: 'GLISTED', titles: ['Show'], episodeCount: 12 }, listed))?.uri,
    'the control: a lone season with SOME episodes is a season still listing'
  ).toBe('cr:GLISTED-GL1')
})

// The ordinal, read off the caller's titles, matched against the season_number Crunchyroll stamps on
// every episode, and admitted only with a count the season does not exceed.
test('a year-only date falls back to the ordinal and count', async () => {
  const input = { startDate: '2026-01-01T00:00:00Z', titles: ['Mushoku Tensei Season 3'], episodeCount: 14 }

  expect((await askSeason({ showId: 'G24H1N3MP', ...input }, MUSHOKU))?.uri).toBe('cr:G24H1N3MP-GS00374452')
  // the year holds two seasons here, so only the ordinal can have picked
  expect((await askSeason({ showId: 'GTWO2026', ...input }, TWO_IN_2026))?.uri).toBe('cr:GTWO2026-GT3')
})

// Netflix's season 2 of this show is 25 episodes over anime's 13 and 12; here Crunchyroll's season 2
// holds 24 against a caller's 12. A season holding MORE episodes than the run holds other runs too,
// and the year (2023, season 2 alone) would otherwise have named it.
test('a fold is refused', async () => {
  expect(await askSeason(
    { showId: 'G24H1N3MP', startDate: '2023-01-01T00:00:00Z', titles: ['Mushoku Tensei Season 2'], episodeCount: 12 },
    MUSHOKU
  )).toBeNull()
})

test('titles that disagree about the season refuse outright', async () => {
  expect(await askSeason(
    { showId: 'G24H1N3MP', titles: ['Mushoku Tensei Season 2', 'Mushoku Tensei Part 3'], episodeCount: 24 },
    MUSHOKU
  )).toBeNull()
})

// The coincidence that welded season 1 to Netflix's season 3 on the live site: an 11 episode run and
// an 11 episode third season. Only the FIRST season is ever tried on a count with no ordinal, and
// with several seasons only an exact count is accepted.
test('a count with no ordinal is tried against the first season only', async () => {
  const first = await askSeason({ showId: 'G24H1N3MP', titles: ['Mushoku Tensei'], episodeCount: 23 }, MUSHOKU)
  expect(first?.uri).toBe('cr:G24H1N3MP-GSSEASON1')

  expect(
    await askSeason({ showId: 'G24H1N3MP', titles: ['Mushoku Tensei'], episodeCount: 14 }, MUSHOKU),
    'season 3 holds exactly 14, and it is never reached by count'
  ).toBeNull()
})

const season3Titles = Array.from({ length: 14 }, (_, index) => `S3E${index + 1}`)

// The count alone refuses this run (23 !== 14 on the first season), and the titles carry no ordinal.
// Fourteen episode titles that are season 3's are what establish it.
test('episode titles pick the season when nothing else does', async () => {
  expect(await askSeason({ showId: 'G24H1N3MP', episodeCount: 14 }, MUSHOKU), 'the control').toBeNull()

  const media = await askSeason({ showId: 'G24H1N3MP', episodeCount: 14, episodeTitles: season3Titles }, MUSHOKU)
  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
})

// Decisive the other way too: three real episode titles that no season carries say this is not any
// of these seasons, whatever the ordinal says.
test('episode titles sharing none with any season refuse a season the ordinal would have taken', async () => {
  expect(await askSeason(
    { showId: 'G24H1N3MP', titles: ['Mushoku Tensei Season 3'], episodeCount: 14, episodeTitles: ['Alpha', 'Beta', 'Gamma'] },
    MUSHOKU
  )).toBeNull()
})

// The contract on the answer: a RUN at this origin carrying no handle naming another run. The CALLER
// decides what to claim about it; a handle here would claim on its behalf.
test('the answer is a RUN with no handles', async () => {
  const media = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU)

  expect(media?.scope).toBe('RUN')
  expect(media?.handles).toEqual([])
})

test('similarMedia yields exactly once, on an answer and on a refusal', async () => {
  const subscribe = (resolvers.Subscription as any).similarMedia.subscribe
  for (const input of [{ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, { showId: 'G24H1N3MP' }]) {
    const iterator = subscribe(undefined, { input }, context(MUSHOKU))
    expect((await iterator.next()).done).toBe(false)
    expect((await iterator.next()).done).toBe(true)
  }
})

// SCOPE. A media in this store is one run, and a bare Crunchyroll series id is the same for every
// season, so it names the show and not any run. Handed to the store as a RUN it entered a run's
// SAME_AS cluster and welded seasons together (Mushoku Tensei season 1 to season 3 on the live site,
// through exactly cr:G24H1N3MP). The source stamps CONTAINER on it from its own grammar: no season
// segment, no run.
test('a show-level id is scoped CONTAINER', async () => {
  const media = await getMedia('G24H1N3MP', context(MUSHOKU))

  expect(media?.uri).toBe('cr:G24H1N3MP')
  expect(media?.scope).toBe('CONTAINER')
})

// The controls. A stamp that said CONTAINER on everything would pass the test above and take every
// run out of its own identity space, so both run shapes have to read RUN: the season-scoped id, and
// the single-season series asked by its bare id, which resolves to its one season and so is a run.
test('a season-scoped id is scoped RUN', async () => {
  const media = await getMedia('G24H1N3MP-GS00374452', context(MUSHOKU))

  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(media?.scope).toBe('RUN')
})

test('a single-season series asked by its bare id resolves to its one run and is scoped RUN', async () => {
  const media = await getMedia('SOLO', context(series('SOLO', [{ id: 'GSONLY', seasonNumber: 1, episodes: 3 }])))

  expect(media?.uri).toBe('cr:SOLO-GSONLY')
  expect(media?.scope).toBe('RUN')
})

const SEARCH = (query: string, items: { id: string, title: string }[]) => ({
  [`https://www.crunchyroll.com/content/v2/discover/search?q=${encodeURIComponent(query)}&n=50&type=series&locale=en-US`]: {
    data: [{
      type: 'series',
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        slug_title: item.title.toLowerCase().replace(/\s+/g, '-'),
        description: 'A show.',
        images: {},
        series_metadata: { episode_count: 61, series_launch_year: 2021 }
      }))
    }]
  }
})

// Search answers series, and a series row is minted under the bare id, so every search hit is a
// container. This is the other site that mints bare ids, and the one whose rows reach the store's
// fuzzy merge first.
test('search rows are minted under the bare series id and scoped CONTAINER', async () => {
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const routes = SEARCH('mushoku', [{ id: 'G24H1N3MP', title: 'Mushoku Tensei' }, { id: 'GRDV0019R', title: 'Jujutsu Kaisen' }])
  const { value } = await subscribe(undefined, { input: { search: 'mushoku' } }, context(routes)).next()
  const nodes = value.mediaPage.nodes as { uri: string, scope?: string | null }[]

  expect(nodes.map(node => node.uri)).toEqual(['cr:G24H1N3MP', 'cr:GRDV0019R'])
  expect(nodes.map(node => node.scope)).toEqual(['CONTAINER', 'CONTAINER'])
})

// The search-and-link path always resolves a season-scoped id, so the media it returns is a run, and
// the handles it builds from the aggregated uri are bare SAME_AS claims carrying no container scope:
// a SAME_AS between two RUN rows is what unions the cluster, once the store has both rows.
test('the handles built on the search path carry the run scope of the media they attach to', async () => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const known = { titles: [{ language: 'en', title: 'Mushoku Tensei', score: 1 }], startDate: '2026-07-04T00:00:00Z' }
  const ctx = Object.assign(
    context({ ...MUSHOKU, ...SEARCH('Mushoku Tensei', [{ id: 'G24H1N3MP', title: 'Mushoku Tensei' }]) }),
    { findAggregatedMedia: async () => known, listenForMediaChanges: async function* () {} }
  )
  const { value } = await subscribe(undefined, { input: { uri: 'ag:(anilist:108465,kitsu:42323)' } }, ctx).next()
  const media = value.media

  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(media?.scope).toBe('RUN')
  expect(media?.handles.map((handle: { node: { uri: string }, relation: string }) => [handle.node.uri, handle.relation]))
    .toEqual([['anilist:108465', 'SAME_AS'], ['kitsu:42323', 'SAME_AS']])
  expect(media?.handles.map((handle: { node: { scope?: string | null } }) => handle.node.scope)).toEqual(['RUN', 'RUN'])
})

// COST. The walk is every japanese-audio season of a series at one episodes request each, and it used
// to run once per ask: two pages of one show walked it twice, and the consumer's re-asks on new
// evidence would multiply that. One walk per series per session, reused inside a TTL.
const SEASON1_EPISODES = `${CMS}/seasons/GSSEASON1/episodes?preferred_audio_language=ja-JP&locale=en-US`

// GSSEASON1 is a season neither ask below wins, so only the walk ever reads it: its count is the walk's.
test('two asks about one show walk its seasons once', async () => {
  const { ctx, calls } = counting(MUSHOKU)

  const cour3 = await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU, ctx)
  const cour1 = await askSeason({ showId: 'G24H1N3MP', startDate: '2023-07-09T00:00:00Z' }, MUSHOKU, ctx)

  expect(cour3?.uri).toBe('cr:G24H1N3MP-GS00374452')
  expect(cour1?.uri, 'the control: the cache still answers each ask its own season').toBe('cr:G24H1N3MP-GSSEASON2')
  expect(calls.get(SEASON1_EPISODES)).toBe(1)
})

// A different series is a different walk: the cache is per show, never per module.
test('a different show still walks its own seasons', async () => {
  const { ctx, calls } = counting({ ...MUSHOKU, ...TWO_IN_2026 })

  await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU, ctx)
  const other = await askSeason({ showId: 'GTWO2026', startDate: '2026-10-05T00:00:00Z' }, TWO_IN_2026, ctx)

  expect(other?.uri).toBe('cr:GTWO2026-GT4')
  expect(calls.get(SEASON1_EPISODES)).toBe(1)
  expect(calls.get(`${CMS}/seasons/GT1/episodes?preferred_audio_language=ja-JP&locale=en-US`)).toBe(1)
})

test('the walk is reused for ten minutes and not longer', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const start = Date.parse('2026-09-05T00:00:00Z')
    vi.setSystemTime(new Date(start))
    const { ctx, calls } = counting(MUSHOKU)
    const ask = () => askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU, ctx)

    await ask()
    vi.setSystemTime(new Date(start + 9 * 60 * 1000))
    await ask()
    expect(calls.get(SEASON1_EPISODES), 'nine minutes in, the walk is still the first one').toBe(1)

    vi.setSystemTime(new Date(start + 11 * 60 * 1000))
    await ask()
    expect(calls.get(SEASON1_EPISODES), 'eleven minutes in, the walk is made again').toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

// A walk that threw is not an answer about the show, so it must not be served to the next ask; and a
// request that fails must fail the caller once, never as a second, unhandled rejection beside it.
test('a failed walk is not remembered', async () => {
  const ask = { showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }
  await expect(askSeason(ask, {}, context({}))).rejects.toThrow('fixture has no route')

  const media = await askSeason(ask, MUSHOKU)
  expect(media?.uri).toBe('cr:G24H1N3MP-GS00374452')
})

// OBSERVABILITY. The rule is not on the wire (the answer is a store row, and a rule is not a fact about
// the row), so the answering side says which rule picked, and a live log reads ask, rule, answer, claim.
test('a pick says which rule picked it', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }, MUSHOKU)
    const lines = () => warn.mock.calls.map(call => String(call[0])).filter(text => text.startsWith('similarMedia:'))
    expect(lines()).toEqual(['similarMedia: cr picked GS00374452 by date for G24H1N3MP'])

    expect(await askSeason({ showId: 'G24H1N3MP' }, MUSHOKU)).toBeNull()
    expect(lines(), 'a refusal picks nothing and says nothing').toHaveLength(1)
  } finally {
    warn.mockRestore()
  }
})

// Crunchyroll's rate limit is a JSON body with no `data` (`{ __class__: 'error', code: 'rate_limited' }`).
// Read as an empty list it was an answer: a walk over three such bodies described three seasons of zero
// episodes, refused, and was served to every ask for ten minutes while upstream had long recovered
// (2026-09-05). An error body is an error, so the walk rejects and the cache forgets it.
const RATE_LIMITED = { __class__: 'error', code: 'rate_limited' }
const degradedOnce = (routes: Record<string, unknown>, urls: string[]) => {
  const pending = new Set(urls)
  const inner = context(routes) as { fetch: (url: string) => Promise<unknown> }
  return {
    fetch: async (url: string) => pending.delete(url) ? { status: 429, json: async () => RATE_LIMITED } : inner.fetch(url)
  } as never
}
const EPISODES_URLS = ['GSSEASON1', 'GSSEASON2', 'GS00374452'].map(id => `${CMS}/seasons/${id}/episodes?preferred_audio_language=ja-JP&locale=en-US`)
const SEASONS_URL = `${CMS}/series/G24H1N3MP/seasons?force_locale=&preferred_audio_language=ja-JP&locale=en-US`

test('a rate limited walk is an error, not an answer the cache keeps', async () => {
  const ask = { showId: 'G24H1N3MP', startDate: '2026-07-04T00:00:00Z' }

  const episodes = degradedOnce(MUSHOKU, EPISODES_URLS)
  await expect(askSeason(ask, MUSHOKU, episodes), 'three seasons of zero episodes is not a refusal').rejects.toThrow(/answered .* with no data/)
  expect((await askSeason(ask, MUSHOKU, episodes))?.uri, 'upstream healthy again, inside the TTL: the walk is made again').toBe('cr:G24H1N3MP-GS00374452')

  resetCrunchyrollCaches()
  const seasons = degradedOnce(MUSHOKU, [SEASONS_URL])
  await expect(askSeason(ask, MUSHOKU, seasons), 'no seasons at all is not a refusal either').rejects.toThrow(/answered .* with no data/)
  expect((await askSeason(ask, MUSHOKU, seasons))?.uri).toBe('cr:G24H1N3MP-GS00374452')
})
