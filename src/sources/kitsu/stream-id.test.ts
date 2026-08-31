import { describe, expect, test } from 'vitest'

import { streamContentId, streamLinkIsIdentifying } from './stream-id'

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

// The id `streamContentId` reads is the SHOW's, because the link kitsu publishes is the show's. These
// three urls are what /anime/<id>/streaming-links really answered on 2026-08-31, one per media:
//
//   kitsu:45950  Mushoku Tensei season 2         .../series/G24H1N3MP/mushoku-tensei-jobless-reincarnation
//   kitsu:47694  Mushoku Tensei season 2 part 2  .../series/G24H1N3MP/mushoku-tensei-jobless-reincarnation
//   kitsu:49002  Mushoku Tensei season 3         .../series/G24H1N3MP/mushoku-tensei-jobless-reincarnation
//
// One id, three seasons. A handle is an identity claim, so minting it on all three welds them into one
// cluster in `upsertMedia` before any season mechanism runs, and it hands Crunchyroll a season-less id
// whose episode list is every season at once. That is what put 24 rows on a 14 episode season page.
//
// False here routes the link through `ctx.resolveSeason` instead of dropping it, so the offer
// survives as a season-scoped handle. See `streamHandles` in ./extractor.ts.
describe('streamLinkIsIdentifying', () => {
  test('a series is NOT minted directly, because kitsu only ever links the show', () => {
    expect(streamLinkIsIdentifying('TV')).toBe(false)
    expect(streamLinkIsIdentifying('ONA')).toBe(false)
    expect(streamLinkIsIdentifying('OVA')).toBe(false)
    expect(streamLinkIsIdentifying('special')).toBe(false)
  })

  test('a movie does, since it has no seasons to be confused between', () => {
    expect(streamLinkIsIdentifying('movie')).toBe(true)
  })

  test('an absent subtype is a refusal, never a guess', () => {
    expect(streamLinkIsIdentifying(undefined)).toBe(false)
    expect(streamLinkIsIdentifying(null)).toBe(false)
    expect(streamLinkIsIdentifying('')).toBe(false)
  })
})
