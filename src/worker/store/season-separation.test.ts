// One season of a show must never be welded to another season of the same show. It is the merge that
// is hardest to notice and worst to get wrong: the titles genuinely are nearly identical, the year is
// often close, and the result is season 3's episodes sitting under season 2's page with a play button
// that plays the wrong thing. `graph.link` has no inverse, so it lasts the session.
//
// Three separate mechanisms keep them apart and they are listed here in the order they actually fire,
// which is NOT the order they look important in. Every one of these was reached by measurement:
//
//   1. YEAR BUCKETING. fuzzyMergeMediaClusters only ever compares clusters that share a start year, so
//      two seasons a year or more apart are never scored at all. This is what protects the real
//      Mushoku Tensei, whose season 2 aired 2023 and season 3 in 2026.
//   2. THE SEASON DISAGREEMENT VETO. Same year and both sides name a season: {2} against {3} has no
//      overlap and sameShow refuses before the matcher runs. Load bearing rather than a backstop,
//      because on titles alone "Mushoku Tensei Season 2" and "Season 3" score 0.9175, ABOVE the 0.9
//      threshold. The number does not separate these; the veto does.
//   3. isOnlySeasonLabel. Crunchyroll titles a season with its bare position, so a great many shows
//      carry the literal string "Season 3" as their own title and any two of them are identical.
//
// THE GAP, deliberately pinned below rather than hidden: the veto needs BOTH sides to name a season,
// because "only a disagreement blocks". A cluster whose sources never spell the season out declares
// nothing, so nothing blocks. Measured over the manami database, 255 pairs of genuinely different
// entries reach a merge this way, "86" against "86 Part 2" both carrying "86 不存在的战区". It needs the
// two clusters to share an identical title AND share a year, which is why Mushoku Tensei is not
// affected and why this is narrow rather than routine.
import { expect, test } from 'vitest'

import { upsertMedia, findAggregatedMedia } from './db'
import { fuzzyMergeMediaClusters } from './fuzzy-merge'

const media = (uri: string, titles: [string, number][], startDate: string) => ({
  uri, origin: uri.slice(0, uri.indexOf(':')), id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV', categories: ['ANIME', 'SERIES'], startDate,
  titles: titles.map(([title, score]) => ({ language: 'ja', title, score })),
}) as any

const welded = async (a: string, b: string) =>
  (await findAggregatedMedia(a)).some(m => m.uri === b)

test('mechanism 1: seasons in different years are never compared', async () => {
  const s2 = [
    media('anilist:146065', [['Mushoku Tensei II: Isekai Ittara Honki Dasu', 0.8], ['無職転生 II 異世界行ったら本気だす', 0.8]], '2023-07-03T00:00:00Z'),
    media('anizip:17173', [['Mushoku Tensei: Jobless Reincarnation Season 2', 0.9], ['無職転生 第2期', 0.9]], '2023-07-03T00:00:00Z'),
  ]
  const s3 = [
    media('anilist:189395', [['Mushoku Tensei III: Isekai Ittara Honki Dasu', 0.8], ['無職転生 III 異世界行ったら本気だす', 0.8]], '2026-04-06T00:00:00Z'),
    media('anizip:19999', [['Mushoku Tensei: Jobless Reincarnation Season 3', 0.9], ['無職転生 第3期', 0.9]], '2026-04-06T00:00:00Z'),
  ]
  await upsertMedia([...s2, ...s3], [
    { mediaUri: 'anilist:146065', handleUri: 'anizip:17173' },
    { mediaUri: 'anilist:189395', handleUri: 'anizip:19999' },
  ])
  await fuzzyMergeMediaClusters([
    await findAggregatedMedia('anilist:146065'),
    await findAggregatedMedia('anilist:189395'),
  ])

  expect(await welded('anilist:146065', 'anilist:189395')).toBe(false)
})

