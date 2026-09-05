/**
 * Hand-checked merge cases, built from REAL source payloads.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER SUITES. `season-separation.test.ts` and
 * `fuzzy-merge.test.ts` are mechanism tests: each one invents the minimum data to isolate one rule,
 * with made-up ids (`anilist:2460`) chosen so nothing else in the run collides. This file is the
 * opposite. Every row below is what a source really published, fetched 2026-08-31 from api.ani.zip,
 * kitsu.io and graphql.anilist.co, ids and titles and dates unedited. Nothing here is minimal and
 * nothing is arranged to make a rule fire.
 *
 * THE EXPECTED ANSWERS DO NOT COME FROM THE IMPLEMENTATION, and that is the whole point. If these
 * were recorded by running the store and writing down what it did, the file would pin today's
 * behaviour including today's bugs and go green forever. The Mushoku Tensei defect fixed in 50cea84
 * would have been captured as correct. Every `together` and `apart` below is a claim about the WORKS,
 * decided from what the shows are, with the reason written beside it. When the implementation
 * disagrees with one of these, the implementation is what is wrong until someone argues otherwise
 * here, in the `why`.
 *
 * BOTH DIRECTIONS ARE REQUIRED. A suite that only asserts what must merge is passed by an
 * implementation that merges everything, which is the exact failure mode this store has. A suite that
 * only asserts what must stay apart is passed by one that merges nothing. So each case carries the
 * pairs it must keep separate AND the groups it must bring together, and the harness fails on either.
 *
 * The seed set is deliberately the cases this repo has already paid for: split cours that share a
 * season ordinal, two unrelated shows premiering the same week, a remake eighteen years after the
 * original. Add to it whenever something is found in the wild, and write down WHY the answer is the
 * answer, not just what it is.
 *
 * WHAT THIS SUITE ACTUALLY PINS, MEASURED RATHER THAN HOPED. A suite of separation cases is worth
 * exactly what it catches, so each mechanism in fuzzy-merge.ts was broken and the suite re-run. Do
 * this again after adding cases; it is a sed and a minute, and it has corrected this file three times:
 *
 *   title threshold 0.9 -> 0.3                       CAUGHT  2 cases
 *   start-date window 45 -> 400 days                 CAUGHT  1 case
 *   window 400 AND season veto removed               CAUGHT  2 cases
 *   window 400 AND year bucketing removed            CAUGHT  1 case
 *   trailing-number guard removed AND threshold 0.8  CAUGHT  1 case
 *   title threshold 0.9 -> 0.8                       missed
 *   season disagreement veto removed                 missed
 *   format disagreement veto removed                 missed
 *   year bucketing removed                           missed
 *   trailing-number guard removed                    missed
 *   season veto AND year bucketing removed           missed
 *
 * READ THE SINGLE-MUTATION MISSES AS REDUNDANCY, NOT AS DEAD CODE. Every one of them is covered by
 * the start-date window on this data, and the paired rows prove it: break the window as well and the
 * season veto, the year bucket and the trailing-number guard each become load bearing on a real case.
 * That is defence in depth working, and it is also why a single-mutation sweep alone would have
 * declared four mechanisms unnecessary.
 *
 * FORMAT IS THE ONE ROW WITH NO CASE AT ALL. Swept the manami corpus (41537 records, tag 2026-27) for
 * a TV record and a MOVIE record sharing a year and an identical normalised title, both carrying
 * MyAnimeList and AniList ids: there are ZERO. No honest fixture can be written for it from this
 * data, so the row stays open rather than being filled with something invented.
 *
 * SYNONYMS ARE DELIBERATELY ABSENT, and this was checked rather than assumed after a first reading
 * said the opposite. Stub carries MAIN titles only: anizip publishes `titles.en` and `titles.ja`
 * (anizip/extractor.ts), kitsu publishes `titles.en`, `canonicalTitle` and `titles.ja_jp`
 * (`buildTitles`), and anilist REQUESTS `synonyms` in its query and never puts it in the media it
 * builds. So a fixture carrying synonym lists would test a title pool the store never sees. That also
 * settles the "86 -不存在的战区-" weld fuzzy-merge.ts describes: it is measured on a corpus that
 * includes synonyms, which the file itself says over-counts against what stub carries.
 *
 * HOW THE HARD CASES WERE FOUND, so the next batch does not have to be guessed at. Sweep the manami
 * corpus for pairs that share a YEAR and an identical normalised MAIN title. There are 498 such
 * groups; 10 of them are TV pairs that are also `related` to each other, which is the shape where two
 * runs of one franchise are genuinely indistinguishable on title. We Never Learn is one of those ten
 * and it is the case that bought the date row above. The remaining 153 unrelated same-title same-year
 * TV pairs are a second untouched seam.
 */

