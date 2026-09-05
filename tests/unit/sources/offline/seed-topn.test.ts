// The owner's scope, 2026-09-05: walk the top 50 to 100 of the season by popularity, once a season,
// and let the rest stay on the bundle ("the rest doesn't really matter"). The first three walks took
// every run the manami buckets named, 306 of them, which is the proxy load that made this the wrong
// shape: 273 of those were shows nobody is looking at, and the two gate rules they failed
// (streaming share, median identity) are exactly the ones an unpopular show cannot satisfy.
//
// Ranking is by the popularity the LIVE listing reported, since that is the only real popularity in
// the store: the manami bundle has none at all.
import { expect, test } from 'vitest'

import { rankByPopularity } from '../../../../src/sources/offline/seed-build'

const cluster = (uri: string, popularity: number | null) => ({
  members: [{ uri, origin: uri.slice(0, uri.indexOf(':')), id: uri.slice(uri.indexOf(':') + 1), popularity }],
  partOf: [],
  episodes: [],
}) as any

test('the most popular runs come first, and the cap keeps that many', () => {
  const clusters = [cluster('anilist:1', 40), cluster('anilist:2', 900), cluster('anilist:3', 300)]

  expect(rankByPopularity(clusters, 2).map(entry => entry.members[0].uri)).toEqual(['anilist:2', 'anilist:3'])
})

test('a run with no popularity ranks last, because the bundle already covers it', () => {
  const clusters = [cluster('anilist:1', null), cluster('anilist:2', 5)]

  expect(rankByPopularity(clusters, 10).map(entry => entry.members[0].uri)).toEqual(['anilist:2', 'anilist:1'])
})

test('a cluster is ranked by its most popular member, and the cap never invents entries', () => {
  const twoMembers = { members: [{ uri: 'kitsu:9', popularity: 10 }, { uri: 'anilist:9', popularity: 800 }], partOf: [], episodes: [] } as any
  const clusters = [cluster('anilist:1', 500), twoMembers]

  expect(rankByPopularity(clusters, 99).map(entry => entry.members[0].uri), 'the 800 outranks the 500').toEqual(['kitsu:9', 'anilist:1'])
  expect(rankByPopularity([], 50), 'nothing in, nothing out').toEqual([])
})
