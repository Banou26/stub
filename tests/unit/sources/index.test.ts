// `worker/extractor.ts` builds the live source list as `Object.values(extractorDefinitions)`, so what
// this module exports IS what runs. A source is disabled by not being exported here, which is a
// deletion of one line and therefore silently undone by anyone adding one back.
import { expect, test } from 'vitest'

import * as sources from '../../../src/sources/index'

// Watchmode is BACK, on 2026-09-05, unchanged in what it knows and changed in what it claims: every
// provider handle it mints is show level, and it now mints them PART_OF rather than SAME_AS. It was
// unplugged for three commits because refusing them individually left it contributing nothing.
test('watchmode is exported again, now that a handle can carry a link without claiming sameness', () => {
  expect(Object.keys(sources)).toContain('watchmode')
})

// The disable has to cost exactly one source. A wildcard or a bad edit that dropped others would
// otherwise pass the assertion above by taking everything down with it.
test('every other source is still exported', () => {
  const names = Object.keys(sources)
  for (const name of [
    'jikan', 'anilist', 'anizip', 'crunchyroll', 'unogs', 'justwatch', 'appletv', 'paramount',
    'disney', 'amazon', 'hulu', 'peacock', 'hbo', 'fubo', 'tmdb', 'tvmaze', 'kitsu', 'omdb',
    'trakt', 'simkl', 'tvdb', 'offline', 'watchmode', 'imdb',
  ]) expect(names, name).toContain(name)
  expect(names).toHaveLength(24)
})

// A key prompt for a source that does not run asks someone to sign up for nothing.
test('no key is requested for a source that is not exported', async () => {
  const { keyConfigs } = await import('../../../src/sources/key-configs')
  const names = Object.keys(sources)
  for (const config of keyConfigs) expect(names, config.origin).toContain(config.origin)
})

// Dead schema surface is worse than missing surface: it reads as a promise. Two fields were removed on
// 2026-09-05 and this pins their absence, because both are the kind of thing a future edit re-adds
// "for symmetry" without noticing nothing implements them.
//
//   Media.handleOf / Episode.handleOf   declared, never resolved, never read. An inverse edge nobody
//                                       walked, so querying it returned null and looked like no data.
//   Media.externalLinks: String         plumbed through the store, aggregate and the wire, and set by
//                                       NO SOURCE, so it was null on every media ever built. Its name
//                                       also now describes what PART_OF handles actually do, which
//                                       made it worse than merely dead.
test('the schema declares no field that nothing implements', async () => {
  const { readFileSync } = await import('node:fs')
  const media = readFileSync(new URL('../../../src/worker/resolvers/media/schema.gql', import.meta.url), 'utf8')
  const episode = readFileSync(new URL('../../../src/worker/resolvers/episode/schema.gql', import.meta.url), 'utf8')

  expect(media, 'MediaHandle is the live surface; handleOf was never resolved').not.toContain('handleOf')
  expect(episode).not.toContain('handleOf')
  expect(media, 'no source ever set this, and PART_OF handles are what it pretended to be')
    .not.toContain('externalLinks')
  // the control: this file must actually be reading the schema, not an empty string
  expect(media).toContain('enum MediaHandleRelation')
})

// IMDb exists ONLY so an `imdb:tt...` handle has an origin to be rendered against. Five sources mint
// one and the handle reaches the client correctly, but the UI builds its rows from `originPage`, which
// lists registered origins: with none declaring `origin = 'imdb'` there was no name, no icon and no
// row, so the link was carried the whole way and dropped one line short of the screen.
test('imdb is a registered origin that answers nothing', async () => {
  const imdb = (sources as Record<string, any>).imdb

  expect(imdb.origin).toBe('imdb')
  expect(imdb.name).toBe('IMDb')
  // without both of these the row cannot render: `IsNotApiOnly` filters the list, and a row with no
  // icon is skipped outright by the media modal
  expect(imdb.isApiOnly).toBe(false)
  expect(imdb.icon).toBeTruthy()

  // and it must stay inert. An IMDb id names a SHOW and IMDb models no seasons, so anything it could
  // answer is the defect `SHOW_LEVEL_ORIGINS` exists to prevent.
  const { value } = await imdb.resolvers.Subscription.media.subscribe(undefined, { input: { uri: 'imdb:tt13303712' } }, {} as never).next()
  expect(value).toEqual({ media: null })
})