/** One source's row, with only the fields the merge path reads. */
export type FixtureMedia = {
  uri: string
  titles: string[]
  startDate: string | null
}

export type MergeCase = {
  name: string
  /** Why this answer is correct, in terms of the works rather than the code. Not optional. */
  why: string
  medias: FixtureMedia[]
  /** Identity links a source really asserts, as `[mediaUri, handleUri]`. Most cases have none. */
  handles?: [string, string][]
  /** Each group must come back as ONE cluster. */
  together?: string[][]
  /** Neither uri may ever appear in the other's cluster. */
  apart?: [string, string][]
}

const media = (uri: string, titles: string[], startDate: string | null): FixtureMedia =>
  ({ uri, titles, startDate })

// Every run of Mushoku Tensei, as anizip, kitsu and anilist each publish it. Five runs, and the pair
// that matters most is kitsu:45950 and kitsu:47694: both are "season 2" by ordinal, so nothing but
// the 273 days between them can tell them apart.
const MUSHOKU = {
  s1: [
    media('anizip:14758', ['Mushoku Tensei: Jobless Reincarnation', '無職転生~異世界行ったら本気だす~'], '2021-01-10T15:00:00Z'),
    media('kitsu:42323', ['Mushoku Tensei: Jobless Reincarnation', 'Mushoku Tensei: Isekai Ittara Honki Dasu', '無職転生 ～異世界行ったら本気だす～'], '2021-01-10'),
    media('anilist:108465', ['Mushoku Tensei: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation', '無職転生 ～異世界行ったら本気だす～'], '2021-01-11'),
  ],
  s1p2: [
    media('anizip:15954', ['Mushoku Tensei: Jobless Reincarnation (2021)', '無職転生~異世界行ったら本気だす~ (2021)'], '2021-10-03T15:00:00Z'),
    media('kitsu:43907', ['Mushoku Tensei: Jobless Reincarnation Part 2', 'Mushoku Tensei: Isekai Ittara Honki Dasu Part 2', '無職転生 ～異世界行ったら本気だす～ 第2クール'], '2021-10-03'),
    media('anilist:127720', ['Mushoku Tensei: Isekai Ittara Honki Dasu Part 2', 'Mushoku Tensei: Jobless Reincarnation Cour 2', '無職転生 ～異世界行ったら本気だす～ 第2クール'], '2021-10-04'),
  ],
  s2: [
    media('anizip:17236', ['Mushoku Tensei: Jobless Reincarnation Season 2', '無職転生II ~異世界行ったら本気だす~'], '2023-07-09T15:00:00Z'),
    media('kitsu:45950', ['Mushoku Tensei: Jobless Reincarnation Season 2', 'Mushoku Tensei: Isekai Ittara Honki Dasu Season 2', '無職転生 ～異世界行ったら本気だす～ 第2期'], '2023-07-09'),
    media('anilist:146065', ['Mushoku Tensei II: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation Season 2', '無職転生Ⅱ ～異世界行ったら本気だす～'], '2023-07-03'),
  ],
  s2p2: [
    media('anizip:18104', ['Mushoku Tensei: Jobless Reincarnation Season 2 (2024)', '無職転生II ~異世界行ったら本気だす~ (2024)'], '2024-04-07T15:00:00Z'),
    media('kitsu:47694', ['Mushoku Tensei: Jobless Reincarnation Season 2 Part 2', 'Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2', '無職転生 Ⅱ ～異世界行ったら本気だす～ 第2クール'], '2024-04-07'),
    media('anilist:166873', ['Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2', 'Mushoku Tensei: Jobless Reincarnation Season 2 Part 2', '無職転生Ⅱ ～異世界行ったら本気だす～ 第2クール'], '2024-04-08'),
  ],
  s3: [
    media('anizip:18727', ['Mushoku Tensei: Jobless Reincarnation Season 3', '無職転生III ~異世界行ったら本気だす~'], '2026-07-03T15:00:00Z'),
    media('kitsu:49002', ['Mushoku Tensei: Jobless Reincarnation Season 3', 'Mushoku Tensei: Isekai Ittara Honki Dasu 3rd Season', '無職転生 ～異世界行ったら本気だす～ 第3期'], '2026-07-04'),
    media('anilist:178789', ['Mushoku Tensei III: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation Season 3', '無職転生Ⅲ ～異世界行ったら本気だす～'], '2026-07-04'),
  ],
}

