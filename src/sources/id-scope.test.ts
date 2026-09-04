// The store used to ask an ORIGIN-level question, `SHOW_LEVEL_ORIGINS.has('imdb')`, which cannot tell
// `cr:G24H1N3MP` from `cr:G24H1N3MP-GS00374452`: one is a Crunchyroll series holding three seasons and
// the other is one of them. These tests pin the per-id answers, and the first one pins the way the
// whole feature can go silently inert.
import { expect, test } from 'vitest'

import * as sources from './index'
import { ID_SCOPES, scopeOfUri } from './id-scope'

// THE INERT CONTROL, and the reason it is first.
//
// `scopeOfUri` looks the origin up and falls back to UNKNOWN, and UNKNOWN is exactly how the store
// behaved before this module existed. So a key naming no origin makes the feature a complete no-op
// with every other test in the repo still green. That is not hypothetical: two of the origins differ
// from their folder name, `jikan` exports `mal` and `justwatch` exports `jw`, so the obvious key is
// the wrong one twice over.
test('every key in ID_SCOPES is an origin that a source actually exports', () => {
  const exported = new Set(
    Object.values(sources)
      .map(source => (source as { origin?: string }).origin)
      .filter((origin): origin is string => typeof origin === 'string')
  )

  expect(exported.size, 'the source barrel must have loaded, or this test proves nothing').toBeGreaterThan(20)
  for (const key of Object.keys(ID_SCOPES)) {
    expect(exported.has(key), `ID_SCOPES key '${key}' names no origin, so it answers UNKNOWN forever`).toBe(true)
  }
})

// A bare Crunchyroll id is the SERIES. Two segments is `<series>-<season>`, which is one run.
test('a bare crunchyroll id is a container and a season-scoped one is a run', () => {
  expect(scopeOfUri('cr:G24H1N3MP')).toBe('CONTAINER')
  expect(scopeOfUri('cr:G24H1N3MP-GS00374452')).toBe('RUN')
})

// Netflix is the case the id shape cannot decide: `normalizeTitle` builds one uri for a film and for a
// whole series alike, so the stored row's categories are the only thing that separates them.
test('a bare netflix id is decided by the categories on its row, not by its shape', () => {
  expect(scopeOfUri('nf:80987039', { categories: ['SERIES'] })).toBe('CONTAINER')
  expect(scopeOfUri('nf:80223226', { categories: ['MOVIE'] })).toBe('RUN')
  expect(scopeOfUri('nf:80987039-3', { categories: ['SERIES'] }), 'the suffix names one season').toBe('RUN')
})

// A bare netflix row minted by watchmode or justwatch carries `categories: []`, and nothing there says
// which it is. Guessing CONTAINER would be safe and guessing RUN would weld, so it does neither.
test('a bare netflix id with no categories answers UNKNOWN rather than guessing', () => {
  expect(scopeOfUri('nf:80987039')).toBe('UNKNOWN')
  expect(scopeOfUri('nf:80987039', { categories: [] })).toBe('UNKNOWN')
})

// The behaviour `SHOW_LEVEL_ORIGINS` had, kept byte-identical while the predicate moved.
test('an imdb id is a container', () => {
  expect(scopeOfUri('imdb:tt13303712')).toBe('CONTAINER')
})

// THE STEP-1 CONTRACT. Twenty-one origins have not been surveyed and every one of them has to behave
// exactly as it does today, or adopting this one source at a time is not possible. UNKNOWN is what
// makes that true, so it is worth a test of its own.
test('an unsurveyed origin answers UNKNOWN, which is what leaves it unchanged', () => {
  for (const uri of ['anilist:108465', 'kitsu:49002', 'mal:59193', 'tmdb:94664-s3', 'jw:222366-230388']) {
    expect(scopeOfUri(uri), `${uri} must stay unclassified until its source is surveyed`).toBe('UNKNOWN')
  }
})

test('a string that is not a uri answers UNKNOWN rather than throwing', () => {
  expect(scopeOfUri('nonsense')).toBe('UNKNOWN')
  expect(scopeOfUri('')).toBe('UNKNOWN')
})
