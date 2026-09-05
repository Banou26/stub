// `_id` used to be minted per SMALLEST member uri. A cluster gaining a member that sorts before its
// current smallest (anilist:108465 gaining anidb:14758) changed id, so the client keyed on `_id`
// replaced the card's DOM node every time a source landed, and the container cut in
// `findAllAggregatedMedia` gave the same cluster a second id. The id is now hung on the union-find
// ROOT of the cluster's identity space and carried across unions, so it moves only when `clear` runs.
import { beforeEach, expect, test } from 'vitest'

import { aggregateEpisode, aggregateMedia } from './aggregate'
import {
  findAggregatedMedia, findAllAggregatedMedia, graph, IDENTITY_LABELS, resetStore, upsertEpisodes, upsertMedia,
} from './db'

const media = (uri: string, scope: 'RUN' | 'CONTAINER' = 'RUN') => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  titles: [{ language: 'en', title: uri, score: 1 }],
  scope,
}) as any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => { resetStore() })

const idOf = async (uri: string) => aggregateMedia(await findAggregatedMedia(uri), 'https://x')._id
const union = (mediaUri: string, handleUri: string) =>
  upsertMedia([], [{ mediaUri, handleUri, relation: 'SAME_AS' }])

test('growth keeps the id, whichever side the claim came from', async () => {
  await upsertMedia([media('anilist:108465')], [])
  const before = await idOf('anilist:108465')
  expect(before).toMatch(UUID)

  await upsertMedia([media('anidb:14758')], [{ mediaUri: 'anilist:108465', handleUri: 'anidb:14758', relation: 'SAME_AS' }])
  expect((await findAggregatedMedia('anilist:108465')).map(m => m.uri).sort(), 'the control: the cluster really grew')
    .toEqual(['anidb:14758', 'anilist:108465'])
  expect(await idOf('anilist:108465'), 'anidb:14758 sorts before anilist:108465 and the id must not follow the smallest uri')
    .toBe(before)

  resetStore()
  await upsertMedia([media('anilist:108465')], [])
  const again = await idOf('anilist:108465')
  await upsertMedia([media('anidb:14758')], [{ mediaUri: 'anidb:14758', handleUri: 'anilist:108465', relation: 'SAME_AS' }])
  expect(await idOf('anidb:14758'), 'the newcomer claiming the existing run is the same growth').toBe(again)
})

// `findAllAggregatedMedia` cuts a container cluster down to the members no run cluster lists, so the
// listing sees [tmdb:9] where the container's own page sees [cr:X, tmdb:9]. Both are one cluster.
test('the container cut does not move the id', async () => {
  await upsertMedia([media('anilist:1'), media('cr:X')], [{ mediaUri: 'anilist:1', handleUri: 'cr:X', relation: 'SAME_AS' }])
  await upsertMedia([media('cr:X', 'CONTAINER'), media('tmdb:9', 'CONTAINER')], [{ mediaUri: 'cr:X', handleUri: 'tmdb:9', relation: 'SAME_AS' }])

  const cut = (await findAllAggregatedMedia()).find(cluster => cluster.some(m => m.uri === 'tmdb:9'))!
  expect(cut.map(m => m.uri), 'the control: the listing cuts cr:X out because the run cluster lists it').toEqual(['tmdb:9'])
  const whole = await findAggregatedMedia('tmdb:9')
  expect(whole.map(m => m.uri).sort()).toEqual(['cr:X', 'tmdb:9'])

  expect(aggregateMedia(cut, 'https://x')._id).toBe(aggregateMedia(whole, 'https://x')._id)
})

test('an old id still resolves the grown cluster, and resolves to its current root', async () => {
  await upsertMedia([media('anilist:1'), media('mal:2')], [])
  const idA = await idOf('anilist:1')
  const idB = await idOf('mal:2')
  expect(idA).not.toBe(idB)
  expect((await findAggregatedMedia(idA)).map(m => m.uri), 'a fresh id resolves its own singleton').toEqual(['anilist:1'])
  expect((await findAggregatedMedia(idB)).map(m => m.uri)).toEqual(['mal:2'])

  await union('anilist:1', 'mal:2')
  const kept = await idOf('anilist:1')
  expect([idA, idB], 'the merged cluster keeps one of the two ids').toContain(kept)
  const retired = kept === idA ? idB : idA
  for (const id of [idA, idB]) {
    expect((await findAggregatedMedia(id)).map(m => m.uri).sort(), `${id === kept ? 'the kept' : 'the retired'} id must still find both rows`)
      .toEqual(['anilist:1', 'mal:2'])
  }
  expect(graph.resolve(retired), 'the retired id is an alias of the survivor, not of the root it was minted under')
    .toBe(graph.root('anilist:1', IDENTITY_LABELS.RUN))
})

