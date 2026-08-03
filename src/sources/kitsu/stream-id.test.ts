import { describe, expect, test } from 'vitest'

import { streamContentId } from './stream-id'

describe('streamContentId', () => {
  test('reads the id out of a link that names one', () => {
    expect(streamContentId('https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei')).toBe('G24H1N3MP')
    expect(streamContentId('https://www.netflix.com/title/80987039')).toBe('80987039')
    expect(streamContentId('https://www.hulu.com/series/95e491fa-cdad')).toBe('95e491fa-cdad')
  })

  test('a query or fragment is not part of the id', () => {
    expect(streamContentId('https://www.crunchyroll.com/series/G24H1N3MP?utm=x')).toBe('G24H1N3MP')
    expect(streamContentId('https://www.crunchyroll.com/series/G24H1N3MP#top')).toBe('G24H1N3MP')
  })

  // the regression: this exact link minted `cr:https://www.crunchyroll.com/mushoku-tensei-jobless-
  // reincarnation`, whose slashes made the watch route unmatchable and rendered the catch-all 404
  test('a link with no id segment yields NOTHING, never the url itself', () => {
    expect(streamContentId('https://www.crunchyroll.com/mushoku-tensei-jobless-reincarnation')).toBeUndefined()
    expect(streamContentId('https://www.crunchyroll.com/')).toBeUndefined()
    expect(streamContentId('not a url at all')).toBeUndefined()
  })
})
