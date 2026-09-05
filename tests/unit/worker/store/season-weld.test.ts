// THE LIVE WELD, as a store test. Mushoku Tensei season 1 and season 3 became one media on the site:
// the SEARCH path fuzzy merged crunchyroll's bare series id cr:G24H1N3MP and tvmaze's bare show id
// tvmaze:52279 into season 1's cluster on a title match, and season 3's MEDIA path then asserted
// sameness through the series id. `graph.link` is a union-find with no inverse, so from then on every
// read of either season returned both.
//
// With scope, the two show ids never enter a run's identity space at all: the title match becomes an
// edge, the media path's claim becomes an edge, and a row for the series id that arrives with no stamp
// (a stale bookmark, a source that says nothing) finds the stored row already CONTAINER and sticky.
import { beforeEach, expect, test } from 'vitest'

import {
  findAggregatedMedia, findAllAggregatedMedia, findPartOfMedia, hideAttachedContainers, resetStore, upsertMedia,
} from '../../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../../src/worker/store/fuzzy-merge'

const media = (uri: string, title: string, startDate: string, scope: 'RUN' | 'CONTAINER') => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  startDate,
  titles: [{ language: 'en', title, score: 0.8 }],
  scope,
}) as any

const uris = (medias: { uri: string }[]) => medias.map(m => m.uri).sort()

const TITLE = 'Mushoku Tensei: Jobless Reincarnation'
const SERIES = 'cr:G24H1N3MP'
const SEASON_ONE = 'cr:G24H1N3MP-GS00374452'
const SEASON_THREE = 'cr:G24H1N3MP-GS00378061'

beforeEach(() => { resetStore() })

test('the search path plus the media path leave season 1 and season 3 as two media', async () => {
  // the SEARCH path: two show ids, two runs, and the season 1 pair that anilist and kitsu agree on
  await upsertMedia(
    [
      media(SERIES, TITLE, '2021-01-01', 'CONTAINER'),
      media('tvmaze:52279', TITLE, '2021-01-11', 'CONTAINER'),
      media('anilist:108465', TITLE, '2021-01-11T00:00:00Z', 'RUN'),
      media('kitsu:42323', TITLE, '2021-01-11T00:00:00Z', 'RUN'),
      media('anilist:178789', `${TITLE} Season 3`, '2026-01-10T00:00:00Z', 'RUN'),
    ],
    [{ mediaUri: 'kitsu:42323', handleUri: 'anilist:108465', relation: 'SAME_AS' }]
  )
  await fuzzyMergeMediaClusters(await findAllAggregatedMedia())

  // the MEDIA path, season 1: crunchyroll names its own run and points at its series
  await upsertMedia(
    [media(SEASON_ONE, TITLE, '2021-01-11', 'RUN'), media(SERIES, TITLE, '2021-01-01', 'CONTAINER')],
    [
      { mediaUri: SEASON_ONE, handleUri: 'anilist:108465', relation: 'SAME_AS' },
      { mediaUri: SEASON_ONE, handleUri: SERIES, relation: 'PART_OF' },
    ]
  )
  // the MEDIA path, season 3, the same shape
  await upsertMedia(
    [media(SEASON_THREE, `${TITLE} Season 3`, '2026-01-10', 'RUN'), media(SERIES, TITLE, '2021-01-01', 'CONTAINER')],
    [
      { mediaUri: SEASON_THREE, handleUri: 'anilist:178789', relation: 'SAME_AS' },
      { mediaUri: SEASON_THREE, handleUri: SERIES, relation: 'PART_OF' },
    ]
  )
  // the bridge the old code allowed: the series id arriving with a RUN stamp, or no stamp at all,
  // claimed SAME_AS of season 3
  await upsertMedia(
    [media(SERIES, TITLE, '2021-01-01', 'RUN')],
    [{ mediaUri: 'anilist:178789', handleUri: SERIES, relation: 'SAME_AS' }]
  )

  const seasonOne = await findAggregatedMedia('anilist:108465')
  const seasonThree = await findAggregatedMedia('anilist:178789')

  const shared = uris(seasonOne).filter(uri => uris(seasonThree).includes(uri))
  expect(shared, 'season 1 and season 3 must be two media').toEqual([])
  expect(uris(seasonOne), 'the control: the per-run ids still union').toEqual(['anilist:108465', SEASON_ONE, 'kitsu:42323'])
  expect(uris(seasonThree)).toEqual(['anilist:178789', SEASON_THREE])

  expect(uris(findPartOfMedia(seasonOne)), 'season 1 still points at the series').toContain(SERIES)
  expect(uris(findPartOfMedia(seasonThree)), 'and so does season 3').toContain(SERIES)

  expect(uris(await findAggregatedMedia(SERIES)), 'the two show ids are one show, in their own space')
    .toEqual([SERIES, 'tvmaze:52279'])

  const listed = hideAttachedContainers(await findAllAggregatedMedia())
  expect(listed.map(uris).sort(), 'a listing shows the two runs and no card for the show they are on')
    .toEqual([uris(seasonOne), uris(seasonThree)].sort())
})
