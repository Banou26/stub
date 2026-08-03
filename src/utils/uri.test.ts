import { describe, expect, test } from 'vitest'

import { isRoutableUri } from './uri'

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
