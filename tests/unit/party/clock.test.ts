// The follower's whole claim to know where the host is rests on this arithmetic: a playback message
// carries the host's clock, and a clock two seconds fast is indistinguishable from a message two
// seconds old until somebody times a round trip.
import { describe, expect, test } from 'vitest'

import { bestSample, clockSample, MAX_USABLE_RTT_MS, toHostTime, toLocalTime } from '../../../src/party/clock'

describe('clockSample', () => {
  // The host's clock reads 10s ahead of ours, and the round trip takes 200ms. Whatever the split
  // between the two legs, the midpoint is the estimate and it is right here.
  test('a symmetric round trip recovers the offset exactly', () => {
    const sent = 1_000
    const received = 1_200
    const hostAt = 1_100 + 10_000
    expect(clockSample(sent, hostAt, received)).toEqual({ rtt: 200, offset: 10_000 })
  })

  test('the error is bounded by half the round trip, however asymmetric the legs', () => {
    const sent = 0
    const received = 200
    // the reply happened at the very start of the trip, and at the very end: the two extremes
    const earliest = clockSample(sent, 0 + 10_000, received).offset
    const latest = clockSample(sent, 200 + 10_000, received).offset
    expect(earliest).toBe(10_000 - 100)
    expect(latest).toBe(10_000 + 100)
    for (const offset of [earliest, latest]) expect(Math.abs(offset - 10_000)).toBeLessThanOrEqual(200 / 2)
  })

  test('two clocks that agree measure no offset', () => {
    expect(clockSample(500, 600, 700).offset).toBe(0)
  })
})

describe('bestSample', () => {
  // The fastest exchange is the most accurate one: its error is bounded by half of the smallest
  // round trip. Averaging it with a delayed sample can only widen that bound.
  test('the fastest round trip wins, not the average', () => {
    const samples = [
      { rtt: 900, offset: 400 },
      { rtt: 40, offset: 10 },
      { rtt: 600, offset: -250 },
    ]
    expect(bestSample(samples)).toEqual({ rtt: 40, offset: 10 })
  })

  test('nothing measured is nothing to believe', () => {
    expect(bestSample([])).toBeUndefined()
  })
})

describe('toLocalTime and toHostTime', () => {
  test('a host stamp becomes a local one and back', () => {
    const hostAt = 1_788_700_010_000
    const offset = 10_000
    expect(toLocalTime(hostAt, offset)).toBe(1_788_700_000_000)
    expect(toHostTime(toLocalTime(hostAt, offset), offset)).toBe(hostAt)
  })

  // A follower that has not finished an exchange behaves exactly as one did before any of this
  // existed, which is what makes the measurement an improvement rather than a dependency.
  test('no offset is the identity', () => {
    expect(toLocalTime(1_234, 0)).toBe(1_234)
    expect(toHostTime(1_234, 0)).toBe(1_234)
  })

  test('a round trip too slow to say anything is named, not guessed at', () => {
    expect(MAX_USABLE_RTT_MS).toBeGreaterThan(0)
  })
})
