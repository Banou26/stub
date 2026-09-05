// seed.ts mirrors enums and id schemes that live elsewhere so node can load it without a bundler.
// Every mirror is pinned here against the thing it mirrors.
import { expect, test } from 'vitest'

import { rowId } from '../../../../src/sources/offline/index-lookup'
import { recordId, seasonKey } from '../../../../src/sources/offline/normalize'
import {
  SEED_EPISODES_ASSET, SEED_INDEX_ASSET, SEED_MEDIA_CATEGORIES, SEED_MEDIA_TYPES, SEED_SCOPES, SEED_UNROUTABLE_ID,
  isSeedAssetUrl, keyUri, nextSeason, runKeyOf, seasonKeyOf, seedAssetUrl,
} from '../../../../src/sources/offline/seed'
import { isRoutableUri } from '../../../../src/utils/uri'
import { mediaCategoryEnum, mediaScopeEnum, mediaTypeEnum } from '../../../../src/worker/store/types'

// No status mirror: the seed publishes no `status`, and neither does the bundle. See SeedRun.
test('the enum mirrors equal the store\'s', () => {
  expect([...SEED_MEDIA_TYPES]).toEqual([...mediaTypeEnum])
  expect([...SEED_MEDIA_CATEGORIES]).toEqual([...mediaCategoryEnum])
  expect([...SEED_SCOPES]).toEqual([...mediaScopeEnum])
})

test('runKeyOf borrows identity in the order recordId and rowId do', () => {
  expect(runKeyOf(['kitsu:3', 'anilist:2', 'mal:1'])).toBe('mal-1')
  expect(runKeyOf(['kitsu:3', 'anilist:2', 'mal:1'])).toBe(recordId({ t: '', ty: '', p: '', ml: 1, al: 2, ku: 3 }))
  expect(runKeyOf(['kitsu:3', 'anilist:2', 'mal:1'])).toBe(rowId({ mal: 1, anilist: 2, kitsu: 3, anidb: 0 }))
  expect(runKeyOf(['kitsu:3', 'anilist:2'])).toBe('anilist-2')
  expect(runKeyOf(['kitsu:3'])).toBe('kitsu-3')
  expect(runKeyOf(['cr:G1', 'nf:80001'])).toBeUndefined()
  expect(runKeyOf([])).toBeUndefined()
})

// Measured on a walk: an anilist handle whose id was the slug `Keroro-Gunsou-Shin-Anime` minted a key
// SEED_RUN_KEY refuses, and a gate failure refuses the whole day's publish rather than that one run.
test('a non-numeric id is not borrowed, and the next key origin still answers', () => {
  expect(runKeyOf(['anilist:Keroro-Gunsou-Shin-Anime', 'kitsu:44'])).toBe('kitsu-44')
  expect(runKeyOf(['mal:', 'anilist:12'])).toBe('anilist-12')
  expect(runKeyOf(['anilist:Keroro-Gunsou-Shin-Anime'])).toBeUndefined()
  expect(keyUri(runKeyOf(['kitsu:44'])!)).toBe('kitsu:44')
})

test('keyUri names the identity member the key was borrowed from', () => {
  expect(keyUri('mal-59193')).toBe('mal:59193')
  expect(keyUri('anilist-178789')).toBe('anilist:178789')
})

test('seasonKeyOf equals the bundle key and nextSeason rolls the year at fall', () => {
  expect(seasonKeyOf({ season: 'summer', year: 2026 })).toBe(seasonKey({ season: 'summer', year: 2026 }))
  expect(seasonKeyOf({ season: 'FALL', year: 2026 })).toBe('2026-FALL')
  expect(nextSeason({ season: 'fall', year: 2026 })).toEqual({ season: 'winter', year: 2027 })
  expect(nextSeason({ season: 'winter', year: 2026 })).toEqual({ season: 'spring', year: 2026 })
  expect(nextSeason({ season: 'SUMMER', year: 2026 })).toEqual({ season: 'fall', year: 2026 })
  expect(() => nextSeason({ season: 'autumn', year: 2026 })).toThrow()
})

test('SEED_UNROUTABLE_ID is the complement of isRoutableUri', () => {
  for (const id of ['a', 'a,b', 'a/b', '(a)', 'G24H1N3MP-GS00374452', 'umc.cmc.1']) {
    expect(SEED_UNROUTABLE_ID.test(id), id).toBe(!isRoutableUri(`x:${id}`))
  }
})

test('the asset url is the plain release download url', () => {
  expect(seedAssetUrl(SEED_INDEX_ASSET)).toBe('https://github.com/Banou26/stub/releases/download/season-seed/season-seed.json.gz')
})

test('isSeedAssetUrl names this seed\'s assets and nothing else', () => {
  expect(isSeedAssetUrl(seedAssetUrl(SEED_INDEX_ASSET))).toBe(true)
  expect(isSeedAssetUrl(seedAssetUrl(SEED_EPISODES_ASSET))).toBe(true)
  expect(isSeedAssetUrl('https://github.com/Banou26/stub/releases/download/v0.0.17/other.json.gz')).toBe(false)
  expect(isSeedAssetUrl('https://api.anilist.co/')).toBe(false)
  expect(isSeedAssetUrl('')).toBe(false)
})
