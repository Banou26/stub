import { describe, expect, test } from 'vitest'

import { isRoutableUri, originsOfUri } from './uri'

describe('originsOfUri', () => {
  test('lists the origins an aggregated uri lets a source recognise itself by', () => {
    expect(originsOfUri('ag:(anilist:108465,kitsu:41371,mal:39535)').sort())
      .toEqual(['anilist', 'kitsu', 'mal'])
  })

  // one origin can contribute several handles to a cluster, and the caller only ever asks whether that
  // source is addressable at all, so the repeat must not show up twice
  test('deduplicates an origin that contributed several handles', () => {
    expect(originsOfUri('ag:(cr:G24H1N3MP,cr:GRDQCGX5E,mal:39535)').sort())
      .toEqual(['cr', 'mal'])
  })

  test('a bare handle uri is its own single origin', () => {
    expect(originsOfUri('anilist:108465')).toEqual(['anilist'])
  })

  test('something that is not a uri names no origins', () => {
    expect(originsOfUri('nocolon')).toEqual([])
    expect(originsOfUri('')).toEqual([])
  })

  // the whole point of the re-ask: what a narrow uri is MISSING is what has to be asked again
  test('a grown uri names origins the narrow one did not', () => {
    const narrow = originsOfUri('ag:(anilist:108465,kitsu:41371,mal:39535,offline:x)')
    const grown = originsOfUri('ag:(anilist:108465,cr:G24H1N3MP,kitsu:41371,mal:39535,nf:81074276,offline:x)')
    expect(grown.filter(origin => !narrow.includes(origin)).sort()).toEqual(['cr', 'nf'])
    expect(narrow.filter(origin => !grown.includes(origin))).toEqual([])
  })
})

describe('isRoutableUri', () => {
  test('an ordinary handle uri passes, including the compound ids sources mint', () => {
    for (const uri of ['anilist:108465', 'cr:G24H1N3MP-GRDQCGX5E', 'jw:222366-3', 'tmdb:94664-s3e1', 'imdb:tt13293588']) {
      expect(isRoutableUri(uri), uri).toBe(true)
    }
  })

  // A '/' splits '/watch/:mediaUri/:episodeUri' and a ',' splits the `ag:(...)` handle list, so either
  // one builds a media uri that matches no route at all - a bare "404 No page found".
  test('a url smuggled in as an id is rejected', () => {
    expect(isRoutableUri('cr:https://www.crunchyroll.com/mushoku-tensei-jobless-reincarnation')).toBe(false)
    expect(isRoutableUri('cr:some/path')).toBe(false)
  })

  test('a comma is rejected: it would split the handle list', () => {
    expect(isRoutableUri('cr:a,b')).toBe(false)
  })

  test('parens are rejected: they delimit the aggregate itself', () => {
    expect(isRoutableUri('cr:a(b)')).toBe(false)
  })

  test('something with no origin at all is not a uri', () => {
    expect(isRoutableUri('nocolon')).toBe(false)
    expect(isRoutableUri(':leading')).toBe(false)
  })
})
