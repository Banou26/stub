// One media in this store is one broadcast run, and every external catalogue models a SHOW with seasons.
// A show-level id entering a run's SAME_AS cluster is what welded Mushoku Tensei season 1 to season 3 on
// the live site, and `graph.link` has no inverse. So a run and a show live in DIFFERENT identity
// spaces, every row carries a scope, and the store derives the relation from the two scopes and the
// claim: sameness unions within one scope, and a claim across scopes is an edge from the run to the
// container whatever was asked for.
import { beforeEach, expect, test } from 'vitest'

import {
  findAggregatedMedia, findAllAggregatedMedia, findPartOfMedia,
  linkPartOfPairs, linkSameContainerPairs, linkSameMediaPairs, resetStore, upsertMedia,
} from '../../../../src/worker/store/db'

const media = (uri: string, scope?: 'RUN' | 'CONTAINER') => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  titles: [{ language: 'en', title: uri, score: 1 }],
  ...scope ? { scope } : {},
}) as any

const uris = (medias: { uri: string }[]) => medias.map(m => m.uri).sort()
const isContainerCluster = (cluster: { scope?: string }[]) => cluster.every(m => m.scope === 'CONTAINER')

beforeEach(() => { resetStore() })

// (a) the claim that did the welding, in the direction a run's source makes it
test('a run claiming SAME_AS to a container gets an edge, and its cluster stays a singleton', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('cr:G24H1N3MP', 'CONTAINER')],
    [{ mediaUri: 'anilist:108465', handleUri: 'cr:G24H1N3MP', relation: 'SAME_AS' }]
  )

  const run = await findAggregatedMedia('anilist:108465')
  expect(uris(run), 'a show may never enter a run\'s identity space').toEqual(['anilist:108465'])
  expect(uris(findPartOfMedia(run)), 'the link survives, as containment').toEqual(['cr:G24H1N3MP'])
})

// (b) the same claim made from the container's side: the edge is flipped so it always runs from the
// run to the container, whatever the producer claimed
test('a container claiming a run gets the edge flipped to run from the run', async () => {
  await upsertMedia(
    [media('cr:G24H1N3MP', 'CONTAINER'), media('anilist:108465', 'RUN'), media('anilist:178789', 'RUN')],
    [
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'anilist:108465', relation: 'SAME_AS' },
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'anilist:178789', relation: 'PART_OF' },
    ]
  )

  for (const uri of ['anilist:108465', 'anilist:178789']) {
    const run = await findAggregatedMedia(uri)
    expect(uris(run)).toEqual([uri])
    expect(uris(findPartOfMedia(run)), `${uri} must point at the show`).toEqual(['cr:G24H1N3MP'])
  }
  expect(findPartOfMedia(await findAggregatedMedia('cr:G24H1N3MP')), 'a show is part of nothing here').toEqual([])
})

// (c) two shows that are the same show union, in their own space, and no run sees it
test('two containers claiming sameness union in the container space only', async () => {
  await upsertMedia(
    [media('cr:G24H1N3MP', 'CONTAINER'), media('tvmaze:52279', 'CONTAINER'), media('anilist:108465', 'RUN')],
    [
      { mediaUri: 'cr:G24H1N3MP', handleUri: 'tvmaze:52279', relation: 'SAME_AS' },
      { mediaUri: 'anilist:108465', handleUri: 'cr:G24H1N3MP', relation: 'SAME_AS' },
    ]
  )

  expect(uris(await findAggregatedMedia('cr:G24H1N3MP'))).toEqual(['cr:G24H1N3MP', 'tvmaze:52279'])
  expect(uris(await findAggregatedMedia('tvmaze:52279'))).toEqual(['cr:G24H1N3MP', 'tvmaze:52279'])
  expect(uris(await findAggregatedMedia('anilist:108465'))).toEqual(['anilist:108465'])

  const all = await findAllAggregatedMedia()
  expect(all.filter(isContainerCluster).map(uris), 'one container cluster, listed once').toEqual([['cr:G24H1N3MP', 'tvmaze:52279']])
  expect(all.filter(cluster => !isContainerCluster(cluster)).map(uris)).toEqual([['anilist:108465']])
})

