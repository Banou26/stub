/**
 * The benefit and cost of the start-date window in src/worker/store/fuzzy-merge.ts, driven through
 * the real fuzzyMergeMediaClusters rather than a model of it.
 *
 *   node scripts/measure-start-date-window.mjs
 *   ./node_modules/.bin/vitest run --config vitest.start-date.config.ts \
 *     --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no
 * measurement. `npx vitest` fails on this machine with EBADDEVENGINES, so call the binary directly.
 *
 * HOW THE VETO IS TURNED OFF FOR THE BASELINE, without a second copy of the file to drift from it:
 * every media is re-dated to January 1 of its OWN year. `profileCluster` reads the year bucket off
 * the same field, so the bucketing is byte-identical, while `startDay` drops January 1 on purpose and
 * the date set comes out empty, which is the one state in which the check cannot fire. The baseline
 * is therefore the real code with the real title path and one axis inert.
 *
 * Four arms, and the last two exist so a zero can be believed:
 *
 *   WELD      candidate pairs of DISTINCT AniList entries. Two ids are two works and stub is one
 *             cluster per season, so a weld is a wrong weld and refusing it is the benefit.
 *   SPLIT     one show reaching the store as TWO clusters, AniList's media and kitsu's, unlinked.
 *             That is production whenever kitsu's `include=mappings` comes back without an anilist or
 *             mal mapping. A merge is correct and losing it is the cost.
 *   BRIDGE    a one-title streaming cluster at score 0.2 dated `${year}-01-01`, which is what
 *             justwatch, omdb, tmdb, tvdb, unogs and crunchyroll all literally build out of a year,
 *             meeting the metadata cluster. Then the SAME arm again with the catalogue dated
 *             `${year}-01-02`, which is what those six sources would look like if a year-only date
 *             were believed: the control that proves this rig can express a catastrophic cost.
 *   UNSELECTED a sample of same-year pairs the census did NOT select. None of them may weld, or the
 *             census is not a census and every count above is a floor rather than a total.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import type { Media } from '../src/worker/store/types'
import { findAggregatedMedia, upsertMedia } from '../src/worker/store/db'
import { fuzzyMergeMediaClusters, profileCluster } from '../src/worker/store/fuzzy-merge'
import { parseSeasonNumber } from '../src/sources/season'

type KitsuRecord = { id: number, startDate: string | null, subtype: string, titles: string[] }
type Entry = {
  id: number
  format: string | null
  episodes: number | null
  english: string | null
  romaji: string | null
  native: string | null
  emitted: string
  year: number
  titles: string[]
  kitsu: KitsuRecord | null
}
type Pair = { a: number, b: number, year: number }

const POOL = new URL('../node_modules/.cache/start-date-pool.json', import.meta.url).pathname
const { entries, pairs } = JSON.parse(readFileSync(POOL, 'utf8')) as { entries: Entry[], pairs: Pair[] }

const media = (fields: Partial<Media> & { uri: string }): Media => ({
  url: null, score: null, type: null, categories: [], status: null,
  titles: [], descriptions: [], shortDescriptions: [], trailers: [], covers: [], banners: [],
  externalLinks: null, averageScore: null, popularity: null, startDate: null, endDate: null,
  isAdult: null, episodeCount: null,
  origin: fields.uri.slice(0, fields.uri.indexOf(':')),
  id: fields.uri.slice(fields.uri.indexOf(':') + 1),
  ...fields,
} as Media)

const typeOf = (format: string | null) =>
  format === 'TV' || format === 'TV_SHORT' ? 'TV'
  : format === 'MOVIE' ? 'MOVIE' : format === 'SPECIAL' ? 'SPECIAL'
  : format === 'OVA' ? 'OVA' : format === 'ONA' ? 'ONA' : null

// `dated` is the whole A/B: 'real' keeps what the sources say, 'january' empties every date set
const anilistMedia = (entry: Entry, suffix: string, dated: 'real' | 'january') =>
  media({
    uri: `anilist:${entry.id}${suffix}`, score: 0.8,
    type: typeOf(entry.format) as Media['type'],
    categories: entry.format === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    titles: [
      ...entry.english ? [{ language: 'en', title: entry.english, score: 0.8 }] : [],
      ...entry.romaji ? [{ language: 'jp-en', title: entry.romaji, score: 0.8 }] : [],
      ...entry.native ? [{ language: 'jp', title: entry.native, score: 0.8 }] : [],
    ],
    startDate: dated === 'real' ? entry.emitted : `${entry.year}-01-01`,
    episodeCount: entry.episodes,
  } as Partial<Media> & { uri: string })

const kitsuMedia = (entry: Entry, suffix: string, dated: 'real' | 'january') => {
  const record = entry.kitsu
  if (!record?.titles.length) return null
  const year = record.startDate ? new Date(record.startDate).getUTCFullYear() : entry.year
  return media({
    uri: `kitsu:${record.id}${suffix}`, score: 0.3,
    type: (record.subtype === 'movie' ? 'MOVIE' : record.subtype === 'TV' ? 'TV' : record.subtype === 'special' ? 'SPECIAL' : record.subtype === 'OVA' ? 'OVA' : record.subtype === 'ONA' ? 'ONA' : null) as Media['type'],
    categories: record.subtype === 'movie' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    // kitsu/extractor.ts buildTitles: titles.en, canonicalTitle, titles.ja_jp, first spelling wins
    titles: record.titles.map((title, index) => ({ language: index === 2 ? 'ja' : 'en', title, score: 0.3 })),
    startDate: record.startDate ? (dated === 'real' ? record.startDate : `${year}-01-01`) : null,
  } as Partial<Media> & { uri: string })
}

const clusterOf = (entry: Entry, suffix: string, dated: 'real' | 'january') =>
  [anilistMedia(entry, suffix, dated), kitsuMedia(entry, suffix, dated)].filter(Boolean) as Media[]

const link = async (medias: Media[]) =>
  upsertMedia(medias, medias.slice(1).map(m => ({ mediaUri: medias[0]!.uri, handleUri: m.uri })))

const mergesInto = async (rootA: string, rootB: string) => {
  await fuzzyMergeMediaClusters([await findAggregatedMedia(rootA), await findAggregatedMedia(rootB)])
  return (await findAggregatedMedia(rootA)).some(m => m.uri === rootB)
}

const byId = new Map(entries.map(entry => [entry.id, entry]))
const percent = (part: number, whole: number) => `${(100 * part / whole).toFixed(2)}%`

// whether the season check above this one in sameShow could have reached the pair at all: it needs a
// season number on BOTH sides, and this is what says how much of the benefit is genuinely new
const namesASeason = (entry: Entry) =>
  [entry.english, entry.romaji, entry.native, ...entry.kitsu?.titles ?? []]
    .some(title => title && parseSeasonNumber(title) !== undefined)

// kitsu carries a batch of old records with the day and the month swapped ("1964-03-08" where AniList
// says Mon, 03 Aug 1964). No window absorbs that, and it is worth knowing how much of the cost is it
const transposed = (entry: Entry) => {
  if (!entry.kitsu?.startDate) return false
  const anilist = new Date(entry.emitted)
  const kitsu = new Date(entry.kitsu.startDate)
  return anilist.getUTCFullYear() === kitsu.getUTCFullYear()
    && anilist.getUTCMonth() + 1 === kitsu.getUTCDate()
    && anilist.getUTCDate() === kitsu.getUTCMonth() + 1
}

test('the census selects on the pass\'s own normalization', () => {
  // scripts/measure-start-date-window.mjs copies normalizeTitle because it is plain node and this
  // module is TypeScript over wasm. The copy is asserted against the real one HERE, so a drift fails
  // loudly rather than silently shrinking the census.
  const sample = entries.filter(entry => entry.titles.length).slice(0, 2000)
  for (const entry of sample) {
    const profile = profileCluster([anilistMedia(entry, '-n', 'real')])
    for (const title of profile.titles) expect(entry.titles).toContain(title)
  }
})

/* The sweep below is arithmetic over the SAME verdicts the pass produced, never a second model of the
matcher: the check is a pure AND on top of sameShow's existing answer and every pair is driven in
isolation, so no chaining can make the arithmetic differ. What makes that safe to believe rather than
to assert is that the 45-day January-1 row is asserted equal to the live measurement below. */
const MS_PER_DAY = 86_400_000
const dayOf = (date: string) => Math.floor(Date.parse(date) / MS_PER_DAY)
const keepsDate = (date: string, guard: 'none' | 'jan1' | 'day1') => {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return false
  if (guard === 'jan1') return !(parsed.getUTCMonth() === 0 && parsed.getUTCDate() === 1)
  if (guard === 'day1') return parsed.getUTCDate() !== 1
  return true
}
const wouldBlock = (left: string[], right: string[], window: number, guard: 'none' | 'jan1' | 'day1') => {
  const a = [...new Set(left.filter(date => keepsDate(date, guard)).map(dayOf))]
  const b = [...new Set(right.filter(date => keepsDate(date, guard)).map(dayOf))]
  if (!a.length || !b.length) return false
  return !a.some(x => b.some(y => Math.abs(x - y) <= window))
}