const GRAND_BLUE = {
  s2: [
    media('anizip:18892', ['Grand Blue Dreaming Season 2', 'ぐらんぶる Season 2'], '2025-07-07T15:00:00Z'),
    media('kitsu:49247', ['Grand Blue Dreaming Season 2', 'Grand Blue Season 2', 'ぐらんぶる Season 2'], '2025-07-07'),
    media('anilist:182309', ['Grand Blue Season 2', 'Grand Blue Dreaming Season 2', 'ぐらんぶる Season 2'], '2025-07-08'),
  ],
  s3: [
    media('anizip:19600', ['Grand Blue Dreaming Season 3', 'ぐらんぶる Season 3'], '2026-07-06T15:00:00Z'),
    media('kitsu:50181', ['Grand Blue Season 3', 'ぐらんぶる Season 3'], '2026-07-06'),
    media('anilist:199111', ['Grand Blue Season 3', 'Grand Blue Dreaming Season 3', 'ぐらんぶる Season 3'], '2026-07-07'),
  ],
}

const EIGHTY_SIX = {
  s1: [
    media('anizip:15441', ['86 Eighty-Six', '86'], '2021-04-10T15:00:00Z'),
    media('kitsu:43066', ['86', '86―エイティシックス―'], '2021-04-11'),
    media('anilist:116589', ['86: Eighty Six', '86 EIGHTY-SIX', '86－エイティシックス－'], '2021-04-11'),
  ],
  p2: [
    media('anizip:16172', ['86 Eighty-Six (2021)', 'エイティシックス (2021)'], '2021-10-02T15:00:00Z'),
    media('kitsu:44398', ['86 Part 2', '86－エイティシックス－ 第2クール'], '2021-10-02'),
    media('anilist:131586', ['86: Eighty Six Part 2', '86 EIGHTY-SIX Part 2', '86－エイティシックス－ 第2クール'], '2021-10-03'),
  ],
}

// Two cours of one show inside one calendar year, 189 days apart. Added to isolate the date axis and
// it does NOT, which is worth more than the case it was meant to be: see the mutation table above.
const DR_STONE = {
  p1: [
    media('anizip:17053', ['Dr. Stone: New World', 'Dr.STONE NEW WORLD'], '2023-04-06T13:00:00Z'),
    media('kitsu:44289', ['Dr. Stone: New World', 'Dr.STONE: NEW WORLD'], '2023-04-06'),
    media('anilist:131518', ['Dr. STONE: NEW WORLD', 'Dr. STONE New World', 'Dr.STONE NEW WORLD'], '2023-04-06'),
  ],
  p2: [
    media('anizip:18064', ['Dr. Stone: New World (2023)', 'Dr.STONE NEW WORLD (2023)'], '2023-10-12T13:00:00Z'),
    media('kitsu:47246', ['Dr. Stone: New World Part 2', 'Dr. STONE: NEW WORLD Part 2', 'Dr. STONE NEW WORLD 第2クール'], '2023-10-12'),
    media('anilist:162670', ['Dr. STONE: NEW WORLD Part 2', 'Dr. STONE New World Part 2', 'Dr.STONE NEW WORLD 第2クール'], '2023-10-12'),
  ],
}

