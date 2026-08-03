import { describe, expect, test } from 'vitest'

import { jwId, providerContentId, splitJwId } from './id'

// ts222366 is Mushoku Tensei: three seasons on one JustWatch node.
const MUSHOKU = 222366

describe('jwId', () => {
  test('every season of one show gets a DISTINCT id, or clustering merges them', () => {
    const ids = [1, 2, 3].map(season => jwId(MUSHOKU, season))
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual(['222366-1', '222366-2', '222366-3'])
  })

  test('a show with no season resolved keeps the bare node id', () => {
    expect(jwId(MUSHOKU)).toBe('222366')
    expect(jwId('222366', undefined)).toBe('222366')
  })

  test('round-trips, so resolving a jw: uri still asks for a node JustWatch knows', () => {
    expect(splitJwId(jwId(MUSHOKU, 3))).toEqual({ objectId: '222366', seasonNumber: 3 })
    expect(splitJwId(jwId(MUSHOKU))).toEqual({ objectId: '222366' })
  })

  test('a node id that is not <digits>-<digits> is passed through untouched', () => {
    expect(splitJwId('222366-3-4')).toEqual({ objectId: '222366-3-4' })
    expect(splitJwId('tm12345')).toEqual({ objectId: 'tm12345' })
  })
})

describe('providerContentId', () => {
  test('a provider series id is scoped to the season, since the url names the show', () => {
    // hulu.com/series/<uuid> is the same uuid for season 2 and season 3
    expect(providerContentId('hulu', '95e491fa-cdad', 2)).toBe('95e491fa-cdad-2')
    expect(providerContentId('hulu', '95e491fa-cdad', 3)).toBe('95e491fa-cdad-3')
    expect(providerContentId('nf', '80987039', 3)).toBe('80987039-3')
  })

  test('a single-season show keeps the bare provider id', () => {
    expect(providerContentId('hulu', '95e491fa-cdad')).toBe('95e491fa-cdad')
  })

  test('crunchyroll gets NO handle rather than one keyed on a season number', () => {
    // the crunchyroll source mints '<seriesId>-<seasonId>' (G24H1N3MP-GRDQCGX5E), so 'G24H1N3MP-3'
    // would cluster with nothing and surface as a second, emptier entry
    expect(providerContentId('cr', 'G24H1N3MP', 3)).toBeUndefined()
    expect(providerContentId('cr', 'G24H1N3MP')).toBe('G24H1N3MP')
  })
})

// The search path: mediaPage normalizes the node with no season, because JustWatch answers a query
// with the SHOW. Its provider ids are correct for the show and poison for stub, where every media is
// one season - a show-level hulu id lands on all of them and unions the lot.
describe('providerContentId on the search path', () => {
  test('a multi-season show contributes NO provider handle when the season is unknown', () => {
    expect(providerContentId('hulu', '95e491fa-cdad', undefined, true)).toBeUndefined()
    expect(providerContentId('cr', 'G24H1N3MP', undefined, true)).toBeUndefined()
    expect(providerContentId('nf', '80987039', undefined, true)).toBeUndefined()
  })

  test('a single-season show is unaffected: there is nothing for its id to merge with', () => {
    expect(providerContentId('hulu', '95e491fa-cdad', undefined, false)).toBe('95e491fa-cdad')
  })
})
