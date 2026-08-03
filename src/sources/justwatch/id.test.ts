import { describe, expect, test } from 'vitest'

import { jwId, providerContentId, showRequiresSeason, splitJwId } from './id'

// ts222366 is Mushoku Tensei: one JustWatch node carrying seasons 1, 2 and 3 (23, 24 and 6 released
// episodes respectively). Every season handing back `jw:222366` is what merged them into one media.
const MUSHOKU = 222366

describe('jwId', () => {
  test('every season of one show gets a DISTINCT id, or clustering merges them', () => {
    const ids = [1, 2, 3].map(season => jwId(MUSHOKU, season))
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual(['222366-1', '222366-2', '222366-3'])
  })
})

describe('splitJwId', () => {
  // resolving `jw:222366-3` has to end up asking JustWatch for node ts222366 and then keeping
  // season 3 - the id is the only place that season survives
  test('a season-scoped id resolves back to the node AND the season', () => {
    expect(splitJwId(jwId(MUSHOKU, 3))).toEqual({ objectId: '222366', seasonNumber: 3 })
    expect(splitJwId('222366-1')).toEqual({ objectId: '222366', seasonNumber: 1 })
  })

  test('a movie id has no season and is passed through whole', () => {
    expect(splitJwId('222366')).toEqual({ objectId: '222366' })
  })

  test('anything not <digits>-<digits> is left alone rather than half-parsed', () => {
    expect(splitJwId('222366-3-4')).toEqual({ objectId: '222366-3-4' })
    expect(splitJwId('tm12345')).toEqual({ objectId: 'tm12345' })
  })
})

describe('showRequiresSeason', () => {
  test('a series has no identity without a season, so it is not emitted without one', () => {
    expect(showRequiresSeason('SHOW')).toBe(true)
    // the search query does not fetch seasons, so its series results have no season to give
    expect(showRequiresSeason(undefined)).toBe(true)
  })

  test('a movie has no seasons to be confused between, so its bare node id is exact', () => {
    expect(showRequiresSeason('MOVIE')).toBe(false)
  })
})

describe('providerContentId', () => {
  test('a provider series id is scoped to the season, since the url names the show', () => {
    // hulu.com/series/<uuid> is the same uuid for season 2 and season 3
    expect(providerContentId('hulu', '95e491fa-cdad', 2)).toBe('95e491fa-cdad-2')
    expect(providerContentId('hulu', '95e491fa-cdad', 3)).toBe('95e491fa-cdad-3')
    expect(providerContentId('nf', '80987039', 3)).toBe('80987039-3')
  })

  test('with no season the id is left bare, which now only happens for a movie', () => {
    expect(providerContentId('hulu', '95e491fa-cdad')).toBe('95e491fa-cdad')
  })

  test('crunchyroll gets NO handle rather than one keyed on a season number', () => {
    // the crunchyroll source mints '<seriesId>-<seasonId>' (G24H1N3MP-GRDQCGX5E), so 'G24H1N3MP-3'
    // would cluster with nothing and surface as a second, emptier entry
    expect(providerContentId('cr', 'G24H1N3MP', 3)).toBeUndefined()
    expect(providerContentId('cr', 'G24H1N3MP')).toBe('G24H1N3MP')
  })
})
