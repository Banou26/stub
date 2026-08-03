import { expect, test } from 'vitest'

import { graph, upsertMedia, findAggregatedMedia } from './db'

const media = (uri: string, title: string) => ({
  uri, origin: uri.slice(0, uri.indexOf(':')), id: uri.slice(uri.indexOf(':') + 1),
  titles: [{ language: 'en', title, score: 1 }],
}) as any

// Five sources emit the same IMDb id for every season of a show, and a handle is an identity claim -
// so linking it asserted all three Mushoku Tensei seasons were one media, long after JustWatch, TMDB
// and TVmaze each stopped saying so.
test('a show-level imdb handle does not merge two seasons', async () => {
  await upsertMedia(
    [media('anilist:1', 'Show S1'), media('anilist:2', 'Show S2'), media('imdb:tt99', 'Show')],
    [
      { mediaUri: 'anilist:1', handleUri: 'imdb:tt99' },
      { mediaUri: 'anilist:2', handleUri: 'imdb:tt99' },
    ]
  )
  const cluster = await findAggregatedMedia('anilist:1')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:1'])
})

test('an ordinary handle still merges, or clustering would do nothing at all', async () => {
  await upsertMedia(
    [media('anilist:10', 'Other'), media('mal:20', 'Other')],
    [{ mediaUri: 'anilist:10', handleUri: 'mal:20' }]
  )
  const cluster = await findAggregatedMedia('anilist:10')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:10', 'mal:20'])
})
