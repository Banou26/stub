// One season of a show must never be welded to another season of the same show. It is the merge that
// is hardest to notice and worst to get wrong: the titles genuinely are nearly identical, the year is
// often close, and the result is season 3's episodes sitting under season 2's page with a play button
// that plays the wrong thing. `graph.link` has no inverse, so it lasts the session.
//
// Four separate mechanisms keep them apart and they are listed here in the order they actually fire,
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
//   4. THE START DATE DISAGREEMENT VETO, 45 days, added because 1 and 2 leave the owner's own case
//      wide open: two seasons INSIDE one calendar year share a year bucket, and 2 needs both sides to
//      name a season while season 1 almost never does. A date needs neither side to say anything.
//      Measured benefit and cost, and the false negative it accepts, are in the comment beside the
//      check in fuzzy-merge.ts, with the command that re-derives them.
//
// THE GAP THAT IS LEFT, deliberately pinned below rather than hidden. Both vetoes only ever block on
// a DISAGREEMENT, so both are silent when a cluster asserts nothing. A cluster whose sources name no
// season AND carry no date at all still welds through a shared title. Measured over the manami
// database before mechanism 4 existed: 255 pairs of genuinely different entries reached a merge this
// way, "86" against "86 Part 2" both carrying "86 不存在的战区". It needs the two clusters to share an
// identical title AND share a year, which is why Mushoku Tensei is not affected and why this is narrow
// rather than routine.
import { expect, test } from 'vitest'