/**
 * The pair the DATE axis exists for, and the only seed here that isolates it.
 *
 * Found by sweeping the manami corpus (41537 records, tag 2026-27) for same-year pairs of TV records
 * that are `related` to each other AND carry an identical normalised MAIN title. Ten pairs qualify in
 * the whole database; this is the one with ids on every source. Both seasons ran in 2019, 182 days
 * apart, and the only difference between their titles is a trailing "!", which `stripTitle` removes.
 * Measured with the repo's own `titleSimilarity`:
 *
 *   "We Never Learn: Bokuben"          against "We Never Learn!: Bokuben"           1.0000
 *   "Bokutachi wa Benkyou ga Dekinai"  against "Bokutachi wa Benkyou ga Dekinai!"   1.0000
 *
 * Neither side names a season on those titles, so the season veto cannot fire either, and the year
 * bucket puts them in the same bucket by construction. Nothing but the 182 days is left.
 */
const WE_NEVER_LEARN = {
  s1: [
    media('anizip:14289', ['We Never Learn: Bokuben', 'ぼくたちは勉強ができない'], '2019-04-06T15:30:00Z'),
    media('kitsu:41956', ['We Never Learn: BOKUBEN', 'Bokutachi wa Benkyou ga Dekinai', 'ぼくたちは勉強ができない'], '2019-04-07'),
    media('anilist:103900', ['Bokutachi wa Benkyou ga Dekinai', 'We Never Learn: BOKUBEN', 'ぼくたちは勉強ができない'], '2019-04-07'),
  ],
  s2: [
    media('anizip:14968', ['We Never Learn!: Bokuben', 'ぼくたちは勉強ができない!'], '2019-10-05T15:30:00Z'),
    media('kitsu:42414', ['We Never Learn!: BOKUBEN Season 2', 'Bokutachi wa Benkyou ga Dekinai!', 'ぼくたちは勉強ができない !'], '2019-10-06'),
    media('anilist:110229', ['Bokutachi wa Benkyou ga Dekinai!', 'We Never Learn!: BOKUBEN Season 2', 'ぼくたちは勉強ができない！'], '2019-10-06'),
  ],
}

/**
 * Both 2023, 189 days apart, and the closest real pair to a weld the corpus sweep turned up. Three
 * separate mechanisms refuse it, which is why it takes a PAIR of mutations to move.
 *
 * Two of its title pairs sit at or above the 0.9 threshold, so the title axis is no help:
 *
 *   "Bungou Stray Dogs 4th Season"  against "Bungou Stray Dogs 5th Season"   0.9298
 *   "Bungou Stray Dogs 4"           against "Bungou Stray Dogs 5"           0.9018
 *
 * What refuses it today is the DATE, at 189 days. Widen the window and the season veto takes over,
 * because the "Nth Season" titles do parse as 4 against 5. Measured: window 45 to 400 leaves this
 * case green and only We Never Learn fails; window 400 WITH the season veto removed fails both.
 *
 * The bare "4" against "5" pair never reaches a score at all. `parseSeasonNumber` does not read a
 * trailing number, but `differOnlyByTrailingNumber` in ./fuzzy-merge.ts skips any title pair whose
 * stems match and whose trailing numbers differ, which is a purpose-built guard and strictly stronger
 * than a season veto would be here. An earlier version of this comment called that a blind spot. It
 * is the opposite, and the mistake is recorded because the reasoning that produced it (reading
 * `parseSeasonNumber` and stopping) is the reasoning to avoid.
 */
