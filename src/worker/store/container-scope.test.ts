// The store acting on what an id NAMES rather than which origin it came from.
//
// `SHOW_LEVEL_ORIGINS` was a Set of origins, so the finest thing it could say was "no imdb id may ever
// be SAME_AS". That left the case this file is about untouched: `cr:G24H1N3MP` and
// `cr:G24H1N3MP-GS00374452` share an origin and one of them is a series holding three seasons.
//
// The live consequence, on the deployed build and with no media page opened: searching Mushoku Tensei
// put the bare `cr:G24H1N3MP` inside season 1's cluster, where it is the seed of the season 1 to
// season 3 weld (scripts/reproduce-season-weld.mjs, ARM A). Both search rows are minted handle-less,
// so `linkSameMediaPairs` is the only writer that can have put it there.
import { beforeEach, expect, test } from 'vitest'

import { aggregateMedia } from './aggregate'
import { findAggregatedMedia, linkSameMediaPairs, resetStore, upsertMedia } from './db'

const media = (uri: string, extra: Record<string, unknown> = {}) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  titles: [{ language: 'en', title: uri, score: 1 }],
  ...extra,
}) as any

const CR_SERIES_URL = 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei'

beforeEach(() => { resetStore() })

const aggregateOf = async (uri: string) => aggregateMedia(await findAggregatedMedia(uri), 'https://x')
const clusterOf = async (uri: string) => (await findAggregatedMedia(uri)).map(m => m.uri).sort()

/* ------------------------------------------------------------------ the fuzzy merge, where the seed is */

test('a fuzzy title merge cannot weld a bare crunchyroll series to a cour', async () => {
  await upsertMedia([media('anilist:108465'), media('cr:G24H1N3MP', { url: CR_SERIES_URL })], [])

  expect(linkSameMediaPairs([['anilist:108465', 'cr:G24H1N3MP']]), 'the seed pair must be refused').toBe(false)
  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465'])
})

// THE CONTROL, and the reason the test above is not a ban on crunchyroll. The same call, one segment
// longer, names one season and must still union: a run refusing to merge with a run is the failure
// mode this whole guard is supposed to avoid causing.
test('a fuzzy title merge still unions a season-scoped crunchyroll id', async () => {
  await upsertMedia([media('anilist:108465'), media('cr:G24H1N3MP-GS00374452')], [])

  expect(linkSameMediaPairs([['anilist:108465', 'cr:G24H1N3MP-GS00374452']])).toBe(true)
  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465', 'cr:G24H1N3MP-GS00374452'])
})

// Netflix reaches the same answer by a different road: the id shape says nothing and the row's
// categories say everything, so the store has to read the row rather than the uri.
test('a fuzzy title merge refuses a netflix SERIES id and accepts a netflix MOVIE id', async () => {
  await upsertMedia([
    media('anilist:108465'),
    media('nf:80987039', { categories: ['SERIES'] }),
    media('kitsu:10028'),
    media('nf:80223226', { categories: ['MOVIE'] }),
  ], [])

  expect(linkSameMediaPairs([['anilist:108465', 'nf:80987039']]), 'a whole netflix title is a container').toBe(false)
  expect(linkSameMediaPairs([['kitsu:10028', 'nf:80223226']]), 'a film is one run').toBe(true)
  expect(await clusterOf('kitsu:10028')).toEqual(['kitsu:10028', 'nf:80223226'])
})

/* --------------------------------------------------------------------- the handle path, both directions */

test('a SAME_AS handle naming a bare crunchyroll series is demoted, keeping its url', async () => {
  await upsertMedia(
    [media('anilist:108465'), media('cr:G24H1N3MP', { url: CR_SERIES_URL })],
    [{ mediaUri: 'anilist:108465', handleUri: 'cr:G24H1N3MP', relation: 'SAME_AS' }]
  )

  const cr = (await aggregateOf('anilist:108465')).handles.find(handle => handle.node.origin === 'cr')
  expect(cr, 'the crunchyroll row must still be reachable').toBeDefined()
  expect(cr!.relation).toBe('PART_OF')
  expect(cr!.node.url).toBe(CR_SERIES_URL)
  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465'])
})

