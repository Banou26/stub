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

import { getMedia } from './extractor'

const CMS = 'https://www.crunchyroll.com/content/v2/cms'

type Season = { id: string, seasonNumber: number, episodes: number }

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
        episode_air_date: '2026-07-04T15:00:00Z',
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

const MUSHOKU = series('G24H1N3MP', [
  { id: 'GSSEASON1', seasonNumber: 1, episodes: 23 },
  { id: 'GSSEASON2', seasonNumber: 2, episodes: 24 },
  { id: 'GS00374452', seasonNumber: 3, episodes: 14 },
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