const BUNGOU = {
  s4: [
    media('anizip:16965', ['Bungo Stray Dogs 4', '文豪ストレイドッグス (2023)'], '2023-01-04T14:00:00Z'),
    media('kitsu:45460', ['Bungou Stray Dogs 4', 'Bungou Stray Dogs 4th Season', '文豪ストレイドッグス 4'], '2023-01-04'),
    media('anilist:141249', ['Bungou Stray Dogs 4th Season', 'Bungo Stray Dogs 4', '文豪ストレイドッグス 第4シーズン'], '2023-01-04'),
  ],
  s5: [
    media('anizip:17962', ['Bungo Stray Dogs 5', '文豪ストレイドッグス (2023) TV'], '2023-07-12T14:00:00Z'),
    media('kitsu:47258', ['Bungou Stray Dogs 5', 'Bungou Stray Dogs 5th Season', '文豪ストレイドッグス 5'], '2023-07-12'),
    media('anilist:163263', ['Bungou Stray Dogs 5th Season', 'Bungo Stray Dogs 5', '文豪ストレイドッグス 第5シーズン'], '2023-07-12'),
  ],
}

/**
 * The pair that proves the DATE VETO CAN BE STRUCTURALLY SILENT on real data, which is the premise
 * every "missed" row in the mutation table above rests on.
 *
 * Season 2 premiered on 2018-12-01, a genuine first of the month, and `startDay` in ./fuzzy-merge.ts
 * discards any first-of-month date because seven extractors mint that shape out of a bare year. So
 * this cluster's `days` set is EMPTY, the veto needs both sides to have one, and season 1 is in the
 * same 2018 bucket. The season veto is unavailable too: `parseSeasonNumber` reads neither
 * "Oshiri Tantei 2" nor "おしりたんてい (第2シリーズ)".
 *
 * So this pair reaches the title loop with every other mechanism spent, and TWO things there refuse
 * it independently. `differOnlyByTrailingNumber` skips "oshiri tantei" against "oshiri tantei 2"
 * before it is scored; had it been scored it would be 0.8134, still under the 0.9 threshold. The
 * Japanese pair scores 0.4556 and the cross pairs 0.02.
 *
 * Measured, and the two-mutation shape is the evidence that both are real: removing the
 * trailing-number guard ALONE changes nothing, because 0.8134 is under the threshold anyway;
 * removing it AND lowering the threshold to 0.8 welds this case and only this case.
 *
 * Only AniList carries these, which is why there is one row per cluster. A single-source cluster is a
 * real shape, not a gap in the fixture.
 */
const OSHIRI = {
  s1: [media('anilist:100790', ['Oshiri Tantei', 'おしりたんてい'], '2018-05-03')],
  s2: [media('anilist:132694', ['Oshiri Tantei 2', 'おしりたんてい (第2シリーズ)'], '2018-12-01')],
}

const FRUITS_BASKET = {
  y2001: [
    media('anizip:34', ['Fruits Basket', 'フルーツバスケット'], '2001-07-05T11:00:00Z'),
    media('kitsu:99', ['Fruits Basket', 'フルーツバスケット'], '2001-07-05'),
    media('anilist:120', ['Fruits Basket', 'フルーツバスケット'], '2001-07-05'),
  ],
  y2019: [
    media('anizip:14490', ['Fruits Basket (2019)', 'フルーツバスケット 1st season'], '2019-04-05T16:30:00Z'),
    media('kitsu:41995', ['Fruits Basket (2019)', 'フルーツバスケット'], '2019-04-06'),
    media('anilist:105334', ['Fruits Basket: 1st Season', 'Fruits Basket (2019)', 'フルーツバスケット 1st Season'], '2019-04-06'),
  ],
}

