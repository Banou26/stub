import { describe, expect, test } from 'vitest'

import { parseSeasonNumber, pickSeasonByEpisodeCount, seasonScopedId, splitSeasonScopedId } from './season'

describe('parseSeasonNumber', () => {
  test('reads the forms a title actually uses', () => {
    expect(parseSeasonNumber('Mushoku Tensei Season 3')).toBe(3)
    expect(parseSeasonNumber('Mushoku Tensei Part 2')).toBe(2)
    expect(parseSeasonNumber('Something Cour 2')).toBe(2)
  })

  test('a title that names no season says so', () => {
    expect(parseSeasonNumber('Cowboy Bebop')).toBeUndefined()
  })
})

describe('pickSeasonByEpisodeCount', () => {
  test('picks the closest match', () => {
    const seasons = [{ seasonNumber: 1, episodeCount: 23 }, { seasonNumber: 2, episodeCount: 12 }]
    expect(pickSeasonByEpisodeCount(seasons, 12)).toBe(2)
    expect(pickSeasonByEpisodeCount(seasons, 22)).toBe(1)
  })

  // one season is not a choice, and answering anyway would report a season the caller never asked about
  test('a single season is not chosen between', () => {
    expect(pickSeasonByEpisodeCount([{ seasonNumber: 1, episodeCount: 12 }], 12)).toBeUndefined()
    expect(pickSeasonByEpisodeCount([], 12)).toBeUndefined()
  })
})

describe('seasonScopedId', () => {
  test('every season of one show gets a DISTINCT id, or clustering merges them', () => {
    const ids = [1, 2, 3].map(season => seasonScopedId('94664', season))
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual(['94664-s1', '94664-s2', '94664-s3'])
  })

  test('round-trips, so resolving the uri still asks TMDB for a show it knows', () => {
    expect(splitSeasonScopedId(seasonScopedId('94664', 3))).toEqual({ showId: '94664', seasonNumber: 3 })
  })

  test('a show-level id is passed through whole', () => {
    expect(splitSeasonScopedId('94664')).toEqual({ showId: '94664' })
  })

  // '94664-s3e1' is an EPISODE id and must not be mistaken for a season-scoped media id
  test('an episode id is not season-scoped', () => {
    expect(splitSeasonScopedId('94664-s3e1')).toEqual({ showId: '94664-s3e1' })
  })
})
