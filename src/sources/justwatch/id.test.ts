import { describe, expect, test } from 'vitest'

import { PACKAGE_ORIGIN_MAP, extractContentId, jwId, providerContentId, showRequiresSeason, splitJwId } from './id'

// ts222366 is Mushoku Tensei: one JustWatch node carrying three seasons, whose own objectIds are
// 230388, 378206 and 490814. Every season handing back `jw:222366` is what merged them into one media.
const MUSHOKU = 222366
const SEASONS = [230388, 378206, 490814]

describe('jwId', () => {
  test('every season of one show gets a DISTINCT id, or clustering merges them', () => {
    const ids = SEASONS.map(season => jwId(MUSHOKU, season))
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual(['222366-230388', '222366-378206', '222366-490814'])
  })

  // an ordinal moves when a season is renumbered, split into cours, or has a recap inserted ahead of
  // it; the season's own id does not, so an existing uri keeps pointing at the same episodes
  test("the suffix is the season's own id, not its position", () => {
    expect(jwId(MUSHOKU, 490814)).toBe('222366-490814')
    expect(jwId(MUSHOKU, 490814)).not.toBe('222366-3')
  })
})

describe('splitJwId', () => {
  // resolving `jw:222366-490814` has to end up asking JustWatch for node ts222366 and then keeping
  // the season whose objectId is 490814 - the id is the only place that season survives
  test('a season-scoped id resolves back to the node AND the season', () => {
    expect(splitJwId(jwId(MUSHOKU, 490814))).toEqual({ objectId: '222366', seasonObjectId: 490814 })
    expect(splitJwId('222366-230388')).toEqual({ objectId: '222366', seasonObjectId: 230388 })
  })

  test('a movie id has no season and is passed through whole', () => {
    expect(splitJwId('222366')).toEqual({ objectId: '222366' })
  })

  test('anything not <digits>-<digits> is left alone rather than half-parsed', () => {
    expect(splitJwId('222366-3-4')).toEqual({ objectId: '222366-3-4' })
    expect(splitJwId('tm12345')).toEqual({ objectId: 'tm12345' })
  })
})

describe('showRequiresSeason', () => {
  test('a series has no identity without a season, so it is not emitted without one', () => {
    expect(showRequiresSeason('SHOW')).toBe(true)
    // the search query does not fetch seasons, so its series results have no season to give
    expect(showRequiresSeason(undefined)).toBe(true)
  })

  test('a movie has no seasons to be confused between, so its bare node id is exact', () => {
    expect(showRequiresSeason('MOVIE')).toBe(false)
  })
})

describe('providerContentId', () => {
  test('a provider series id is scoped to the season, since the url names the show', () => {
    // hulu.com/series/<uuid> is the same uuid for season 2 and season 3
    expect(providerContentId('hulu', '95e491fa-cdad', 2)).toBe('95e491fa-cdad-2')
    expect(providerContentId('hulu', '95e491fa-cdad', 3)).toBe('95e491fa-cdad-3')
    expect(providerContentId('nf', '80987039', 3)).toBe('80987039-3')
  })

  test('with no season the id is left bare, which now only happens for a movie', () => {
    expect(providerContentId('hulu', '95e491fa-cdad')).toBe('95e491fa-cdad')
  })

  test('appletv is scoped the way the appletv source spells it, with an s', () => {
    // seasonScopedId builds '<id>-s<n>'. A bare '<id>-<n>' here is an id that source can never mint,
    // so the handle would cluster nothing and show up as a second, emptier Apple TV entry.
    expect(providerContentId('appletv', 'umc.cmc.2vru12c9n7324q0tdk324i0f', 2)).toBe('umc.cmc.2vru12c9n7324q0tdk324i0f-s2')
    expect(providerContentId('hulu', '95e491fa-cdad', 2)).toBe('95e491fa-cdad-2')
  })

  // This used to end `expect(providerContentId('cr', 'G24H1N3MP')).toBe('G24H1N3MP')`, pinning the
  // seasonless case as correct. It was not: `extractContentId` reads a crunchyroll id from `/series/`
  // urls and nothing else, so every id arriving here names a SERIES, and a series page holds every run
  // of the show plus, on Crunchyroll, the show's films. The refusal sat below the seasonless early
  // return, so the one case that reaches here without a season, a MOVIE, walked straight past it and
  // took the container id. Measured on kitsu 2026-09-04, the same id from the same urls: four Demon
  // Slayer films share cr:GY5P48XEY and fifteen Dragon Ball Z films share cr:GQWH0M1GG.
  test('crunchyroll gets NO handle, with or without a season number', () => {
    // the crunchyroll source mints '<seriesId>-<seasonId>' (G24H1N3MP-GRDQCGX5E), so 'G24H1N3MP-3'
    // would cluster with nothing and surface as a second, emptier entry
    expect(providerContentId('cr', 'G24H1N3MP', 3)).toBeUndefined()
    // and the bare series id is not a fallback, it is the container
    expect(providerContentId('cr', 'G24H1N3MP')).toBeUndefined()
    expect(providerContentId('cr', 'GY5P48XEY')).toBeUndefined()
  })
})