/**
 * The identity links anizip really publishes, `anizip:<anidb> -> anilist:<id>`, read off the
 * `mappings` block its API returns and minted as handles in sources/anizip/extractor.ts.
 *
 * THEY ARE LOAD BEARING AND IT IS WORTH KNOWING WHY. AniZip names a split cour by appending the
 * YEAR, where kitsu and anilist append "Part 2", and the title axis cannot bridge that on its own.
 * Measured with the repo's own `titleSimilarity` on 2026-08-31, against the 0.9 threshold:
 *
 *   "Mushoku Tensei: Jobless Reincarnation (2021)"           against "... Part 2"        0.8613
 *   "Mushoku Tensei: Jobless Reincarnation Season 2 (2024)"  against "... Season 2 Part 2" 0.8852
 *   "86 Eighty-Six (2021)"                                   against "86 Part 2"          0.2733
 *
 * So every one of those rows is orphaned from its own run without the handle, and the first version
 * of this file proved it by leaving them out. That is not a bug today, because the handle is always
 * there, but it is the single point of failure holding those clusters together and it should be a
 * deliberate fact rather than a lucky one. The `no handle to say so` case below deliberately keeps
 * none, to pin what the title axis CAN do unaided.
 */
const ANIZIP_TO_ANILIST: [string, string][] = [
  ['anizip:14758', 'anilist:108465'], ['anizip:15954', 'anilist:127720'],
  ['anizip:17236', 'anilist:146065'], ['anizip:18104', 'anilist:166873'],
  ['anizip:18727', 'anilist:178789'], ['anizip:18892', 'anilist:182309'],
  ['anizip:19600', 'anilist:199111'], ['anizip:15441', 'anilist:116589'],
  ['anizip:16172', 'anilist:131586'], ['anizip:34', 'anilist:120'],
  ['anizip:14490', 'anilist:105334'], ['anizip:17053', 'anilist:131518'],
  ['anizip:18064', 'anilist:162670'], ['anizip:14289', 'anilist:103900'],
  ['anizip:14968', 'anilist:110229'], ['anizip:16965', 'anilist:141249'],
  ['anizip:17962', 'anilist:163263'],
]

/** The subset of the real handle list that names rows this case actually carries. */
const handlesFor = (rows: FixtureMedia[]): [string, string][] => {
  const present = new Set(rows.map(row => row.uri))
  return ANIZIP_TO_ANILIST.filter(([from, to]) => present.has(from) && present.has(to))
}

const uris = (rows: FixtureMedia[]) => rows.map(row => row.uri)

/** Every pair drawn from different groups, which is what "these must all stay apart" means. */
const allPairsAcross = (groups: FixtureMedia[][]): [string, string][] => {
  const pairs: [string, string][] = []
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      for (const a of groups[i]!) for (const b of groups[j]!) pairs.push([a.uri, b.uri])
    }
  }
  return pairs
}

