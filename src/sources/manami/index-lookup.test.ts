import { describe, expect, test } from 'vitest'

import { readIndex, rowId, type IndexBundle } from './index-lookup'

// mal ids 10, 25, 25 (absent), 60 encoded as deltas against the running total.
const bundle: IndexBundle = {
  mal: [10, 15, 0, 35],
  anilist: [100, 0, 300, 400],
  kitsu: [0, 200, 0, 0],
  anidb: [0, 0, 0, 4],
}

describe('readIndex', () => {
  // The delta coding is what makes the shipped artifact 40% smaller, and it is also the one thing
  // here that can corrupt every row after a mistake rather than just one.
  test('undoes the delta coding into absolute ids', () => {
    const index = readIndex(bundle)
    expect(index.lookup('mal', 10)?.anilist).toBe(100)
    expect(index.lookup('mal', 25)?.kitsu).toBe(200)
    expect(index.lookup('mal', 60)?.anidb).toBe(4)
  })

  // A zero in the mal column means "this row has no MyAnimeList id", NOT "a delta of zero". If it
  // advanced the running total, or were stored as the id 0, every id after it would shift.
  test('a zero is absence and does not advance the running total', () => {
    const index = readIndex(bundle)
    expect(index.lookup('mal', 0)).toBeUndefined()
    // row 2 carries no mal id, and row 3 still resolves to 25 + 35, not 25 + 0 + 35.
    expect(index.lookup('mal', 60)).toBeDefined()
    expect(index.lookup('anilist', 300)?.mal).toBe(0)
  })

  test('is searchable by every catalogue, not only by mal', () => {
    const index = readIndex(bundle)
    expect(index.lookup('anilist', 400)?.mal).toBe(60)
    expect(index.lookup('kitsu', 200)?.mal).toBe(25)
    expect(index.lookup('anidb', 4)?.anilist).toBe(400)
  })

  test('answers nothing for an id it does not hold', () => {
    const index = readIndex(bundle)
    expect(index.lookup('mal', 999999)).toBeUndefined()
    expect(index.lookup('anilist', 1)).toBeUndefined()
  })

  test('survives an empty bundle rather than throwing', () => {
    const index = readIndex({ mal: [], anilist: [], kitsu: [], anidb: [] })
    expect(index.size).toBe(0)
    expect(index.lookup('mal', 1)).toBeUndefined()
  })
})

describe('rowId', () => {
  // Must match the scheme normalize.ts uses, or the seasonal record and the index row become two
  // separate nodes for one show instead of one node supplied twice.
  test('prefers mal, then anilist, then kitsu, then anidb', () => {
    expect(rowId({ mal: 1, anilist: 2, kitsu: 3, anidb: 4 })).toBe('mal-1')
    expect(rowId({ mal: 0, anilist: 2, kitsu: 3, anidb: 4 })).toBe('anilist-2')
    expect(rowId({ mal: 0, anilist: 0, kitsu: 3, anidb: 4 })).toBe('kitsu-3')
    expect(rowId({ mal: 0, anilist: 0, kitsu: 0, anidb: 4 })).toBe('anidb-4')
  })

  test('has no id for an empty row', () => {
    expect(rowId({ mal: 0, anilist: 0, kitsu: 0, anidb: 0 })).toBeUndefined()
  })
})