// Every url below is a REAL offer url, captured from the JustWatch api on 2026-09-01 by
// scripts/measure-justwatch-offer-ids.mjs. They are here rather than invented because the whole class
// of bug this pins is "the provider restyled its site and the id we read moved", which an invented
// url cannot express: it would be written to match whatever the function already does.
describe('extractContentId, against real offer urls', () => {
  test('netflix names the title in the path, and both tiers link the same way', () => {
    expect(extractContentId('https://www.netflix.com/title/81744420')).toBe('81744420')
    expect(extractContentId('https://www.netflix.com/title/70105699')).toBe('70105699')
  })

  test('prime video moved to watch.amazon.com with the id in a query param', () => {
    // the old host test was `startsWith('amazon.')`, which watch.amazon.com fails, and the old path
    // read would have returned the literal "detail" for every prime video title
    expect(extractContentId('https://watch.amazon.com/detail?gti=amzn1.dv.gti.14b575f2-7d6d-6bce-4709-2cb8bb8874f4'))
      .toBe('amzn1.dv.gti.14b575f2-7d6d-6bce-4709-2cb8bb8874f4')
  })

  test('apple tv gives the umc id, never the slug, and an episode names its show', () => {
    expect(extractContentId('https://tv.apple.com/us/movie/spirited/umc.cmc.3lp7wqowerzdbej98tveildi3?at=1000l3V2'))
      .toBe('umc.cmc.3lp7wqowerzdbej98tveildi3')
    // an episode url: the slug is the EPISODE's, and episode slugs repeat across shows, so the showId
    // query param is the only part of it worth minting a handle from
    expect(extractContentId('https://tv.apple.com/us/episode/the-starting-gate/umc.cmc.1qefhfibeor9m74fp1mo0dnf6?playableId=tvs.sbd.4000:A0121901001&showId=umc.cmc.2vru12c9n7324q0tdk324i0f'))
      .toBe('umc.cmc.2vru12c9n7324q0tdk324i0f')
  })

  test('disney+ moved to /browse/entity-<id>, which the old path read missed entirely', () => {
    expect(extractContentId('https://www.disneyplus.com/browse/entity-36ae14b1-c6f1-4271-a4cf-c9107f52957b'))
      .toBe('36ae14b1-c6f1-4271-a4cf-c9107f52957b')
    expect(extractContentId('https://www.disneyplus.com/play/f63874ef-939f-4a16-8fc0-043f3169f664'))
      .toBe('f63874ef-939f-4a16-8fc0-043f3169f664')
  })

  test('peacock names the SHOW mid-path on a series url and the movie last on a movie one', () => {
    expect(extractContentId('https://www.peacocktv.com/watch/asset/tv/parks-and-recreation/5883799404534408112/seasons/1/episodes/pilot-episode-1/04569a08-33e0-3835-9a21-76af2e31fa69'))
      .toBe('5883799404534408112')
    expect(extractContentId('https://www.peacocktv.com/watch/asset/movies/five-nights-at-freddys/d34768be-b99a-3b00-80b8-1e9253f7675e'))
      .toBe('d34768be-b99a-3b00-80b8-1e9253f7675e')
  })

  test('paramount+ names the show slug, which is what the paramount source itself mints', () => {
    expect(extractContentId('https://www.paramountplus.com/shows/avatar-the-last-airbender/video/L4FnbPcKqvTy_2nulIOWpsG1RWbgvibX/avatar-the-southern-air-temple'))
      .toBe('avatar-the-last-airbender')
  })

  test('fubo names the series id after /welcome/series', () => {
    expect(extractContentId('https://www.fubo.tv/welcome/series/113772324/hunter/?irmp=1206980&season=1')).toBe('113772324')
    expect(extractContentId('https://www.fubo.tv/welcome/program/MV001000000000?irmp=1206980')).toBe('MV001000000000')
  })

  // The regression this file exists for. Reading a fixed index out of an HBO series url returns the
  // literal 'watch', so every HBO title lands on `hbo:watch` and union-find merges all of them. It was
  // 25 titles in one 526-title corpus, and graph.link has no inverse.
  test('an hbo series url does NOT yield the literal "watch"', () => {
    expect(extractContentId('https://play.hbomax.com/video/watch/dae9e532-3714-4f2e-b758-fb9a13def902?utm_source=universal_search'))
      .toBe('dae9e532-3714-4f2e-b758-fb9a13def902')
    expect(extractContentId('https://play.hbomax.com/show/00ad6746-f3f0-4f6b-b8ea-0997f5880aa5?utm_source=universal_search'))
      .toBe('00ad6746-f3f0-4f6b-b8ea-0997f5880aa5')

    const series = ['dae9e532-3714-4f2e-b758-fb9a13def902', 'ef7d1c40-2ecc-471a-81a5-7fe06400240a', '8277da02-5ffc-478b-b5ba-a97c63ac3f45']
      .map(id => extractContentId(`https://play.hbomax.com/video/watch/${id}`))
    expect(new Set(series).size, 'three different HBO titles must not share one id').toBe(3)
    expect(series).not.toContain('watch')
  })

  test('an unmapped host yields nothing rather than a stray path segment', () => {
    expect(extractContentId('https://tubitv.com/series/300001/naruto')).toBeUndefined()
    expect(extractContentId('not a url')).toBeUndefined()
  })
})

