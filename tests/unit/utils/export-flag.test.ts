import { expect, test } from 'vitest'

import {
  EXPORT_PARAM, EXPORT_VALUE, NO_SEED_PARAM, NO_SEED_VALUE, readExportFlag, readNoSeedFlag, refusesSeedAsset,
} from '../../../src/utils/export-flag'
import { SEED_EPISODES_ASSET, SEED_INDEX_ASSET, seedAssetUrl } from '../../../src/sources/offline/seed'

test('the flag is exactly ?export=store', () => {
  expect(EXPORT_PARAM).toBe('export')
  expect(EXPORT_VALUE).toBe('store')
  expect(readExportFlag('https://anime.fkn.app/?export=store')).toBe(true)
  expect(readExportFlag('https://anime.fkn.app/media/anilist:1?plugin=x&export=store')).toBe(true)
})

test('anything else reads false, including an unparseable url', () => {
  expect(readExportFlag('https://anime.fkn.app/?export=1')).toBe(false)
  expect(readExportFlag('https://anime.fkn.app/?plugin=x')).toBe(false)
  expect(readExportFlag('https://anime.fkn.app/')).toBe(false)
  expect(readExportFlag('not a url')).toBe(false)
})

test('a relative url resolves against the base', () => {
  expect(readExportFlag('/?export=store', 'https://x')).toBe(true)
  expect(readExportFlag('/', 'https://x')).toBe(false)
})

// A walk drives the app with `?seed=off` so it never reads its own previous output. Rule 3 of the
// exporter (excluding the `offline` origin) does not close that loop on its own: a seeded id is
// stored, joins the cluster's aggregated uri, and the next live source to read that uri re-asserts
// SAME_AS across the whole membership, which never routes through `offline:` and so survives the
// exclusion. The next walk then publishes the id as though a source had checked it.
test('the no-seed flag is exactly ?seed=off', () => {
  expect(NO_SEED_PARAM).toBe('seed')
  expect(NO_SEED_VALUE).toBe('off')
  expect(readNoSeedFlag('https://anime.fkn.app/media/mal:1?export=store&seed=off')).toBe(true)
  expect(readNoSeedFlag('https://anime.fkn.app/?seed=on')).toBe(false)
  expect(readNoSeedFlag('https://anime.fkn.app/?export=store')).toBe(false)
  expect(readNoSeedFlag('not a url')).toBe(false)
})

test('a walked page refuses the seed assets and nothing else', () => {
  const walking = 'https://anime.fkn.app/media/mal:1?export=store&seed=off'
  for (const asset of [SEED_INDEX_ASSET, SEED_EPISODES_ASSET]) {
    expect(refusesSeedAsset(walking, seedAssetUrl(asset))).toBe(true)
    expect(refusesSeedAsset(walking, new URL(seedAssetUrl(asset)))).toBe(true)
    expect(refusesSeedAsset(walking, new Request(seedAssetUrl(asset)))).toBe(true)
  }
  expect(refusesSeedAsset(walking, 'https://graphql.anilist.co/')).toBe(false)
  expect(refusesSeedAsset(walking, 'https://api.fkn.app/relay')).toBe(false)
})

test('an ordinary page refuses nothing, so a reader still gets the seed', () => {
  const reading = 'https://anime.fkn.app/media/mal:1'
  expect(refusesSeedAsset(reading, seedAssetUrl(SEED_INDEX_ASSET))).toBe(false)
  expect(refusesSeedAsset('https://anime.fkn.app/?export=store', seedAssetUrl(SEED_INDEX_ASSET))).toBe(false)
})
