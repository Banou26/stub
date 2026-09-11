// The two members of `MediaSort` pointed the wrong way from the commit that introduced them (793f3da,
// 2025-09-01) until 2026-09-12: `POPULARITY` sorted descending and `POPULARITY_DESC` ascending. It
// survived a year because the inversion was symmetric and both pages sent the bare member, so the
// only member whose name described the other one's behaviour was the only one nothing asked for.
// These pin the direction by the name, which is the part a reader trusts and cannot run.
import { describe, expect, test } from 'vitest'

import { applyMediaSorts } from '../../../../src/worker/store/filter'

// an aggregated row as the page receives it, cut down to the one field a sort reads
const media = (uri: string, popularity: number | null) => ({ uri, popularity }) as any

const uris = (medias: { uri: string }[]) => medias.map(media => media.uri)

const page = [
  media('anilist:2', 40_000),
  media('anilist:1', 900_000),
  media('anilist:3', 7_000),
]

describe('applyMediaSorts', () => {
  test('POPULARITY sorts ascending, least popular first', () => {
    expect(uris(applyMediaSorts(page, ['POPULARITY']))).toEqual(['anilist:3', 'anilist:2', 'anilist:1'])
  })

  // what the home row and the search page send, and the order they render without re-sorting
  test('POPULARITY_DESC sorts descending, most popular first', () => {
    expect(uris(applyMediaSorts(page, ['POPULARITY_DESC']))).toEqual(['anilist:1', 'anilist:2', 'anilist:3'])
  })

  // A row 24 sources describe and none counted is unranked, not unpopular. Ascending used to read it
  // as zero and open the page on it; the home listing has always relied on descending burying it
  // (utils/settled-order.ts, measured 2026-09-06).
  test('a media with no popularity sorts last in both directions', () => {
    const withUnranked = [
      media('kitsu:4', null),
      media('anilist:2', 40_000),
      media('tmdb:5', 0),
      media('anilist:1', 900_000),
    ]
    expect(uris(applyMediaSorts(withUnranked, ['POPULARITY'])))
      .toEqual(['tmdb:5', 'anilist:2', 'anilist:1', 'kitsu:4'])
    expect(uris(applyMediaSorts(withUnranked, ['POPULARITY_DESC'])))
      .toEqual(['anilist:1', 'anilist:2', 'tmdb:5', 'kitsu:4'])
  })

  test('two unranked rows keep the order they arrived in, in both directions', () => {
    const unranked = [media('kitsu:4', null), media('tvdb:6', null), media('anilist:1', 900_000)]
    expect(uris(applyMediaSorts(unranked, ['POPULARITY']))).toEqual(['anilist:1', 'kitsu:4', 'tvdb:6'])
    expect(uris(applyMediaSorts(unranked, ['POPULARITY_DESC']))).toEqual(['anilist:1', 'kitsu:4', 'tvdb:6'])
  })

  test('the last member named decides, and an unknown one is ignored', () => {
    expect(uris(applyMediaSorts(page, ['POPULARITY_DESC', 'POPULARITY'])))
      .toEqual(['anilist:3', 'anilist:2', 'anilist:1'])
    expect(uris(applyMediaSorts(page, ['SCORE_DESC' as string, 'POPULARITY_DESC'])))
      .toEqual(['anilist:1', 'anilist:2', 'anilist:3'])
  })

  test('no sorts leaves the page in the order the filters left it', () => {
    expect(uris(applyMediaSorts(page, []))).toEqual(uris(page))
    expect(uris(applyMediaSorts(page, null))).toEqual(uris(page))
    expect(uris(applyMediaSorts(page, undefined))).toEqual(uris(page))
  })

  // the resolver reassigns the result, but a caller that keeps the unsorted page must still have one
  test('the input array is not reordered', () => {
    const given = [media('anilist:2', 40_000), media('anilist:1', 900_000)]
    applyMediaSorts(given, ['POPULARITY_DESC'])
    expect(uris(given)).toEqual(['anilist:2', 'anilist:1'])
  })
})
