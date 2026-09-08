import { describe, expect, test } from 'vitest'

import { findAggregatedEpisodesForMedia, mergeByEpisodeNumber, upsertEpisodes, upsertMedia } from '../../../../src/worker/store/db'

// Two metadata sources describing one run used to come out as TWO full episode lists, because episodes
// only ever merged through an explicit EPISODE_SAME_AS and nothing mints one between two of them.
// Measured on Mushoku Tensei season 2 part 2: twelve kitsu rows with no titles, then the same twelve
// from anizip with every title and date, drawn as twenty four rows.

const episode = (uri: string, episodeNumber: number | null, extra: Record<string, unknown> = {}) =>
  ({ uri, origin: uri.slice(0, uri.indexOf(':')), episodeNumber, ...extra }) as any

describe('mergeByEpisodeNumber', () => {
  test('two sources describing the same run become one list, not two', () => {
    const groups = [
      ...Array.from({ length: 3 }, (_, index) => [episode(`kitsu:${index}`, index + 1)]),
      ...Array.from({ length: 3 }, (_, index) => [episode(`anizip:x-${index}`, index + 1)]),
    ]
    const merged = mergeByEpisodeNumber(groups)
    expect(merged).toHaveLength(3)
    for (const group of merged) expect(group.map(item => item.origin).sort()).toEqual(['anizip', 'kitsu'])
  })

  test('and the merged group carries BOTH sources, so the one with titles is still there', () => {
    const merged = mergeByEpisodeNumber([
      [episode('kitsu:1', 1)],
      [episode('anizip:x-1', 1, { titles: [{ title: 'My Dream Home' }] })],
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.some((item: any) => item.titles?.length)).toBe(true)
  })

  test('an episode already joined by a stated same-as keeps that group and gains the rest', () => {
    const merged = mergeByEpisodeNumber([
      [episode('kitsu:1', 1), episode('cr:1', 1)],
      [episode('anizip:x-1', 1)],
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toHaveLength(3)
  })

  test('different numbers stay different episodes', () => {
    const merged = mergeByEpisodeNumber([[episode('kitsu:1', 1)], [episode('kitsu:2', 2)]])
    expect(merged).toHaveLength(2)
  })

  test('a special carries no number, so it never collides with episode one', () => {
    // the collision that would matter: a special merged into a real episode loses both
    const merged = mergeByEpisodeNumber([
      [episode('anizip:x-S1', null)],
      [episode('anizip:x-S2', null)],
      [episode('kitsu:1', 1)],
    ])
    expect(merged).toHaveLength(3)
  })

  test('nor does a number that is not a whole positive one', () => {
    const merged = mergeByEpisodeNumber([
      [episode('a:1', 0)],
      [episode('b:1', -1)],
      [episode('c:1', 1.5)],
      [episode('d:1', Number.NaN)],
    ])
    expect(merged).toHaveLength(4)
  })

  test('a group whose first member is unnumbered still merges on a member that is numbered', () => {
    const merged = mergeByEpisodeNumber([
      [episode('kitsu:1', null), episode('cr:1', 4)],
      [episode('anizip:x-4', 4)],
    ])
    expect(merged).toHaveLength(1)
  })

  test('order is kept, so the list still reads in the order it arrived', () => {
    const merged = mergeByEpisodeNumber([
      [episode('kitsu:1', 1)], [episode('kitsu:2', 2)], [episode('anizip:x-1', 1)],
    ])
    expect(merged.map(group => group[0]!.episodeNumber)).toEqual([1, 2])
  })

  test('nothing in, nothing out', () => {
    expect(mergeByEpisodeNumber([])).toEqual([])
  })
})

// The tests above drive the rule directly, so they pass whether or not anything CALLS it: deleting the
// call site left all nine green. This one goes through the store, which is the path the page uses.
describe('findAggregatedEpisodesForMedia', () => {
  const storeEpisode = (uri: string, mediaUri: string, episodeNumber: number | null, title?: string) =>
    ({
      uri, origin: uri.slice(0, uri.indexOf(':')), id: uri.slice(uri.indexOf(':') + 1),
      mediaUri, episodeNumber, url: null, embedUrl: null, score: 1,
      titles: title ? [{ language: 'en', title, score: 1 }] : [],
      descriptions: [], shortDescriptions: [], thumbnails: [],
      releaseDate: null, seasonNumber: null, absoluteEpisodeNumber: null, runtime: null,
    }) as any

  test('one run described by two sources yields ONE episode per number, not two', async () => {
    // exactly the reported shape: kitsu numbers the run and gives no titles, anizip gives the titles
    const media = 'kitsu:900001'
    await upsertMedia([{ uri: media, origin: 'kitsu', id: '900001', titles: [] } as any], [])
    await upsertEpisodes(
      [
        ...Array.from({ length: 12 }, (_, index) => storeEpisode(`kitsu:9000${index}`, media, index + 1)),
        ...Array.from({ length: 12 }, (_, index) => storeEpisode(`anizip:900-${index}`, media, index + 1, `Episode ${index + 1}`)),
      ],
      [],
    )

    const groups = await findAggregatedEpisodesForMedia([media])
    expect(groups).toHaveLength(12)
    // and the titles survived the merge, which is the whole reason for keeping both sources
    for (const group of groups) {
      expect(group.map((episode: any) => episode.origin).sort()).toEqual(['anizip', 'kitsu'])
      expect(group.some((episode: any) => episode.titles?.length)).toBe(true)
    }
  })
})
