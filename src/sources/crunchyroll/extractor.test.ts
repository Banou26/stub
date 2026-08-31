// A Crunchyroll id with no season component names the SHOW, and a show has no honest episode list in
// a store where every media is one season. Asking for one used to answer with every season's episodes
// at once, each carrying a WITHIN-season `episodeNumber`, which is how the Mushoku Tensei season 3
// page came to list 24 rows for a 14 episode season (measured on the live site 2026-08-31: rows 1 to
// 10 correct, row 11 an AniZip season 3 title over a season 1 description, rows 12 to 24 season 1).
//
// The bare handle reached that cluster from Kitsu, which publishes the show's Crunchyroll link on
// every season record. That half is pinned in ../kitsu/stream-id.test.ts. This file pins the other
// half: even handed a show-level id, this source must not hand back a show's worth of episodes.
import { expect, test } from 'vitest'

import { getMedia, resolvers } from './extractor'

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

// `mediaSeason` is how a source holding nothing but a SHOW link gets a run out of this source without
// minting a show-level handle. Driven through the real resolver rather than through `seasonForShow`,
// because the yield-once shape is part of the contract: a generator that ends without yielding makes
// yoga answer 204 and the caller waits out its timeout instead of reading the refusal.
const askSeason = async (input: { showId: string, startDate: string }, routes: Record<string, unknown>) => {
  const subscribe = (resolvers.Subscription as any).mediaSeason.subscribe
  const { value } = await subscribe(undefined, { input }, context(routes)).next()
  return value?.mediaSeason ?? null
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

test('an unparseable date is a refusal, never a nearest-of-anything', async () => {
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: 'not a date' }, MUSHOKU)).toBeNull()
})

// Crunchyroll answers an unknown or seasonless series with an empty `data`, which is a refusal here
// and not an error. A source that THROWS instead is also a refusal, but one handled a layer up:
// `firstMediaSeason` in worker/extractor.ts settles undefined on `result.error`.
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

// Seven extractors template a bare year as `YYYY-01-01` and two more answer `YYYY-MM-01` when only
// the month is known. Against a 45 day window that is a year pretending to be a day, so it is thrown
// out before the window ever sees it.
test('a date that names only a year or a month is refused before the window', async () => {
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: '2026-01-01T00:00:00Z' }, MUSHOKU)).toBeNull()
  expect(await askSeason({ showId: 'G24H1N3MP', startDate: '2026-07-01T00:00:00Z' }, MUSHOKU)).toBeNull()
})
