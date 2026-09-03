// `worker/extractor.ts` builds the live source list as `Object.values(extractorDefinitions)`, so what
// this module exports IS what runs. A source is disabled by not being exported here, which is a
// deletion of one line and therefore silently undone by anyone adding one back.
import { expect, test } from 'vitest'

import * as sources from './index'

// See the note at the foot of ./index.ts. Watchmode has no season concept, so every provider handle it
// minted was a show-level id, and a handle is an identity claim: each one welds two runs of a show into
// one media, permanently. Refusing them individually would have left it minting only `imdb`, which
// worker/store/db.ts already declines to link, so it would have contributed nothing while still asking
// for an API key.
test('watchmode is not exported, so it is not a live source', () => {
  expect(Object.keys(sources)).not.toContain('watchmode')
})

// The disable has to cost exactly one source. A wildcard or a bad edit that dropped others would
// otherwise pass the assertion above by taking everything down with it.
test('every other source is still exported', () => {
  const names = Object.keys(sources)
  for (const name of [
    'jikan', 'anilist', 'anizip', 'crunchyroll', 'unogs', 'justwatch', 'appletv', 'paramount',
    'disney', 'amazon', 'hulu', 'peacock', 'hbo', 'fubo', 'tmdb', 'tvmaze', 'kitsu', 'omdb',
    'trakt', 'simkl', 'tvdb', 'offline',
  ]) expect(names, name).toContain(name)
  expect(names).toHaveLength(22)
})

// A key prompt for a source that does not run asks someone to sign up for nothing.
test('no key is requested for a source that is not exported', async () => {
  const { keyConfigs } = await import('./key-configs')
  const names = Object.keys(sources)
  for (const config of keyConfigs) expect(names, config.origin).toContain(config.origin)
})