export const MERGE_CASES: MergeCase[] = [
  {
    name: 'three catalogues describing one run are one media, with no handle to say so',
    why:
      'anizip:18727, kitsu:49002 and anilist:178789 are the same fourteen episodes of Mushoku Tensei ' +
      'starting 2026-07-03. No handle links them here on purpose: this is the merge path doing its ' +
      'job on titles and a date alone, which is what has to work for a source that publishes no ' +
      'cross-references. Without this direction, an implementation that merged NOTHING would pass ' +
      'every separation case in this file.',
    medias: MUSHOKU.s3,
    together: [uris(MUSHOKU.s3)],
  },
  {
    name: 'the five Mushoku Tensei runs stay five',
    why:
      'These are five distinct broadcast runs: 2021-01, 2021-10, 2023-07, 2024-04 and 2026-07. Two ' +
      'of them are both "season 2" (kitsu:45950 and kitsu:47694), so an ordinal cannot separate ' +
      'them and only the 273 days can. Welding any pair puts one run\'s episodes under another\'s ' +
      'page, which is exactly what the owner reported on 2026-08-31.',
    medias: [...MUSHOKU.s1, ...MUSHOKU.s1p2, ...MUSHOKU.s2, ...MUSHOKU.s2p2, ...MUSHOKU.s3],
    handles: handlesFor([...MUSHOKU.s1, ...MUSHOKU.s1p2, ...MUSHOKU.s2, ...MUSHOKU.s2p2, ...MUSHOKU.s3]),
    together: [uris(MUSHOKU.s1), uris(MUSHOKU.s1p2), uris(MUSHOKU.s2), uris(MUSHOKU.s2p2), uris(MUSHOKU.s3)],
    apart: allPairsAcross([MUSHOKU.s1, MUSHOKU.s1p2, MUSHOKU.s2, MUSHOKU.s2p2, MUSHOKU.s3]),
  },
  {
    name: 'two unrelated shows premiering the same week are not one show',
    why:
      'Grand Blue season 3 starts 2026-07-06 and Mushoku Tensei season 3 starts 2026-07-03. Three ' +
      'days apart, same year, and both are somebody\'s "Season 3", so every date mechanism in the ' +
      'store is silent and the title axis is carrying this alone. This is the pair named in ' +
      'crunchyroll/extractor.ts as the one that really did weld, back when a source was allowed to ' +
      'publish the bare string "Season 3" as a title.',
    medias: [...GRAND_BLUE.s3, ...MUSHOKU.s3],
    handles: handlesFor([...GRAND_BLUE.s3, ...MUSHOKU.s3]),
    together: [uris(GRAND_BLUE.s3), uris(MUSHOKU.s3)],
    apart: allPairsAcross([GRAND_BLUE.s3, MUSHOKU.s3]),
  },
  {
    name: 'consecutive Grand Blue seasons a year apart stay apart',
    why:
      'Season 2 starts 2025-07-07 and season 3 starts 2026-07-06, so they fall in different years ' +
      'and share almost every title once the season marker is stripped. The year bucket should ' +
      'refuse to compare them at all; this pins that it does, and that the two still assemble.',
    medias: [...GRAND_BLUE.s2, ...GRAND_BLUE.s3],
    handles: handlesFor([...GRAND_BLUE.s2, ...GRAND_BLUE.s3]),
    together: [uris(GRAND_BLUE.s2), uris(GRAND_BLUE.s3)],
    apart: allPairsAcross([GRAND_BLUE.s2, GRAND_BLUE.s3]),
  },
  {
    name: 'two cours of 86 inside one calendar year stay apart',
    why:
      '86 starts 2021-04-10 and 86 Part 2 starts 2021-10-02: one year, 175 days, and titles that ' +
      'reduce to the same string once "Part 2" comes off. The year bucket cannot help here and ' +
      'neither side names a season NUMBER, so the start-date window is the only thing standing ' +
      'between them. season-separation.test.ts names this show as the shape of the remaining gap.',
    medias: [...EIGHTY_SIX.s1, ...EIGHTY_SIX.p2],
    handles: handlesFor([...EIGHTY_SIX.s1, ...EIGHTY_SIX.p2]),
    together: [uris(EIGHTY_SIX.s1), uris(EIGHTY_SIX.p2)],
    apart: allPairsAcross([EIGHTY_SIX.s1, EIGHTY_SIX.p2]),
  },
  {
    name: 'two cours of Dr. Stone in one year stay apart',
    why:
      'Part 1 starts 2023-04-06 and Part 2 starts 2023-10-12, one calendar year apart, so the year ' +
      'bucket compares them and 189 days is well outside the start-date window. It was added believing ' +
      'the title axis would score them 1.0 and leave the date carrying the case alone. That was wrong ' +
      'and the measurement says so: `titleSimilarity` scores "Dr. Stone: New World" against ' +
      '"Dr. Stone: New World Part 2" at 0.6841, because a trailing "Part 2" is not stripped, so the ' +
      'title axis refuses this pair on its own. Kept because it is a real pair correctly separated, ' +
      'and because the wrong reason is now written down.',
    medias: [...DR_STONE.p1, ...DR_STONE.p2],
    handles: handlesFor([...DR_STONE.p1, ...DR_STONE.p2]),
    together: [uris(DR_STONE.p1), uris(DR_STONE.p2)],
    apart: allPairsAcross([DR_STONE.p1, DR_STONE.p2]),
  },
  {
    name: 'two seasons of We Never Learn in one year, held apart by the date alone',
    why:
      'Season 1 starts 2019-04-06 and season 2 starts 2019-10-05: one calendar year, 182 days, and ' +
      'titles that differ only by a trailing "!" which stripTitle removes. Two of the pairs score ' +
      'exactly 1.0000, so the title axis is not merely weak here, it actively says these are the same ' +
      'show. Neither side names a season on those titles, so the season veto cannot fire. The start ' +
      'date is the only mechanism left, which is what makes this the seed that fails when the window ' +
      'is widened, and the one row of the mutation table above that reads CAUGHT for the date axis.',
    medias: [...WE_NEVER_LEARN.s1, ...WE_NEVER_LEARN.s2],
    handles: handlesFor([...WE_NEVER_LEARN.s1, ...WE_NEVER_LEARN.s2]),
    together: [uris(WE_NEVER_LEARN.s1), uris(WE_NEVER_LEARN.s2)],
    apart: allPairsAcross([WE_NEVER_LEARN.s1, WE_NEVER_LEARN.s2]),
  },
  {
    name: 'two Bungou Stray Dogs seasons in one year, where the season veto is half blind',
    why:
      'Season 4 starts 2023-01-04 and season 5 starts 2023-07-12, same year, 189 days. Their ' +
      '"Nth Season" titles score 0.9298 and their bare "Bungou Stray Dogs 4" / "5" titles score ' +
      '0.9018, both at or above the 0.9 threshold, so the title axis says these are one show. The ' +
      'date refuses them at 189 days; widen the window and the season veto takes over on the ' +
      '"Nth Season" pair; the bare pair is skipped outright by differOnlyByTrailingNumber. Three ' +
      'mechanisms deep, which is why it takes two mutations to move.',
    medias: [...BUNGOU.s4, ...BUNGOU.s5],
    handles: handlesFor([...BUNGOU.s4, ...BUNGOU.s5]),
    together: [uris(BUNGOU.s4), uris(BUNGOU.s5)],
    apart: allPairsAcross([BUNGOU.s4, BUNGOU.s5]),
  },
  {
    name: 'a first-of-month premiere leaves only the title axis, and it holds',
    why:
      'Oshiri Tantei season 1 starts 2018-05-03 and season 2 starts 2018-12-01. Same year, so the ' +
      'bucket compares them; season 2\'s date is a first of the month, so startDay discards it and ' +
      'the date veto cannot fire; and parseSeasonNumber reads neither "Oshiri Tantei 2" nor ' +
      '"第2シリーズ", so the season veto cannot fire either. That leaves the title loop, where the ' +
      'romaji pair is SKIPPED by differOnlyByTrailingNumber before it is scored, and would be 0.8134 ' +
      'and still under threshold if it were. This case exists to pin that the premise of the mutation ' +
      'table is real: a cluster CAN reach the matcher with no usable day.',
    medias: [...OSHIRI.s1, ...OSHIRI.s2],
    together: [uris(OSHIRI.s1), uris(OSHIRI.s2)],
    apart: allPairsAcross([OSHIRI.s1, OSHIRI.s2]),
  },
  {
    name: 'a remake eighteen years later is a different work',
    why:
      'Fruits Basket 2001 and Fruits Basket 2019 adapt the same manga under the same name. Three of ' +
      'the six rows carry the byte-identical title "Fruits Basket", so the title axis cannot ' +
      'separate them at any threshold and only the eighteen years can.',
    medias: [...FRUITS_BASKET.y2001, ...FRUITS_BASKET.y2019],
    handles: handlesFor([...FRUITS_BASKET.y2001, ...FRUITS_BASKET.y2019]),
    together: [uris(FRUITS_BASKET.y2001), uris(FRUITS_BASKET.y2019)],
    apart: allPairsAcross([FRUITS_BASKET.y2001, FRUITS_BASKET.y2019]),
  },
]
