// The one number that decides between a follower that stutters on every heartbeat and one that
// drifts is here, so it is pinned with the cases on both sides of it.
import { describe, expect, test } from 'vitest'

import { expectedTime, playbackCorrection, SEEK_TOLERANCE_S } from '../../../src/party/playback'

const NOW = 1_788_700_000_000

describe('expectedTime', () => {
  test('a playing report is moved forward by the time since it was made', () => {
    expect(expectedTime({ paused: false, time: 100, rate: 1, at: NOW - 500 }, NOW)).toBeCloseTo(100.5)
    expect(expectedTime({ paused: false, time: 100, rate: 2, at: NOW - 500 }, NOW)).toBeCloseTo(101)
  })

  test('a paused report does not move', () => {
    expect(expectedTime({ paused: true, time: 100, rate: 1, at: NOW - 30_000 }, NOW)).toBe(100)
  })

  // The host's clock and the follower's are different clocks. A report that looks minutes old is a
  // clock that is minutes off, not a video that played for minutes, and moving it forward by that
  // much would seek every follower to the wrong place on every heartbeat.
  test('the move forward is capped, so clock skew reads as transit', () => {
    expect(expectedTime({ paused: false, time: 100, rate: 1, at: NOW - 600_000 }, NOW)).toBeCloseTo(102)
    expect(expectedTime({ paused: false, time: 100, rate: 1, at: NOW + 600_000 }, NOW)).toBe(100)
  })
})

describe('playbackCorrection', () => {
  const wanted = { paused: false, time: 100, rate: 1, at: NOW }

  test('a follower inside the tolerance is left alone', () => {
    expect(playbackCorrection({ paused: false, time: 100 + SEEK_TOLERANCE_S - 0.1, rate: 1 }, wanted, NOW)).toEqual({})
    expect(playbackCorrection({ paused: false, time: 100 - SEEK_TOLERANCE_S + 0.1, rate: 1 }, wanted, NOW)).toEqual({})
  })

  test('and one outside it is seeked to where the host is', () => {
    expect(playbackCorrection({ paused: false, time: 100 + SEEK_TOLERANCE_S + 0.1, rate: 1 }, wanted, NOW)).toEqual({ seek: 100 })
    expect(playbackCorrection({ paused: false, time: 0, rate: 1 }, wanted, NOW)).toEqual({ seek: 100 })
  })

  test('play, pause and rate follow the host, each only when it differs', () => {
    expect(playbackCorrection({ paused: true, time: 100, rate: 1 }, wanted, NOW)).toEqual({ play: true })
    expect(playbackCorrection({ paused: false, time: 100, rate: 1 }, { ...wanted, paused: true }, NOW)).toEqual({ pause: true })
    expect(playbackCorrection({ paused: false, time: 100, rate: 1 }, { ...wanted, rate: 1.5 }, NOW)).toEqual({ rate: 1.5 })
    expect(playbackCorrection({ paused: true, time: 0, rate: 1 }, { ...wanted, rate: 1.5 }, NOW)).toEqual({ seek: 100, play: true, rate: 1.5 })
  })
})