// The survivor is decided by SIZE and then by the smaller root, never by which side claimed: the
// union-find picks its root by rank and by argument order, and an id that followed that would change
// with the order two sources happen to land in.
test('the survivor is the larger component, ties to the smaller root, whichever side claimed', async () => {
  // {anilist:1, kitsu:5, anidb:7} has rank 1 and size 3; {mal:2, tmdb:3} has rank 1 and size 2, so
  // union-by-rank roots at whichever came first in the claim and only the size rule keeps A's id
  const buildA = async () => {
    await upsertMedia([media('anilist:1'), media('kitsu:5'), media('anidb:7')], [])
    await union('anilist:1', 'kitsu:5')
    await union('anilist:1', 'anidb:7')
    return idOf('anilist:1')
  }
  const buildB = async () => {
    await upsertMedia([media('mal:2'), media('tmdb:3')], [])
    await union('mal:2', 'tmdb:3')
    return idOf('mal:2')
  }
  for (const [mediaUri, handleUri] of [['mal:2', 'anilist:1'], ['anilist:1', 'mal:2']] as const) {
    resetStore()
    const a = await buildA()
    const b = await buildB()
    await union(mediaUri, handleUri)
    expect(await idOf('mal:2'), `claimed ${mediaUri} -> ${handleUri}: the three member component keeps its id`).toBe(a)
    expect(await idOf('mal:2')).not.toBe(b)
  }
  // a pair over a singleton, the singleton aggregated first
  for (const [mediaUri, handleUri] of [['mal:2', 'anilist:1'], ['anilist:1', 'mal:2']] as const) {
    resetStore()
    await upsertMedia([media('mal:2'), media('anilist:1'), media('kitsu:5')], [])
    const b = await idOf('mal:2')
    await union('anilist:1', 'kitsu:5')
    const a = await idOf('anilist:1')
    expect(a).not.toBe(b)
    await union(mediaUri, handleUri)
    expect(await idOf('anilist:1'), `claimed ${mediaUri} -> ${handleUri}: the pair keeps its id over the singleton`).toBe(a)
  }
  // the tie: two singletons, the lexicographically smaller root's id wins in both claim orders
  for (const [mediaUri, handleUri] of [['anilist:1', 'mal:2'], ['mal:2', 'anilist:1']] as const) {
    resetStore()
    await upsertMedia([media('anilist:1'), media('mal:2')], [])
    const first = await idOf('anilist:1')
    const second = await idOf('mal:2')
    await union(mediaUri, handleUri)
    expect(await idOf('mal:2'), `claimed ${mediaUri} -> ${handleUri}: anilist:1 sorts first`).toBe(first)
    expect(await idOf('mal:2')).not.toBe(second)
  }
})

test('a run cluster and a container cluster rooted at one uri have different ids', async () => {
  await upsertMedia([media('anilist:1'), media('cr:X')], [{ mediaUri: 'cr:X', handleUri: 'anilist:1', relation: 'SAME_AS' }])
  await upsertMedia([media('cr:X', 'CONTAINER'), media('tmdb:9', 'CONTAINER')], [{ mediaUri: 'cr:X', handleUri: 'tmdb:9', relation: 'SAME_AS' }])

  expect(graph.root('anilist:1', IDENTITY_LABELS.RUN), 'the control: both spaces root at cr:X, so only the label tells them apart').toBe('cr:X')
  expect(graph.root('tmdb:9', IDENTITY_LABELS.CONTAINER)).toBe('cr:X')

  const run = aggregateMedia(await findAggregatedMedia('anilist:1'), 'https://x')
  const container = aggregateMedia(await findAggregatedMedia('tmdb:9'), 'https://x')
  expect(run.scope).toBe('RUN')
  expect(container.scope).toBe('CONTAINER')
  expect(run._id).not.toBe(container._id)

  await upsertMedia([media('mal:2'), media('kitsu:5')], [])
  expect(await idOf('mal:2'), 'two unrelated singletons differ').not.toBe(await idOf('kitsu:5'))
})

test('the media and episode spaces never share an id', async () => {
  expect(graph.componentId('a:1', IDENTITY_LABELS.RUN)).not.toBe(graph.componentId('a:1', IDENTITY_LABELS.EPISODE))
  expect(graph.componentId('a:1', IDENTITY_LABELS.RUN), 'asking twice is the same id').toBe(graph.componentId('a:1', IDENTITY_LABELS.RUN))

  const episode = { uri: 'anilist:1-1', origin: 'anilist', id: '1-1', mediaUri: 'anilist:1', episodeNumber: 1, titles: [] } as any
  await upsertMedia([media('anilist:1')], [])
  await upsertEpisodes([episode], [])
  expect(aggregateEpisode([episode], 'https://x')._id, 'an episode cluster is keyed in the episode space')
    .toBe(graph.componentId('anilist:1-1', IDENTITY_LABELS.EPISODE))
})

// `componentId` aliases every id it mints into the one alias table `findAggregatedMedia` resolves
// through, episode ids included, and an episode node typed as a Media is a row no page can render.
test('an episode id, or an episode uri, never resolves as a media cluster', async () => {
  const episode = { uri: 'anilist:1-1', origin: 'anilist', id: '1-1', mediaUri: 'anilist:1', episodeNumber: 1, titles: [] } as any
  await upsertMedia([media('anilist:1')], [])
  await upsertEpisodes([episode], [])
  const id = aggregateEpisode([episode], 'https://x')._id
  expect(id).toMatch(UUID)

  expect(await findAggregatedMedia(id)).toEqual([])
  expect(await findAggregatedMedia('anilist:1-1')).toEqual([])
  expect((await findAggregatedMedia('anilist:1')).map(m => m.uri), 'the control: the media it belongs to still resolves').toEqual(['anilist:1'])
})

test('resetStore forgets every id', async () => {
  await upsertMedia([media('anilist:1')], [])
  const before = await idOf('anilist:1')
  resetStore()
  await upsertMedia([media('anilist:1')], [])
  expect(await idOf('anilist:1')).not.toBe(before)
})
