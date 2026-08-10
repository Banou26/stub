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

// Counted over 4159 real AniList and ani.zip titles, the English prefix form is only 176 of the 438
// titles that name a season at all. The rest read as ordinary title words until now.
describe('parseSeasonNumber, non-English forms', () => {
  test('reads the English ordinal form', () => {
    expect(parseSeasonNumber('Sousou no Frieren 2nd Season')).toBe(2)
    expect(parseSeasonNumber('Tensei Shitara Slime Datta Ken 4th Season')).toBe(4)
    expect(parseSeasonNumber('Kanojo Okarishimasu 1st Season')).toBe(1)
    expect(parseSeasonNumber('Osomatsu-san 3rd Season')).toBe(3)
  })

  test('reads the CJK forms, including Chinese numerals', () => {
    expect(parseSeasonNumber('転生したら剣でした 第2期')).toBe(2)
    expect(parseSeasonNumber('幼女战记 第二季')).toBe(2)
    expect(parseSeasonNumber('小书痴的下克上 第四季')).toBe(4)
    expect(parseSeasonNumber('おでかけ子ザメ シーズン2')).toBe(2)
    expect(parseSeasonNumber('전생했더니 슬라임이었던 건에 대하여 4기')).toBe(4)
    expect(parseSeasonNumber('Youjo Senki S2')).toBe(2)
  })

  test('十 multiplies rather than counting as a digit', () => {
    expect(parseSeasonNumber('なにか 第十期')).toBe(10)
    expect(parseSeasonNumber('なにか 第十二期')).toBe(12)
    expect(parseSeasonNumber('なにか 第二十期')).toBe(20)
  })

  // A season number gates a merge, so inventing one silently blocks two records of one show
  // from ever joining.
  test('does not invent a season', () => {
    expect(parseSeasonNumber('Death Note')).toBeUndefined()
    expect(parseSeasonNumber('Cowboy Bebop')).toBeUndefined()
    // 話 and 集 count episodes
    expect(parseSeasonNumber('進撃の巨人 第1話')).toBeUndefined()
    expect(parseSeasonNumber('鬼滅の刃 第25集')).toBeUndefined()
    // a bare trailing number names nothing: 284 of the 4159 real titles end in one and most are
    // not seasons, so `Kidou Keisatsu Patlabor EZY File 1` must stay season-less
    expect(parseSeasonNumber('Yami Shibai 17')).toBeUndefined()
    expect(parseSeasonNumber('Kidou Keisatsu Patlabor EZY File 1')).toBeUndefined()
  })
})