// The titles here score 0.9175, above SIMILARITY_THRESHOLD, so this passes only because of the veto.
test('mechanism 2: same year, both naming their season, refused on the season', async () => {
  const s2 = [media('anilist:2460', [['Mushoku Tensei Season 2', 0.9], ['無職転生 第2期', 0.9]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2461', [['Mushoku Tensei Season 3', 0.9], ['無職転生 第3期', 0.9]], '2026-10-06T00:00:00Z')]
  await upsertMedia([...s2, ...s3], [])
  await fuzzyMergeMediaClusters([s2, s3])

  expect(await welded('anilist:2460', 'anilist:2461')).toBe(false)
})

// and it still holds when the two clusters DO share an identical title, which is the shape that
// otherwise reaches the exact-string shortcut
test('mechanism 2: same year and a shared bare title, still refused on the season', async () => {
  const s2 = [media('anilist:2500', [['無職転生', 0.9], ['Mushoku Tensei Season 2', 0.9]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2501', [['無職転生', 0.9], ['Mushoku Tensei Season 3', 0.9]], '2026-10-06T00:00:00Z')]
  await upsertMedia([...s2, ...s3], [])
  await fuzzyMergeMediaClusters([s2, s3])

  expect(await welded('anilist:2500', 'anilist:2501')).toBe(false)
})

test('mechanism 3: two different shows both titled only "Season 3" do not weld', async () => {
  const mushoku = [media('cr:GRQ1000', [['Season 3', 0.5], ['Mushoku Tensei: Jobless Reincarnation', 0.9]], '2026-04-06T00:00:00Z')]
  const grandblue = [media('cr:GRQ2000', [['Season 3', 0.5], ['Grand Blue Dreaming', 0.9]], '2026-04-06T00:00:00Z')]
  await upsertMedia([...mushoku, ...grandblue], [])
  await fuzzyMergeMediaClusters([mushoku, grandblue])

  expect(await welded('cr:GRQ1000', 'cr:GRQ2000')).toBe(false)
})

// The merge that MUST keep working, and the reason the veto cannot simply treat silence as season 1:
// two clusters of the SAME season where only one of them says which season it is.
test('the same season still merges when only one side names it', async () => {
  const a = [media('anilist:2480', [['Mushoku Tensei II: Isekai Ittara Honki Dasu', 0.8]], '2026-04-06T00:00:00Z')]
  const b = [media('anizip:2481', [['Mushoku Tensei II: Isekai Ittara Honki Dasu', 0.9], ['無職転生 第2期', 0.9]], '2026-04-06T00:00:00Z')]
  await upsertMedia([...a, ...b], [])
  await fuzzyMergeMediaClusters([a, b])

  expect(await welded('anilist:2480', 'anizip:2481')).toBe(true)
})

// KNOWN GAP, asserted as it currently behaves so that closing it breaks this test loudly rather than
// silently. Same year, an identical shared title, and only one side names a season, so the veto has
// nothing to disagree with. If a future change closes this, flip the expectation and move this test up
// with the other mechanisms.
test('KNOWN GAP: a silent side welds to a season-3 cluster through a shared title', async () => {
  const silent = [media('anilist:2490', [['無職転生', 0.9], ['Mushoku Tensei II', 0.8]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2491', [['無職転生', 0.9], ['Mushoku Tensei Season 3', 0.9]], '2026-10-06T00:00:00Z')]
  await upsertMedia([...silent, ...s3], [])
  await fuzzyMergeMediaClusters([silent, s3])

  expect(await welded('anilist:2490', 'anilist:2491')).toBe(true)
})

// A FOURTH way seasons weld, and it is not a merge rule at all: it is a source asserting the wrong
// date. profileCluster builds `years` from EVERY member's startDate, and fuzzyMergeMediaClusters
// buckets by year, so one member carrying season 1's date drops the whole season 3 cluster into season
// 1's bucket, where a shared title is enough. Nothing downstream can recover: by then the two really
// do share a year as far as the pass can tell.
//
// tvmaze/extractor.ts and tmdb/extractor.ts both did exactly this, minting a season-scoped id while
// stamping the SHOW's premiere on it. Both are fixed at the source, and this pins WHY, because the
// next source to model a show as one entity will be tempted the same way and the merge pass will not
// save it.
test('a member carrying another season\'s date widens the year set and welds', async () => {
  const s1 = [media('anilist:301', [['Bungou Stray Dogs', 0.9]], '2016-04-07T00:00:00Z')]
  const s3 = [
    media('anilist:302', [['Bungou Stray Dogs', 0.9]], '2019-04-12T00:00:00Z'),
    // a season-scoped media stamped with the SHOW's premiere, which is season 1's
    media('tvmaze:556-s3', [['Bungou Stray Dogs', 0.9]], '2016-04-07T00:00:00Z'),
  ]
  await upsertMedia([...s1, ...s3], [{ mediaUri: 'anilist:302', handleUri: 'tvmaze:556-s3' }])
  await fuzzyMergeMediaClusters([
    await findAggregatedMedia('anilist:301'),
    await findAggregatedMedia('anilist:302'),
  ])

  expect(await welded('anilist:301', 'anilist:302')).toBe(true)
})

test('the same clusters stay apart when every member carries its own season\'s date', async () => {
  const s1 = [media('anilist:401', [['Bungou Stray Dogs', 0.9]], '2016-04-07T00:00:00Z')]
  const s3 = [
    media('anilist:402', [['Bungou Stray Dogs', 0.9]], '2019-04-12T00:00:00Z'),
    media('tvmaze:557-s3', [['Bungou Stray Dogs', 0.9]], '2019-04-12T00:00:00Z'),
  ]
  await upsertMedia([...s1, ...s3], [{ mediaUri: 'anilist:402', handleUri: 'tvmaze:557-s3' }])
  await fuzzyMergeMediaClusters([
    await findAggregatedMedia('anilist:401'),
    await findAggregatedMedia('anilist:402'),
  ])

  expect(await welded('anilist:401', 'anilist:402')).toBe(false)
})