test('start-date window: benefit, cost and the control', async () => {
  // dates of every pair the baseline welded and every split the baseline merged, for the sweep
  const weldedDates: [string[], string[]][] = []
  const mergedDates: [string[], string[]][] = []

  /* -------------------------------------------------------------- arm WELD */
  let weldedBaseline = 0
  let weldedLive = 0
  let refusedBeyondTheSeasonCheck = 0
  let weldedWithBothSidesTv = 0
  const refused: string[] = []
  for (const [index, pair] of pairs.entries()) {
    const a = byId.get(pair.a)!
    const b = byId.get(pair.b)!
    let base = false
    for (const dated of ['january', 'real'] as const) {
      const suffix = `-w${index}${dated}`
      const left = clusterOf(a, suffix, dated)
      const right = clusterOf(b, suffix, dated)
      await link(left)
      await link(right)
      const welded = await mergesInto(left[0]!.uri, right[0]!.uri)
      if (dated === 'january') {
        base = welded
        if (welded) {
          weldedBaseline++
          weldedDates.push([
            [a.emitted, ...a.kitsu?.startDate ? [a.kitsu.startDate] : []],
            [b.emitted, ...b.kitsu?.startDate ? [b.kitsu.startDate] : []],
          ])
          // what a veto limited to TV would reach, which is the variant this measurement refuses
          if (typeOf(a.format) === 'TV' && typeOf(b.format) === 'TV') weldedWithBothSidesTv++
        }
      }
      else {
        if (welded) weldedLive++
        if (base && !welded) {
          if (!(namesASeason(a) && namesASeason(b))) refusedBeyondTheSeasonCheck++
          if (refused.length < 10) refused.push(`${a.romaji} || ${b.romaji} (${pair.year})`)
        }
      }
    }
  }

  /* ------------------------------------------------------------- arm SPLIT */
  let mergedBaseline = 0
  let mergedLive = 0
  let lostToATransposedKitsuDate = 0
  const byFormat = new Map<string, { merged: number, lost: number }>()
  const lost: string[] = []
  for (const [index, entry] of entries.entries()) {
    if (!entry.kitsu?.startDate) continue
    let base = false
    for (const dated of ['january', 'real'] as const) {
      const suffix = `-s${index}${dated}`
      const anilist = anilistMedia(entry, suffix, dated)
      const kitsu = kitsuMedia(entry, suffix, dated)!
      await upsertMedia([anilist, kitsu], [])
      const merged = await mergesInto(anilist.uri, kitsu.uri)
      const tally = byFormat.get(entry.format ?? 'null') ?? { merged: 0, lost: 0 }
      byFormat.set(entry.format ?? 'null', tally)
      if (dated === 'january') {
        base = merged
        if (merged) { mergedBaseline++; tally.merged++; mergedDates.push([[entry.emitted], [entry.kitsu.startDate]]) }
      }
      else {
        if (merged) mergedLive++
        if (base && !merged) {
          tally.lost++
          if (transposed(entry)) lostToATransposedKitsuDate++
          if (lost.length < 10) lost.push(`${entry.romaji} (${entry.format}) anilist ${entry.emitted} kitsu ${entry.kitsu.startDate}`)
        }
      }
    }
  }

  /* ------------------------------------------------------------ arm BRIDGE */
  // 'real' is a catalogue that only knows the year and says so the way six extractors say it.
  // 'believed' is the same catalogue with that January 1 taken at face value, which is the control:
  // it is what widening this rule to trust a year-only date would do.
  const attached = { january: 0, real: 0, believed: 0 }
  for (const [index, entry] of entries.entries()) {
    const title = entry.english ?? entry.romaji
    if (!title) continue
    for (const arm of ['january', 'real', 'believed'] as const) {
      const suffix = `-b${index}${arm}`
      const metadata = clusterOf(entry, suffix, arm === 'january' ? 'january' : 'real')
      const catalogue = media({
        uri: `jw:${entry.id}${suffix}`, score: 0.2, categories: ['SERIES'],
        titles: [{ language: 'en', title, score: 0.2 }],
        startDate: arm === 'believed' ? `${entry.year}-01-02` : `${entry.year}-01-01`,
      } as Partial<Media> & { uri: string })
      await link(metadata)
      await upsertMedia([catalogue], [])
      if (await mergesInto(metadata[0]!.uri, catalogue.uri)) attached[arm]++
    }
  }

  /* -------------------------------------------------------- arm UNSELECTED */
  // The census claims every weldable same-year pair. Sampling pairs it did NOT select and finding
  // none of them welds is what makes the weld counts totals rather than floors.
  const selected = new Set(pairs.map(pair => `${Math.min(pair.a, pair.b)}:${Math.max(pair.a, pair.b)}`))
  const byYear = new Map<number, Entry[]>()
  for (const entry of entries) {
    const bucket = byYear.get(entry.year)
    if (bucket) bucket.push(entry)
    else byYear.set(entry.year, [entry])
  }
  const years = [...byYear.keys()]
  let seed = 20260829
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  let sampled = 0
  let unexpected = 0
  while (sampled < 20_000) {
    const bucket = byYear.get(years[Math.floor(random() * years.length)]!)!
    if (bucket.length < 2) continue
    const a = bucket[Math.floor(random() * bucket.length)]!
    const b = bucket[Math.floor(random() * bucket.length)]!
    if (a.id === b.id) continue
    if (selected.has(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`)) continue
    const suffix = `-u${sampled++}`
    const left = clusterOf(a, suffix, 'january')
    const right = clusterOf(b, suffix, 'january')
    await link(left)
    await link(right)
    if (await mergesInto(left[0]!.uri, right[0]!.uri)) unexpected++
  }

  console.log(`census        ${entries.length} entries, ${pairs.length} same-year candidate pairs`)
  console.log(`WELD    wrong welds ${weldedBaseline} baseline -> ${weldedLive} with the window`)
  console.log(`        refused ${weldedBaseline - weldedLive} (${percent(weldedBaseline - weldedLive, weldedBaseline)})`)
  console.log(`        of those, ${refusedBeyondTheSeasonCheck} are pairs the season check could never reach`)
  console.log(`        a veto limited to TV on both sides would reach ${weldedWithBothSidesTv} of the ${weldedBaseline}`)
  for (const line of refused) console.log(`          ${line}`)
  console.log(`SPLIT   correct merges ${mergedBaseline} baseline -> ${mergedLive} with the window`)
  console.log(`        lost ${mergedBaseline - mergedLive} (${percent(mergedBaseline - mergedLive, mergedBaseline)})`)
  console.log(`        of those, ${lostToATransposedKitsuDate} are a kitsu date with the day and month swapped`)
  for (const [format, tally] of [...byFormat].sort((a, b) => b[1].merged - a[1].merged)) {
    console.log(`          ${format.padEnd(9)} merged ${String(tally.merged).padStart(5)}  lost ${String(tally.lost).padStart(3)} (${percent(tally.lost, tally.merged)})`)
  }
  for (const line of lost) console.log(`          ${line}`)
  console.log(`BRIDGE  streaming attaches ${attached.january} baseline -> ${attached.real} with the window`)
  console.log(`        control, the same January 1 believed instead of dropped: ${attached.believed}`)
  console.log(`RATIO   ${((weldedBaseline - weldedLive) / ((mergedBaseline - mergedLive) + (attached.january - attached.real))).toFixed(2)} wrong welds refused per correct merge destroyed`)
  console.log(`UNSELECTED ${sampled} same-year pairs outside the census, ${unexpected} of them weld`)

  /* ---------------------------------------------------------------- SWEEP */
  console.log('SWEEP   guard  window   welds refused   merges lost   ratio')
  for (const guard of ['none', 'jan1', 'day1'] as const) {
    for (const window of [7, 14, 21, 30, 45, 60, 90, 180]) {
      const stopped = weldedDates.filter(([a, b]) => wouldBlock(a, b, window, guard)).length
      const cost = mergedDates.filter(([a, b]) => wouldBlock(a, b, window, guard)).length
      console.log(`        ${guard.padEnd(5)} ${String(window).padStart(6)}   ${String(stopped).padStart(13)}   ${String(cost).padStart(11)}   ${cost ? (stopped / cost).toFixed(2) : 'inf'}`)
    }
  }

  /* ------------------------------------------------- the month-1 coercion */
  // what the window has to be wide enough to survive: kitsu answering YYYY-MM-01 when the day is
  // unknown, against an AniList date that is a real day
  const coerced = entries
    .filter(entry => {
      const kitsu = entry.kitsu?.startDate ? new Date(entry.kitsu.startDate) : null
      // a first-of-month kitsu date the January 1 guard KEEPS, so the window is all that stands
      // between the coercion and a refused merge, against an AniList side that is a real day
      return kitsu !== null && kitsu.getUTCDate() === 1 && kitsu.getUTCMonth() !== 0
        && new Date(entry.emitted).getUTCDate() !== 1
    })
    .map(entry => ({
      entry,
      sameMonth: new Date(entry.emitted).getUTCFullYear() === new Date(entry.kitsu!.startDate!).getUTCFullYear()
        && new Date(entry.emitted).getUTCMonth() === new Date(entry.kitsu!.startDate!).getUTCMonth(),
      gap: Math.abs(dayOf(entry.emitted) - dayOf(entry.kitsu!.startDate!)),
    }))
  // the band a 30 day window refuses and a 45 day one keeps, which is the whole argument for 45
  const band = coerced.filter(row => row.gap > 30 && row.gap <= 45).sort((a, b) => b.gap - a.gap)
  console.log(`COERCION kitsu first-of-month the guard keeps, against a day-precise AniList date: ${coerced.length} pairs`)
  console.log(`         ${coerced.filter(row => row.gap <= 30).length} within 30 days, ${band.length} in the 31 to 45 band a 30 day window would refuse, ${coerced.filter(row => row.gap > 45).length} beyond 45`)
  for (const row of band) console.log(`         ${row.gap}d ${row.entry.romaji}, anilist ${row.entry.emitted}, kitsu ${row.entry.kitsu?.startDate}`)

  // The sweep is arithmetic on the pass's own verdicts, so the row matching the SHIPPED guard and
  // window has to BE the live measurement. If it ever is not, the sweep is a model rather than a
  // projection and nothing else it prints can be believed. Note the guard name here has to track
  // startDay in fuzzy-merge.ts: it said 'jan1' after that widened to every first-of-month, and this
  // assertion still passed, because comparing the sweep against the live run can never fail.
  expect(weldedDates.filter(([a, b]) => wouldBlock(a, b, 45, 'day1')).length).toBe(weldedBaseline - weldedLive)
  expect(mergedDates.filter(([a, b]) => wouldBlock(a, b, 45, 'day1')).length).toBe(mergedBaseline - mergedLive)

  // ...which is why the DOCUMENTED figures are asserted separately. These are the numbers written in
  // the comment above the start-date check in fuzzy-merge.ts. A drift in either the code or the
  // comment fails here, which the assertion above structurally cannot do.
  expect(weldedBaseline - weldedLive).toBe(83)
  expect(mergedBaseline - mergedLive).toBe(81)
  expect(attached.january - attached.real).toBe(0)

  // the census is only a census if nothing outside it welds
  expect(unexpected).toBe(0)
  // and the change may only ever refuse, never allow
  expect(weldedLive).toBeLessThanOrEqual(weldedBaseline)
  expect(mergedLive).toBeLessThanOrEqual(mergedBaseline)
})
