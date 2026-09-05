// Arrival order used to decide whether a show entered a run's identity space. Every source answering a
// media page rebuilds the aggregated uri's siblings as BARE nodes (`buildHandlesFromUri` in
// sources/utils.ts: no url, no title, `makeMedia`'s default scope) and asserts SAME_AS to each, and
// the store read a uri with no row as RUN. So a run that landed before the show's own row unioned with
// a RUN row minted for the show, the CONTAINER that followed flipped the scope and not the union, and
// the same graph answered differently depending on which member it was entered through.
//
// A bare node is now a placeholder: not stored, and a claim naming it waits for a row that describes
// the uri. Rows here are built the way worker/extractor.ts builds them, through the real
// `buildHandlesFromUri`, `recursivelyUnwrapMediaHandles` and `normalizeToStoreMedia`.
import { beforeEach, expect, test } from 'vitest'

import { buildHandlesFromUri, makeMedia, mergeHandles, partOf, sameAs } from '../../../../src/sources/utils'
import { recursivelyUnwrapMediaHandles } from '../../../../src/worker/store/aggregate'
import { findAggregatedMedia, findAllAggregatedMedia, findPartOfMedia, resetStore, upsertMedia } from '../../../../src/worker/store/db'
import { normalizeToStoreMedia } from '../../../../src/worker/store/normalize'

const described = (uri: string, scope: 'RUN' | 'CONTAINER', title = uri) =>
  makeMedia({
    origin: uri.slice(0, uri.indexOf(':')),
    id: uri.slice(uri.indexOf(':') + 1),
    scope,
    url: `https://example.test/${uri}`,
    titles: [{ language: 'en', title, score: 0.5 }],
  })

const uris = (medias: { uri: string }[]) => medias.map(m => m.uri).sort()

// what `mediaInserter` does with one source's answer: every node becomes a row, every handle a pair
const insert = async (...medias: ReturnType<typeof makeMedia>[]) => {
  const rows = medias.flatMap(recursivelyUnwrapMediaHandles)
  const pairs = rows.flatMap(row => (row.handles ?? []).map(handle => ({
    mediaUri: row.uri, handleUri: handle.node.uri, relation: handle.relation,
  })))
  await upsertMedia(rows.map(normalizeToStoreMedia) as any, pairs)
}

beforeEach(() => { resetStore() })

// T1: a run answering a container page before the show's own row has landed
test('a run claiming a show whose row is still in flight gets an edge when it lands, never a union', async () => {
  await insert(described('tvmaze:52279', 'CONTAINER'))

  const run = described('appletv:umc.show-s1', 'RUN')
  run.handles = buildHandlesFromUri('ag:(cr:G24H1N3MP,tvmaze:52279)', 'appletv')
  await insert(run)
  expect(uris(await findAggregatedMedia('appletv:umc.show-s1')), 'nothing to union with yet').toEqual(['appletv:umc.show-s1'])

  await insert(described('cr:G24H1N3MP', 'CONTAINER'))

  const cluster = await findAggregatedMedia('appletv:umc.show-s1')
  expect(uris(cluster), 'a show may never enter a run\'s identity space').toEqual(['appletv:umc.show-s1'])
  expect(uris(findPartOfMedia(cluster)), 'the claim survives as containment once the show is described').toEqual(['cr:G24H1N3MP', 'tvmaze:52279'])
  expect(uris(await findAggregatedMedia('cr:G24H1N3MP')), 'and the show answers the same from its side').toEqual(['cr:G24H1N3MP'])
})

// T1b: the live weld by this road, two runs both landing before the show
test('two runs both claiming an in-flight show stay two media once it lands', async () => {
  const seasonOne = described('appletv:umc.show-s1', 'RUN')
  seasonOne.handles = buildHandlesFromUri('ag:(cr:G24H1N3MP)', 'appletv')
  const seasonThree = described('nf:80987039-3', 'RUN')
  seasonThree.handles = buildHandlesFromUri('ag:(cr:G24H1N3MP)', 'nf')
  await insert(seasonOne, seasonThree)
  await insert(described('cr:G24H1N3MP', 'CONTAINER'))

  expect(uris(await findAggregatedMedia('appletv:umc.show-s1'))).toEqual(['appletv:umc.show-s1'])
  expect(uris(await findAggregatedMedia('nf:80987039-3'))).toEqual(['nf:80987039-3'])
  for (const uri of ['appletv:umc.show-s1', 'nf:80987039-3']) {
    expect(uris(findPartOfMedia(await findAggregatedMedia(uri))), `${uri} still points at the show`).toEqual(['cr:G24H1N3MP'])
  }
  expect((await findAllAggregatedMedia()).map(uris).sort(), 'two run clusters, and the show hidden behind nothing')
    .toEqual([['appletv:umc.show-s1'], ['cr:G24H1N3MP'], ['nf:80987039-3']])
})