import { upsertMedia, findAggregatedMedia } from '../../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../../src/worker/store/fuzzy-merge'

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
// The two dates are 28 days apart, INSIDE mechanism 4's window, so this still isolates mechanism 2:
// dating them a real cour apart would let either one carry the test and neither would be pinned.
test('mechanism 2: same year, both naming their season, refused on the season', async () => {
  const s2 = [media('anilist:2460', [['Mushoku Tensei Season 2', 0.9], ['無職転生 第2期', 0.9]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2461', [['Mushoku Tensei Season 3', 0.9], ['無職転生 第3期', 0.9]], '2026-02-03T00:00:00Z')]
  await upsertMedia([...s2, ...s3], [])
  await fuzzyMergeMediaClusters([s2, s3])

  expect(await welded('anilist:2460', 'anilist:2461')).toBe(false)
})

// and it still holds when the two clusters DO share an identical title, which is the shape that
// otherwise reaches the exact-string shortcut. Dates 28 days apart again, for the same reason.
test('mechanism 2: same year and a shared bare title, still refused on the season', async () => {
  const s2 = [media('anilist:2500', [['無職転生', 0.9], ['Mushoku Tensei Season 2', 0.9]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2501', [['無職転生', 0.9], ['Mushoku Tensei Season 3', 0.9]], '2026-02-03T00:00:00Z')]
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

// THE OWNER'S OWN CASE, and what mechanism 4 was added for: "if we have mushoku tensei season 2, it
// shouldn't get merged in with mushoku tensei s3", where "sometimes seasons air like S1=1-4months,
// S2=7-10months". Same calendar year, so mechanism 1 never sees them. An identical shared title, so
// the exact-string shortcut fires. Only the later side names a season, so mechanism 2 has nothing to
// disagree with. This test asserted `true` until the start date became a mechanism, as a pinned gap.
test('mechanism 4: same year, only one side naming a season, refused on the start date', async () => {
  const silent = [media('anilist:2490', [['無職転生', 0.9], ['Mushoku Tensei II', 0.8]], '2026-01-06T00:00:00Z')]
  const s3 = [media('anilist:2491', [['無職転生', 0.9], ['Mushoku Tensei Season 3', 0.9]], '2026-07-06T00:00:00Z')]
  await upsertMedia([...silent, ...s3], [])
  await fuzzyMergeMediaClusters([silent, s3])

  expect(await welded('anilist:2490', 'anilist:2491')).toBe(false)
})

// THE GAP THAT SURVIVES, pinned the way the one above used to be. Mechanism 4 blocks on a
// DISAGREEMENT, so a cluster that knows only which year it is declares nothing and still welds. That
// is not a corner: it is every streaming catalogue, which is why `startDay` drops January 1 in the
// first place, and closing it by treating silence as a mismatch is the same rule already refused for
// seasons, at a measured one wrong weld stopped per 37 correct merges destroyed. A cluster with no
// date at all is not this case, because it has no year either and mechanism 1 never compares it.
test('KNOWN GAP: a year-only silent side still welds to a season-3 cluster', async () => {
  const silent = [media('anilist:2492', [['無職転生', 0.9], ['Mushoku Tensei II', 0.8]], '2026-01-01')]
  const s3 = [media('anilist:2493', [['無職転生', 0.9], ['Mushoku Tensei Season 3', 0.9]], '2026-07-06T00:00:00Z')]
  await upsertMedia([...silent, ...s3], [])
  await fuzzyMergeMediaClusters([silent, s3])

  expect(await welded('anilist:2492', 'anilist:2493')).toBe(true)
})

// THE MERGES MECHANISM 4 MUST NOT COST, all three measured shapes rather than invented ones.
//
// kitsu and jikan pass through whatever their API answers, and both answer YYYY-MM-01 when only the
// month is known, which reads as precise and is up to 30 days early. This pair is real: kitsu says
// 1988-08-01 for Aikodesho where AniList says Fri, 02 Sep 1988. 32 days, so a 30 day window would
// refuse a correct merge and 45 does not. It is the only one of the 198 such pairs in the corpus that
// lands in the 31 to 45 day band, which is why the window is 45 and not 30.
test('a first-of-month coercion 32 days off still merges', async () => {
  const anilist = [media('anilist:2510', [['Aikodesho', 0.8]], '1988-09-02T00:00:00Z')]
  const kitsu = [media('kitsu:2511', [['Aikodesho', 0.3]], '1988-08-01')]
  await upsertMedia([...anilist, ...kitsu], [])
  await fuzzyMergeMediaClusters([anilist, kitsu])

  expect(await welded('anilist:2510', 'kitsu:2511')).toBe(true)
})

// A streaming catalogue that only knows the year says `${year}-01-01`: justwatch:387, omdb:55,
// tmdb:120, tvdb:99, unogs:166 and :181 and crunchyroll:152 all build that string literally. Believing
// it costs 14992 of 17946 attaches, so `startDay` drops it and this attaches.
test('a January 1 streaming cluster still attaches to an October show', async () => {
  const show = [media('anilist:2520', [['Dandadan', 0.8]], '2026-10-04T00:00:00Z')]
  const streaming = [media('jw:2521', [['Dandadan', 0.2]], '2026-01-01')]
  await upsertMedia([...show, ...streaming], [])
  await fuzzyMergeMediaClusters([show, streaming])

  expect(await welded('anilist:2520', 'jw:2521')).toBe(true)
})

// A quarter check is the wrong shape and is wrong in BOTH directions, which is why the window is a day
// count. These two are one show eight days apart and fall in different quarters.
test('one show straddling a quarter boundary by days still merges', async () => {
  const march = [media('anilist:2530', [['Sakamoto Days', 0.8]], '2026-03-28T00:00:00Z')]
  const april = [media('kitsu:2531', [['Sakamoto Days', 0.3]], '2026-04-05')]
  await upsertMedia([...march, ...april], [])
  await fuzzyMergeMediaClusters([march, april])

  expect(await welded('anilist:2530', 'kitsu:2531')).toBe(true)
})

// One cluster holding a right date and a wrong one still merges on the right one, which is what "any
// pair inside the window allows" means and is what keeps a cluster that has already absorbed a
// mis-dated member from being cut off from everything.
test('a cluster carrying two dates merges on whichever one agrees', async () => {
  const wide = [
    media('anilist:2540', [['Kimi ni Todoke', 0.8]], '2026-10-05T00:00:00Z'),
    media('tvmaze:2541', [['Kimi ni Todoke', 0.3]], '2026-01-20T00:00:00Z'),
  ]
  const other = [media('kitsu:2542', [['Kimi ni Todoke', 0.3]], '2026-10-07')]
  await upsertMedia([...wide, ...other], [{ mediaUri: 'anilist:2540', handleUri: 'tvmaze:2541' }])
  await fuzzyMergeMediaClusters([await findAggregatedMedia('anilist:2540'), other])

  expect(await welded('anilist:2540', 'kitsu:2542')).toBe(true)
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

// A FIFTH way, and the one that reaches NONE of the three mechanisms above, because it is not a merge
// at all: a HANDLE is an identity claim, so two season clusters handed the same source id are welded by
// `graph.link` at upsert time, before any comparison runs. No year bucket, no season veto, no title.
//
// This is what kept Apple TV off the shared catalogue gate: it minted `id: content.id`, the show's id
// with no season component, so a gate matching a SEASON cluster to a catalogue's SHOW entry gave both
// seasons the same `appletv:<id>`. Adding appletv to SHOW_LEVEL_ORIGINS does not reach it either:
// db.ts tests `SHOW_LEVEL_ORIGINS.has(originOf(handleUri))`, the handle side only, and Apple TV emits
// ITSELF as the mediaUri with our uris as handles. The fix is at the source, in the id it mints.
test('a show-level source id welds two season clusters through the handle alone', async () => {
  const s1 = media('anilist:601', [['Mushoku Tensei', 0.9]], '2021-01-11T00:00:00Z')
  const s3 = media('anilist:603', [['Mushoku Tensei', 0.9]], '2026-04-06T00:00:00Z')
  // one media, so both handles name the same graph node
  const show = media('appletv:umc.cmc.showlevel', [['Mushoku Tensei', 0.2]], '2021-01-11T00:00:00Z')
  await upsertMedia([s1, s3, show], [
    { mediaUri: 'anilist:601', handleUri: 'appletv:umc.cmc.showlevel' },
    { mediaUri: 'anilist:603', handleUri: 'appletv:umc.cmc.showlevel' },
  ])

  // five years apart and never compared by the merge pass, and welded anyway
  expect(await welded('anilist:601', 'anilist:603')).toBe(true)
})

test('a season-scoped source id keeps the same two clusters apart', async () => {
  const s1 = media('anilist:701', [['Mushoku Tensei', 0.9]], '2021-01-11T00:00:00Z')
  const s3 = media('anilist:703', [['Mushoku Tensei', 0.9]], '2026-04-06T00:00:00Z')
  // the same Apple TV show, but one media per season, each carrying ITS season's premiere
  const atv1 = media('appletv:umc.cmc.scoped-s1', [['Mushoku Tensei', 0.2]], '2021-01-11T00:00:00Z')
  const atv3 = media('appletv:umc.cmc.scoped-s3', [['Mushoku Tensei', 0.2]], '2026-04-06T00:00:00Z')
  await upsertMedia([s1, s3, atv1, atv3], [
    { mediaUri: 'anilist:701', handleUri: 'appletv:umc.cmc.scoped-s1' },
    { mediaUri: 'anilist:703', handleUri: 'appletv:umc.cmc.scoped-s3' },
  ])
  await fuzzyMergeMediaClusters([
    await findAggregatedMedia('anilist:701'),
    await findAggregatedMedia('anilist:703'),
  ])

  expect(await welded('anilist:701', 'anilist:703')).toBe(false)
  // and the two clusters really did both get their Apple TV row, which is what the link was for
  expect((await findAggregatedMedia('anilist:701')).map(m => m.uri)).toContain('appletv:umc.cmc.scoped-s1')
  expect((await findAggregatedMedia('anilist:703')).map(m => m.uri)).toContain('appletv:umc.cmc.scoped-s3')
})
