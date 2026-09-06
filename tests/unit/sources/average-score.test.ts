// `Media.averageScore` is documented as a 0 to 100 percentage and six of the ten sources that fill it
// were emitting a 0 to 10 rating. jikan is one of them and OUTRANKS AniList in the aggregate, so the
// common case was a cluster carrying 8 for a show AniList scores 83. Nothing rendered the field until
// the search page's card and list modes did, and no test read it either, which is why it survived.
import { describe, expect, test } from 'vitest'

import { percentScore } from '../../../src/sources/average-score'

describe('percentScore', () => {
  test('a ten-point rating becomes a percentage', () => {
    expect(percentScore(8.34, 10)).toBe(83)
    expect(percentScore(10, 10)).toBe(100)
    expect(percentScore(6.7, 10)).toBe(67)
  })

  test('a hundred-point rating passes through', () => {
    expect(percentScore(83, 100)).toBe(83)
    expect(percentScore(100, 100)).toBe(100)
  })

  test('a numeric string is read, because two sources publish one', () => {
    expect(percentScore('82.35', 100)).toBe(82)
    expect(percentScore('8.2', 10)).toBe(82)
  })

  // Absence is spelled several ways across these APIs and every one of them has to answer the same
  // thing, or an unrated title renders a 0% face beside a rating nobody gave it.
  test('nothing usable answers undefined', () => {
    expect(percentScore(null, 10)).toBeUndefined()
    expect(percentScore(undefined, 10)).toBeUndefined()
    expect(percentScore(0, 10)).toBeUndefined()
    expect(percentScore('', 10)).toBeUndefined()
    expect(percentScore('n/a', 10)).toBeUndefined()
    expect(percentScore(Number.NaN, 100)).toBeUndefined()
  })

  // TheTVDB's `score` is a popularity figure in the thousands. It is no longer sent here at all, but a
  // value that cannot be a percentage must not become one if another source starts doing the same.
  test('a value that cannot be a percentage is refused, not clamped', () => {
    expect(percentScore(123456, 100)).toBeUndefined()
    expect(percentScore(11, 10)).toBeUndefined()
  })
})
