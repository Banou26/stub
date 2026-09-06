import { describe, expect, test } from 'vitest'

import { scoreMood } from '../../../src/utils/score'

describe('scoreMood', () => {
  test('AniList’s own thresholds, so a media carries the same face it does there', () => {
    expect(scoreMood(90)).toBe('good')
    expect(scoreMood(75)).toBe('good')
    expect(scoreMood(74)).toBe('mixed')
    expect(scoreMood(67)).toBe('mixed')
    expect(scoreMood(60)).toBe('mixed')
    expect(scoreMood(59)).toBe('poor')
    expect(scoreMood(1)).toBe('poor')
  })
})
