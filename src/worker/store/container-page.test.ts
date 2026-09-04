// A live-action show page. The search stores the show as containers (tvmaze, trakt, imdb, one cluster
// in the container space), and on the media path justwatch resolves season 1: a RUN carrying the
// episodes and the offers, attached to the show by edges. The page used to reach that run because it
// was welded into the show's cluster; with the two spaces split, nothing read the edges backwards and
// the page lost its episodes and every offer.
import { beforeEach, expect, test } from 'vitest'

import {
  findAggregatedMedia, findMediaForPage, findPartOfMedia, findRunsOfContainer, preferAttachedRun, resetStore, upsertMedia,
} from './db'

const media = (uri: string, scope: 'RUN' | 'CONTAINER', startDate?: string) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  titles: [{ language: 'en', title: uri, score: 1 }],
  startDate: startDate ?? null,
  scope,
}) as any

const uris = (medias: { uri: string }[]) => medias.map(m => m.uri).sort()

const SHOW = ['imdb:tt0903747', 'trakt:breaking-bad', 'tvmaze:169']
const SHOW_URI = 'ag:(imdb:tt0903747,trakt:breaking-bad,tvmaze:169)'

const storeShow = () => upsertMedia(
  SHOW.map(uri => media(uri, 'CONTAINER', '2008-01-20')),
  [
    { mediaUri: 'tvmaze:169', handleUri: 'imdb:tt0903747' },
    { mediaUri: 'trakt:breaking-bad', handleUri: 'imdb:tt0903747' },
  ]
)

// the shape justwatch's answer takes on that page: its season, its netflix offer, and SAME_AS to
// every sibling of the page's uri, which the store derives as edges
const storeSeason = (jw: string, nf: string, startDate: string) => upsertMedia(
  [media(jw, 'RUN', startDate), media(nf, 'RUN', startDate)],
  [
    { mediaUri: jw, handleUri: nf },
    ...SHOW.map(handleUri => ({ mediaUri: jw, handleUri })),
  ]
)

beforeEach(() => { resetStore() })

test('a show page follows to its attached run, and the run links to every id of the show', async () => {
  await storeShow()
  expect(uris(await findMediaForPage(SHOW_URI)), 'before any run lands the show is itself').toEqual(SHOW)

  await storeSeason('jw:222-230', 'nf:70143836-1', '2008-01-01')

  const page = await findMediaForPage(SHOW_URI)
  expect(uris(page), 'the season episodes and offers reach the show page').toEqual(['jw:222-230', 'nf:70143836-1'])
  expect(page.every(m => m.scope === 'RUN')).toBe(true)
  expect(uris(findPartOfMedia(page)), 'and every catalogue of the show is still linked from it').toEqual(SHOW)
})

test('the run behind a show is read backwards along the edges, each cluster once', async () => {
  await storeShow()
  await storeSeason('jw:222-230', 'nf:70143836-1', '2008-01-01')

  const show = await findAggregatedMedia('tvmaze:169')
  expect(uris(show), 'the setup: one container cluster').toEqual(SHOW)
  expect(findRunsOfContainer(show).map(uris)).toEqual([['jw:222-230', 'nf:70143836-1']])
})

test('with several runs attached the earliest one is shown, whatever the order they landed in', async () => {
  await storeShow()
  await storeSeason('jw:222-378', 'nf:70143836-2', '2009-03-08')
  await storeSeason('jw:222-230', 'nf:70143836-1', '2008-01-20')

  expect(uris(preferAttachedRun(await findAggregatedMedia('tvmaze:169')))).toEqual(['jw:222-230', 'nf:70143836-1'])
})

test('a run page is shown as it is', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('kitsu:42323', 'RUN'), media('cr:G24H1N3MP', 'CONTAINER')],
    [{ mediaUri: 'anilist:108465', handleUri: 'kitsu:42323' }, { mediaUri: 'anilist:108465', handleUri: 'cr:G24H1N3MP' }]
  )

  expect(uris(await findMediaForPage('ag:(anilist:108465,kitsu:42323)'))).toEqual(['anilist:108465', 'kitsu:42323'])
  expect(uris(await findMediaForPage('anilist:108465'))).toEqual(['anilist:108465', 'kitsu:42323'])
})

// a bookmark from before the split carries the show's ids beside the run's, and the show's may sort
// first: the page it was taken from was the run's
test('a mixed bookmark resolves to its run whichever handle comes first', async () => {
  await upsertMedia(
    [media('cr:G24H1N3MP', 'CONTAINER'), media('tvmaze:52279', 'CONTAINER'), media('kitsu:49002', 'RUN'), media('kitsu:42323', 'RUN')],
    [
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'tvmaze:52279' },
      { mediaUri: 'kitsu:42323', handleUri: 'cr:G24H1N3MP' },
      { mediaUri: 'kitsu:49002', handleUri: 'cr:G24H1N3MP' },
    ]
  )

  // season 3's bookmark: following the show would have landed on season 1, the earliest run
  expect(uris(await findMediaForPage('ag:(cr:G24H1N3MP,kitsu:49002,tvmaze:52279)'))).toEqual(['kitsu:49002'])
  // a bookmark naming no run at all still gets the show's first run
  expect(uris(await findMediaForPage('ag:(cr:G24H1N3MP,tvmaze:52279)'))).toEqual(['kitsu:42323'])
})

// the fuzzy pass writes one edge, to the cluster key, and the other catalogues of an already unioned
// show were reachable only while they were welded in: the modal renders PART_OF links, so a run card
// showed one catalogue icon where it used to show four
test('a run part of a show links to every id that show has', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('cr:G24H1N3MP', 'CONTAINER'), media('tvmaze:52279', 'CONTAINER'), media('imdb:tt13303712', 'CONTAINER')],
    [
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'tvmaze:52279' },
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'imdb:tt13303712' },
      { mediaUri: 'anilist:108465', handleUri: 'cr:G24H1N3MP', relation: 'PART_OF' },
    ]
  )

  expect(uris(findPartOfMedia(await findAggregatedMedia('anilist:108465')))).toEqual(['cr:G24H1N3MP', 'imdb:tt13303712', 'tvmaze:52279'])
})