// (d) scope is sticky toward CONTAINER: a wrong SAME_AS has no inverse, a wrong CONTAINER only costs a
// SAME_AS that a later slice can recover, so a later row saying RUN, or saying nothing, does not flip
// the stored row back
test('CONTAINER is sticky: a later RUN row for the same uri does not flip it back', async () => {
  await upsertMedia([media('cr:G24H1N3MP', 'CONTAINER')], [])
  await upsertMedia([media('cr:G24H1N3MP', 'RUN')], [])
  await upsertMedia([media('cr:G24H1N3MP')], [])
  expect((await findAggregatedMedia('cr:G24H1N3MP'))[0]!.scope).toBe('CONTAINER')

  await upsertMedia(
    [media('anilist:178789', 'RUN'), media('cr:G24H1N3MP', 'RUN')],
    [{ mediaUri: 'anilist:178789', handleUri: 'cr:G24H1N3MP', relation: 'SAME_AS' }]
  )

  const run = await findAggregatedMedia('anilist:178789')
  expect(uris(run), 'still refused after the flip attempt').toEqual(['anilist:178789'])
  expect(uris(findPartOfMedia(run))).toEqual(['cr:G24H1N3MP'])
})

// (e) the handle-less links the fuzzy merge uses refuse a pair that crosses scopes, in both directions,
// and the containment link refuses an order it cannot read as run then container
test('the handle-less links refuse a pair that crosses scopes', async () => {
  await upsertMedia([media('anilist:108465', 'RUN'), media('cr:G24H1N3MP', 'CONTAINER')], [])

  expect(linkSameMediaPairs([['anilist:108465', 'cr:G24H1N3MP']]), 'a container in the run space').toBe(false)
  expect(linkSameContainerPairs([['anilist:108465', 'cr:G24H1N3MP']]), 'a run in the container space').toBe(false)
  expect(linkPartOfPairs([['cr:G24H1N3MP', 'anilist:108465']]), 'container then run is refused, never flipped').toBe(false)
  expect(uris(await findAggregatedMedia('anilist:108465'))).toEqual(['anilist:108465'])
  expect(uris(await findAggregatedMedia('cr:G24H1N3MP'))).toEqual(['cr:G24H1N3MP'])
  expect(findPartOfMedia(await findAggregatedMedia('anilist:108465'))).toEqual([])

  expect(linkPartOfPairs([['anilist:108465', 'cr:G24H1N3MP']]), 'run then container is the one order it takes').toBe(true)
  expect(uris(findPartOfMedia(await findAggregatedMedia('anilist:108465')))).toEqual(['cr:G24H1N3MP'])
})

// (f) the imdb backstop predates scope and stays: an imdb id names a show, so it reads as CONTAINER
// even when the row that carried it said nothing, or said RUN
test('the imdb backstop reads as CONTAINER', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('imdb:tt13303712', 'RUN')],
    [{ mediaUri: 'anilist:108465', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' }]
  )

  const run = await findAggregatedMedia('anilist:108465')
  expect(uris(run)).toEqual(['anilist:108465'])
  const [imdb] = findPartOfMedia(run)
  expect(imdb?.uri).toBe('imdb:tt13303712')
  expect(imdb?.scope, 'the stored row says what the backstop reads').toBe('CONTAINER')
  expect(linkSameMediaPairs([['anilist:108465', 'imdb:tt13303712']])).toBe(false)
})

// (g) THE CONTROLS: without these the change is indistinguishable from "stop unioning at all"
test('control: two runs still union on SAME_AS', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('kitsu:42323', 'RUN')],
    [{ mediaUri: 'anilist:108465', handleUri: 'kitsu:42323', relation: 'SAME_AS' }]
  )

  expect(uris(await findAggregatedMedia('anilist:108465'))).toEqual(['anilist:108465', 'kitsu:42323'])
  expect(linkSameMediaPairs([['anilist:108465', 'kitsu:42323']]), 'already one component').toBe(false)
})

test('control: two runs claiming PART_OF still get an edge and no union', async () => {
  await upsertMedia(
    [media('anilist:108465', 'RUN'), media('anilist:178789', 'RUN')],
    [{ mediaUri: 'anilist:178789', handleUri: 'anilist:108465', relation: 'PART_OF' }]
  )

  const run = await findAggregatedMedia('anilist:178789')
  expect(uris(run)).toEqual(['anilist:178789'])
  expect(uris(findPartOfMedia(run))).toEqual(['anilist:108465'])
  expect(uris(await findAggregatedMedia('anilist:108465'))).toEqual(['anilist:108465'])
})
