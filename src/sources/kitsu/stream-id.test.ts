import { describe, expect, test } from 'vitest'

import { mintableAsFilmHandle, streamPointers } from './stream-id'

const scopeOf = (url: string) => streamPointers([url])[0]?.scope
const idOf = (url: string) => streamPointers([url])[0]?.id

describe('streamPointers', () => {
  test('reads the origin, the id and the segment the id came out of', () => {
    expect(streamPointers(['https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei'])).toEqual([{
      origin: 'cr',
      id: 'G24H1N3MP',
      url: 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei',
      scope: 'series',
    }])
    expect(streamPointers(['https://www.netflix.com/title/80987039'])).toEqual([{
      origin: 'nf',
      id: '80987039',
      url: 'https://www.netflix.com/title/80987039',
      scope: 'title',
    }])
  })

  test('a query or fragment is not part of the id', () => {
    expect(idOf('https://www.crunchyroll.com/series/G24H1N3MP?utm=x')).toBe('G24H1N3MP')
    expect(idOf('https://www.crunchyroll.com/series/G24H1N3MP#top')).toBe('G24H1N3MP')
  })

  // the regression: this exact link minted `cr:https://www.crunchyroll.com/mushoku-tensei-jobless-
  // reincarnation`, whose slashes made the watch route unmatchable and rendered the catch-all 404
  test('a link with no id segment yields NOTHING, never the url itself', () => {
    expect(streamPointers(['https://www.crunchyroll.com/mushoku-tensei-jobless-reincarnation'])).toEqual([])
    expect(streamPointers(['https://www.crunchyroll.com/'])).toEqual([])
    expect(streamPointers(['not a url at all'])).toEqual([])
  })

  test('a provider we do not map, an empty url and a missing one are all skipped', () => {
    expect(streamPointers(['https://www.hidive.com/movies/no-game-no-life-zero'])).toEqual([])
    expect(streamPointers([undefined, null, ''])).toEqual([])
  })

  // real links off /anime/<id>/streaming-links, 2026-09-04. Amazon publishes no segment the regex
  // knows, so it contributes nothing today; pinned so a later widening of ID_IN_PATH is a deliberate
  // act rather than a surprise.
  test('an amazon link carries no id in a segment we read', () => {
    expect(streamPointers(['https://www.amazon.com/gp/video/detail/B081GJPV9P/ref=atv_dp_amz_c_1_20'])).toEqual([])
    expect(streamPointers(['https://www.amazon.com/Disappearance-Haruhi-Suzumiya-Movie/dp/B07145QB41'])).toEqual([])
  })
})

// The two halves of the rule, and the reason they are an AND. These four kitsu ids are four separate
// Demon Slayer FILMS, and /anime/<id>/streaming-links answered the identical Crunchyroll url on every
// one of them on 2026-09-04:
//
//   kitsu:42586  Kimetsu no Yaiba: Mugen Ressha-hen     .../series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba
//   kitsu:44388  Kimetsu no Yaiba: Kyoudai no Kizuna    .../series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba
//   kitsu:44389  Kimetsu no Yaiba: Natagumo Yama Hen    .../series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba
//   kitsu:44390  Kimetsu no Yaiba: Hashira Gou Kaigi    .../series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba
//
// So "a movie has no seasons to be confused between" was true and beside the point: the link is not to
// the movie. Fifteen Dragon Ball Z films share /series/GQWH0M1GG, whose slug is /dragon-ball-z-movies.
const pointer = (url: string) => streamPointers([url])[0]!

describe('mintableAsFilmHandle', () => {
  test('a crunchyroll series link is refused, whatever it holds', () => {
    for (const url of [
      'https://www.crunchyroll.com/series/GY5P48XEY/demon-slayer-kimetsu-no-yaiba',
      'https://beta.crunchyroll.com/series/GY5P48XEY/demon-slayer',
      'https://www.crunchyroll.com/series/GQWH0M1GG/dragon-ball-z-movies',
    ]) expect(mintableAsFilmHandle(pointer(url)), url).toBe(false)
  })

  test('a netflix film link is kept, which is why this is a filter and not a blanket refusal', () => {
    // kitsu:10028 Koe no Katachi, kitsu:176 Spirited Away, kitsu:13647 Nanatsu no Taizai Movie
    for (const url of [
      'https://www.netflix.com/title/80223226',
      'https://www.netflix.com/title/60023642',
      'https://www.netflix.com/title/81006261',
    ]) expect(mintableAsFilmHandle(pointer(url)), url).toBe(true)
    // and /watch/, which is the same numeric id: kitsu:66 Char's Counterattack
    expect(mintableAsFilmHandle(pointer('https://www.netflix.com/watch/60024179'))).toBe(true)
  })

  // An ALLOWLIST, so a segment nobody measured refuses rather than mints. A crunchyroll /watch/ id is
  // an EPISODE guid that resolves to nothing, and hulu and hbo were measured disagreeing with the
  // convention outright, so none of them may ride in on a segment name.
  test('a segment name alone never earns a mint: the origin has to have been measured too', () => {
    expect(mintableAsFilmHandle(pointer('https://www.crunchyroll.com/watch/GK9U3M29W/dragon-ball-super-super-hero'))).toBe(false)
    expect(mintableAsFilmHandle(pointer('https://www.hulu.com/watch/689906'))).toBe(false)
    expect(mintableAsFilmHandle(pointer('https://www.hulu.com/series/95e491fa-cdad'))).toBe(false)
  })

  // The predicate is HALF the rule, and reading it as a general one about urls is the mistake that
  // shipped twice. On a cour record a netflix /title/ id is the whole show's: measured 2026-09-04,
  // nf:80135674 is published on all five seasons of Boku no Hero Academia. Kitsu mints none of them,
  // because the film gate in `streamHandles` never lets this predicate see them.
  test('the predicate says nothing about a series record, which is what the film gate is for', () => {
    expect(mintableAsFilmHandle(pointer('https://www.netflix.com/title/80135674'))).toBe(true)
  })
})