describe('PACKAGE_ORIGIN_MAP', () => {
  test('one service can hold several tiers, and they all name the same origin', () => {
    expect(PACKAGE_ORIGIN_MAP.nfx).toBe('nf')
    expect(PACKAGE_ORIGIN_MAP.nfa).toBe('nf')
    expect(PACKAGE_ORIGIN_MAP.ppp).toBe('paramount')
    expect(PACKAGE_ORIGIN_MAP.ppe).toBe('paramount')
    expect(PACKAGE_ORIGIN_MAP.pcp).toBe('peacock')
    expect(PACKAGE_ORIGIN_MAP.pct).toBe('peacock')
  })

  test('the renamed services are mapped under the names JustWatch actually returns', () => {
    // hbm and pmp returned ZERO offers in 25 anime searches: HBO Max is mxx and Paramount+ split in two
    expect(PACKAGE_ORIGIN_MAP.hbm).toBeUndefined()
    expect(PACKAGE_ORIGIN_MAP.pmp).toBeUndefined()
    expect(PACKAGE_ORIGIN_MAP.mxx).toBe('hbo')
  })

  test('a resale channel is not its underlying service', () => {
    // "Crunchyroll Amazon Channel" outnumbers Crunchyroll itself, but plays on watch.amazon.com, so a
    // cr handle minted from it would assert an identity no crunchyroll call can reproduce
    expect(PACKAGE_ORIGIN_MAP.cra).toBeUndefined()
    expect(PACKAGE_ORIGIN_MAP.app).toBeUndefined()
    expect(PACKAGE_ORIGIN_MAP.aho).toBeUndefined()
  })
})
