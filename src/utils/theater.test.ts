import { describe, expect, test } from 'vitest'

import { THEATER_POOL_SIZE, pickTheaterIndex, theaterCandidates } from './theater'

const media = (
  { title = true, description = true, trailer = false, score }:
  { title?: boolean, description?: boolean, trailer?: boolean, score?: number } = {}
) => ({
  score,
  titles: title ? [{ title: 'a title' }] : [],
  shortDescriptions: description ? [{ shortDescription: 'a description' }] : [],
  trailers: trailer ? [{ url: 'https://youtube.com/watch?v=x' }] : [],
})

describe('theaterCandidates', () => {
  // The 2026-08-16 regression, reproduced. Kitsu scores 0.3, the old gate needed >= 0.8, and every
  // record on the page was Kitsu's, so the hero rendered an empty shell over a full season row.
  test('a low-scoring source can still fill the hero', () => {
    const nodes = [media({ score: 0.3 }), media({ score: 0.3 })]
    expect(theaterCandidates(nodes)).toHaveLength(2)
    expect(nodes.some(node => (node.score ?? 0) >= 0.8)).toBe(false)
  })

  test('a media with no title or no description cannot fill the hero', () => {
    expect(theaterCandidates([media({ title: false })])).toHaveLength(0)
    expect(theaterCandidates([media({ description: false })])).toHaveLength(0)
    expect(theaterCandidates([])).toHaveLength(0)
  })

  // The hero autoplays a trailer, so one that has it is a better pick.
  test('media with a trailer are preferred when any exist', () => {
    const withTrailer = media({ trailer: true })
    const candidates = theaterCandidates([media(), withTrailer, media()])
    expect(candidates).toEqual([withTrailer])
  })

  // Preferred, not required: Kitsu carries a trailer on about half its season, and a hero with a
  // title and a description still beats no hero.
  test('falls back to media without a trailer rather than showing nothing', () => {
    expect(theaterCandidates([media(), media()])).toHaveLength(2)
  })
})

describe('pickTheaterIndex', () => {
  test('picks inside the candidate list', () => {
    expect(pickTheaterIndex(5, [], () => 0)).toBe(0)
    expect(pickTheaterIndex(5, [], limit => limit - 1)).toBe(4)
  })

  test('never picks a banned index', () => {
    // 0, 1 and 2 are banned, so every allowed slot must come from 3 and 4
    for (let choice = 0; choice < 2; choice++) {
      expect([3, 4]).toContain(pickTheaterIndex(5, [0, 1, 2], () => choice))
    }
  })

  // The previous loop retried until it found an unbanned index, so banning them all spun forever.
  // onTrailerError bans one per failed trailer, so a few dead trailers was enough.
  test('gives up instead of looping when every choice is banned', () => {
    expect(pickTheaterIndex(3, [0, 1, 2])).toBeUndefined()
  })

  test('an empty candidate list selects nothing', () => {
    expect(pickTheaterIndex(0)).toBeUndefined()
    expect(pickTheaterIndex(-1)).toBeUndefined()
  })

  // The hero is a highlight reel, not the whole season.
  test('never reaches past the pool size', () => {
    for (let choice = 0; choice < 40; choice++) {
      const index = pickTheaterIndex(117, [], () => choice % 117)
      expect(index).toBeLessThan(THEATER_POOL_SIZE)
    }
  })

  // A pick function that answers out of range must not produce an out-of-bounds index.
  test('an out-of-range pick is clamped rather than returning undefined', () => {
    expect(pickTheaterIndex(5, [], () => 999)).toBe(4)
    expect(pickTheaterIndex(5, [], () => -3)).toBe(0)
  })
})
