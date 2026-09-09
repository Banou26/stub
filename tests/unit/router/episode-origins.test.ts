// Which origins an episode row can show. This was read off the episode's URI until 2026-09-10, and
// `aggregateEpisode` gives a cluster of ONE its member's raw uri rather than an `ag:(...)` one, so
// `fromAggregatedUri` returned undefined, the id list came out empty, `originPage` yields nothing at
// all for an empty list, and the row rendered with no icons while holding a playable url. Netflix is
// where it showed: an episode only Netflix has had no source on it.
import { expect, test } from 'vitest'

import { episodeOriginIds } from '../../../src/router/home/episode-origins'

const handle = (origin: string, relation = 'SAME_AS') => ({ relation, node: { origin } })

// The regression case, and the reason it was invisible: a sole source still has one SAME_AS handle,
// so the row has everything it needs to name the origin and used to name none.
test('an episode exactly one source knows still names that source', () => {
  expect(episodeOriginIds({ handles: [handle('nf')] })).toEqual(['nf'])
})

test('an episode several sources know names each of them once', () => {
  const episode = { handles: [handle('cr'), handle('nf'), handle('anizip'), handle('nf')] }
  expect(episodeOriginIds(episode)).toEqual(['cr', 'nf', 'anizip'])
})

// PART_OF names a DIFFERENT episode, and these ids route into playback, so one taken from a PART_OF
// handle would point the player at the wrong stream.
test('a PART_OF handle is not a source for this episode', () => {
  const episode = { handles: [handle('cr'), handle('nf', 'PART_OF')] }
  expect(episodeOriginIds(episode)).toEqual(['cr'])
})

test('an episode with no handles names nothing, rather than throwing', () => {
  expect(episodeOriginIds({ handles: [] })).toEqual([])
  expect(episodeOriginIds({ handles: null })).toEqual([])
  expect(episodeOriginIds({})).toEqual([])
  expect(episodeOriginIds(null)).toEqual([])
  expect(episodeOriginIds(undefined)).toEqual([])
})