// the control: the same wait ends in a union when the row that lands is a run
test('control: a run claiming an in-flight run unions when it lands', async () => {
  const jw = described('jw:ts123-1', 'RUN')
  jw.handles = buildHandlesFromUri('ag:(anilist:108465,kitsu:42323)', 'jw')
  await insert(jw)
  expect(uris(await findAggregatedMedia('jw:ts123-1'))).toEqual(['jw:ts123-1'])

  await insert(described('anilist:108465', 'RUN'))
  expect(uris(await findAggregatedMedia('jw:ts123-1'))).toEqual(['anilist:108465', 'jw:ts123-1'])

  await insert(described('kitsu:42323', 'RUN'))
  expect(uris(await findAggregatedMedia('kitsu:42323')), 'the shared-link case still glues the page together').toEqual(['anilist:108465', 'jw:ts123-1', 'kitsu:42323'])
})

// the other control: a claim between two described rows is not delayed at all
test('control: a claim between two described rows is applied at once', async () => {
  const kitsu = described('kitsu:42323', 'RUN')
  kitsu.handles = [sameAs(makeMedia({ origin: 'anilist', id: '108465', url: 'https://anilist.co/anime/108465' }))]
  await insert(kitsu)
  expect(uris(await findAggregatedMedia('kitsu:42323')), 'a handle node carrying a url is a description').toEqual(['anilist:108465', 'kitsu:42323'])
})

test('a placeholder is not a media: nothing is stored for it and it resolves to nothing', async () => {
  const run = described('anilist:108465', 'RUN')
  run.handles = buildHandlesFromUri('ag:(anilist:108465,cr:G24H1N3MP)', 'anilist')
  await insert(run)

  expect(await findAggregatedMedia('cr:G24H1N3MP')).toEqual([])
  expect((await findAllAggregatedMedia()).map(uris)).toEqual([['anilist:108465']])
})

// a PART_OF target arriving with nothing but the stamp is still a description: it is the minting
// source's own reading of the id, and the claim it rides on is an edge
test('a bare CONTAINER stamp is a description', async () => {
  const run = described('anilist:108465', 'RUN')
  run.handles = [partOf(makeMedia({ origin: 'cr', id: 'G24H1N3MP' }))]
  await insert(run)

  const cluster = await findAggregatedMedia('anilist:108465')
  expect(uris(cluster)).toEqual(['anilist:108465'])
  expect(uris(findPartOfMedia(cluster))).toEqual(['cr:G24H1N3MP'])
  expect((await findAggregatedMedia('cr:G24H1N3MP'))[0]?.scope).toBe('CONTAINER')
})

// the mirror: a container answering a run page re-asserts the run's siblings the way justwatch does,
// through `mergeHandles`, which used to forward the caller's scope onto them. A CONTAINER stamp is a
// description the store keeps and it is sticky, so the run rows flipped for good and unioned in the
// container space: two seasons on one card, by the other door.
test('a container re-asserting described runs leaves them runs, one cluster, hanging off it', async () => {
  const anilist = described('anilist:108465', 'RUN')
  anilist.handles = [sameAs(described('kitsu:42323', 'RUN'))]
  await insert(anilist)

  const show = described('tvmaze:52279', 'CONTAINER')
  mergeHandles(show, 'ag:(anilist:108465,kitsu:42323,tvmaze:52279)')
  await insert(show)

  const run = await findAggregatedMedia('anilist:108465')
  expect(uris(run)).toEqual(['anilist:108465', 'kitsu:42323'])
  expect(run.map(m => m.scope), 'the run rows keep their own scope').toEqual(['RUN', 'RUN'])
  expect(uris(findPartOfMedia(run))).toEqual(['tvmaze:52279'])
  expect(uris(await findAggregatedMedia('tvmaze:52279'))).toEqual(['tvmaze:52279'])
})