// SAME_AS is symmetric, so a container on the MEDIA side welds exactly as hard as one on the handle
// side. `upsertMedia` asks both ends, and the edge then points from the run to the thing holding it
// whichever side that turned out to be.
test('a container on the media side is demoted too, with the edge pointing run to container', async () => {
  await upsertMedia(
    [media('cr:G24H1N3MP', { url: CR_SERIES_URL }), media('anilist:108465')],
    [{ mediaUri: 'cr:G24H1N3MP', handleUri: 'anilist:108465', relation: 'SAME_AS' }]
  )

  expect(await clusterOf('cr:G24H1N3MP'), 'the two must not have welded').toEqual(['cr:G24H1N3MP'])
  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465'])

  const cr = (await aggregateOf('anilist:108465')).handles.find(handle => handle.node.origin === 'cr')
  expect(cr, 'the run is PART_OF the container, so the container hangs off the run').toBeDefined()
  expect(cr!.relation).toBe('PART_OF')
})

// THE REGRESSION GUARD FOR THE OTHER TWENTY-ONE SOURCES. Only crunchyroll, netflix and imdb answer
// today; every unsurveyed origin answers UNKNOWN and UNKNOWN must union exactly as it did before this
// existed, or adopting the classifier one source at a time is not possible.
test('an unsurveyed origin still unions, by handle and by fuzzy merge alike', async () => {
  await upsertMedia(
    [media('anilist:108465'), media('kitsu:42323'), media('mal:39535')],
    [{ mediaUri: 'anilist:108465', handleUri: 'kitsu:42323', relation: 'SAME_AS' }]
  )

  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465', 'kitsu:42323'])
  expect(linkSameMediaPairs([['anilist:108465', 'mal:39535']])).toBe(true)
  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465', 'kitsu:42323', 'mal:39535'])
})

// The weld itself, end to end and in the shape the live site produces it: two cours of one show, both
// title-matched to the same bare series id. Under a union-find with no inverse that is one media.
test('two cours of one show stay two media when both match the same series id', async () => {
  await upsertMedia([
    media('anilist:108465'),
    media('anilist:178789'),
    media('cr:G24H1N3MP', { url: CR_SERIES_URL }),
  ], [])

  linkSameMediaPairs([['anilist:108465', 'cr:G24H1N3MP']])
  linkSameMediaPairs([['anilist:178789', 'cr:G24H1N3MP']])

  expect(await clusterOf('anilist:108465')).toEqual(['anilist:108465'])
  expect(await clusterOf('anilist:178789')).toEqual(['anilist:178789'])
})

/* ------------------------------------------------------------------------------ what must not change */

// THE ONE NAMED CORRECTNESS RISK IN THIS DESIGN, pinned rather than argued about.
//
// kitsu mints a film's Netflix link as SAME_AS when `mintableAsFilmHandle` says the id names the film
// itself, measured over 600 film records. Those handles are `makeMedia({ origin, id, url })`, which
// leaves `categories: []`, so a netflix classifier reading the SHAPE alone would call them containers
// and refuse the exact links that allowlist was written to keep. Reading the row instead means no
// categories answers UNKNOWN, and UNKNOWN unions.
test('a kitsu film handle carrying no categories still unions', async () => {
  await upsertMedia(
    [media('kitsu:10028'), media('nf:80223226', { categories: [], url: 'https://www.netflix.com/title/80223226' })],
    [{ mediaUri: 'kitsu:10028', handleUri: 'nf:80223226', relation: 'SAME_AS' }]
  )

  expect(await clusterOf('kitsu:10028')).toEqual(['kitsu:10028', 'nf:80223226'])
})
