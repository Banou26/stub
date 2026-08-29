/**
 * The benefit and cost of the companion-marker check in src/worker/store/fuzzy-merge.ts, and of the
 * candidates that were measured and refused in its place.
 *
 *   node scripts/measure-start-date-window.mjs
 *   ./node_modules/.bin/vitest run --config vitest.companion-marker.config.ts \
 *     --disableConsoleIntercept --reporter=verbose
 *
 * The corpus is the one scripts/measure-start-date-window.mjs already fetches, so there is no second
 * fetch script: same 21853 AniList entries with kitsu's record beside each, same 577 candidate pairs.
 * `--disableConsoleIntercept` is load bearing, since vitest swallows console output without it and a
 * rig that prints nothing reports success while showing no measurement.
 *
 * TWO LAYERS, and the first exists to make the second believable.
 *
 *   `arms` drives the REAL fuzzyMergeMediaClusters over the real store and counts what it does.
 *   `verdict` is a reimplementation of sameShow, used to price candidates that are not in the file
 *     and could otherwise only be priced by editing it. It is required to reproduce `arms` exactly
 *     before any candidate number is printed, so a drifted reimplementation fails the run instead of
 *     quietly answering about a different function.
 *
 * THREE ARMS, and the cost arms are the ones that decide everything here:
 *
 *   WELD   candidate pairs of DISTINCT AniList entries. Two ids are two works and stub is one cluster
 *          per season, so a weld is a wrong weld and refusing it is the benefit.
 *   SPLIT  one show reaching the store as TWO clusters, AniList's media and kitsu's, unlinked, which
 *          is production whenever kitsu's `include=mappings` answers without an anilist or mal
 *          mapping. A merge is correct and losing it is the cost.
 *   BRIDGE a one-title streaming cluster at score 0.2 dated `${year}-01-01` meeting the metadata
 *          cluster. A merge is correct and losing it is the cost.
 *
 * That the cost arms can express a cost at all is not assumed: the candidate table below prints one
 * rule that destroys 8789 of 17853 bridge attaches and another that destroys 546 of 15386 split
 * merges, so a 2 and a 0 on the same arms are results rather than a rig that cannot fail.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import type { Media } from '../src/worker/store/types'
import { findAggregatedMedia, upsertMedia } from '../src/worker/store/db'
import { fuzzyMergeMediaClusters, profileCluster } from '../src/worker/store/fuzzy-merge'
import { stripTitle, titleSimilarity } from '../src/sources/utils'

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

const CACHE = new URL('../node_modules/.cache/', import.meta.url).pathname
const { entries, pairs } = JSON.parse(readFileSync(`${CACHE}start-date-pool.json`, 'utf8')) as { entries: Entry[], pairs: Pair[] }
const byId = new Map(entries.map(entry => [entry.id, entry]))

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

const anilistMedia = (entry: Entry, suffix: string) =>
  media({
    uri: `anilist:${entry.id}${suffix}`, score: 0.8,
    type: typeOf(entry.format) as Media['type'],
    categories: entry.format === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    titles: [
      ...entry.english ? [{ language: 'en', title: entry.english, score: 0.8 }] : [],
      ...entry.romaji ? [{ language: 'jp-en', title: entry.romaji, score: 0.8 }] : [],
      ...entry.native ? [{ language: 'jp', title: entry.native, score: 0.8 }] : [],
    ],
    startDate: entry.emitted, episodeCount: entry.episodes,
  } as Partial<Media> & { uri: string })

const kitsuMedia = (entry: Entry, suffix: string) => {
  const record = entry.kitsu
  if (!record?.titles.length) return null
  return media({
    uri: `kitsu:${record.id}${suffix}`, score: 0.3,
    type: (record.subtype === 'movie' ? 'MOVIE' : record.subtype === 'TV' ? 'TV' : record.subtype === 'special' ? 'SPECIAL' : record.subtype === 'OVA' ? 'OVA' : record.subtype === 'ONA' ? 'ONA' : null) as Media['type'],
    categories: record.subtype === 'movie' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    // kitsu/extractor.ts buildTitles: titles.en, canonicalTitle, titles.ja_jp, first spelling wins
    titles: record.titles.map((title, index) => ({ language: index === 2 ? 'ja' : 'en', title, score: 0.3 })),
    startDate: record.startDate,
  } as Partial<Media> & { uri: string })
}

/** the one-title streaming cluster: score 0.2, no `type` at all, a date built out of a bare year */
const streamingMedia = (entry: Entry, suffix: string) =>
  media({
    uri: `jw:${entry.id}${suffix}`, score: 0.2, categories: ['SERIES'],
    titles: [{ language: 'en', title: (entry.english ?? entry.romaji)!, score: 0.2 }],
    startDate: `${entry.year}-01-01`,
  } as Partial<Media> & { uri: string })

const clusterOf = (entry: Entry, suffix: string) =>
  [anilistMedia(entry, suffix), kitsuMedia(entry, suffix)].filter(Boolean) as Media[]

const link = async (medias: Media[]) =>
  upsertMedia(medias, medias.slice(1).map(m => ({ mediaUri: medias[0]!.uri, handleUri: m.uri })))

/* ------------------------------------------------------------------ the reimplementation */

const SIMILARITY_THRESHOLD = 0.9
const maxPossibleSimilarity = (a: string, b: string) => {
  const counts = new Map<string, number>()
  for (const char of a) counts.set(char, (counts.get(char) ?? 0) + 1)
  let common = 0
  for (const char of b) {
    const count = counts.get(char) ?? 0
    if (count > 0) { counts.set(char, count - 1); common++ }
  }
  return common / Math.max(a.length, b.length)
}
const trailingNumber = (title: string) => {
  const match = /^(.*?)\s*(\d+)$/.exec(title)
  return match ? { stem: match[1]!, value: Number(match[2]) } : { stem: title, value: null as number | null }
}
const differOnlyByTrailingNumber = (a: string, b: string) => {
  const left = trailingNumber(a), right = trailingNumber(b)
  return left.value !== right.value && left.stem === right.stem
}
const disjoint = (a: Set<string>, b: Set<string>) => a.size > 0 && b.size > 0 && ![...a].some(value => b.has(value))

type Profile = ReturnType<typeof profileCluster>
type Side = { cluster: Media[], profile: Profile }
const side = (cluster: Media[]): Side => ({ cluster, profile: profileCluster(cluster) })

/** every gate sameShow applies, plus the year bucketing its caller applies, with two switches */
const verdict = async (a: Side, b: Side, { companion = true, date = true } = {}) => {
  if (!a.profile.titles.length || !b.profile.titles.length) return false
  if (![...a.profile.years].some(year => b.profile.years.has(year))) return false
  if (disjoint(a.profile.formats as Set<string>, b.profile.formats as Set<string>)) return false
  if (a.profile.seasons.size && b.profile.seasons.size && ![...a.profile.seasons].some(s => b.profile.seasons.has(s))) return false
  if (date && a.profile.days.size && b.profile.days.size
    && ![...a.profile.days].some(x => [...b.profile.days].some(y => Math.abs(x - y) <= 45))) return false
  if (companion && disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>)
    && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)) return false
  for (const titleA of a.profile.titles) {
    for (const titleB of b.profile.titles) {
      if (titleA === titleB) return true
      if (differOnlyByTrailingNumber(titleA, titleB)) continue
      if (maxPossibleSimilarity(titleA, titleB) < SIMILARITY_THRESHOLD) continue
      if (await titleSimilarity(titleA, titleB) >= SIMILARITY_THRESHOLD) return true
    }
  }
  return false
}

/* ------------------------------------------------------------------ the candidates */

const SHIPPED_MARKERS = [
  'specials', 'special', 'picture drama', 'recap', 'ova', 'ona', 'bonus', 'mini anime',
  'episode 0', 'trailer',
]
const SWEPT_MARKERS = [
  ...SHIPPED_MARKERS, 'picture dramas', 'recaps', 'digest', 'ovas', 'omake', 'omakes', 'extra',
  'extras', 'pilot', 'ex', 'short', 'shorts', 'preview', 'previews', 'pv',
]
const marked = (a: string[], b: string[], markers: string[]) => {
  for (const [longer, shorter] of [[a, b], [b, a]] as [string[], string[]][]) {
    for (const title of longer) {
      for (const marker of markers) {
        if (title.length <= marker.length + 1 || !title.endsWith(` ${marker}`)) continue
        if (shorter.includes(title.slice(0, -(marker.length + 1)).trim())) return true
      }
    }
  }
  return false
}

const EXTRA_TYPES = new Set(['SPECIAL', 'OVA', 'ONA'])
const MAIN_TYPES = new Set(['TV', 'MOVIE'])
/** SPECIAL/OVA/ONA as a THIRD format that disagrees with MOVIE and SERIES */
const thirdFormat = (cluster: Media[]) => {
  const out = new Set<string>()
  for (const m of cluster) {
    if (m.type && EXTRA_TYPES.has(m.type)) { out.add('EXTRA'); continue }
    for (const category of m.categories ?? []) if (category === 'MOVIE' || category === 'SERIES') out.add(category)
    if (m.type === 'MOVIE') out.add('MOVIE')
    else if (m.type === 'TV') out.add('SERIES')
  }
  return out
}
/** the same idea read off `media.type` only, so a source that declares no type never blocks */
const kind = (cluster: Media[]) => {
  const out = new Set<string>()
  for (const m of cluster) {
    if (m.type && EXTRA_TYPES.has(m.type)) out.add('EXTRA')
    else if (m.type && MAIN_TYPES.has(m.type)) out.add('MAIN')
  }
  return out
}

const CANDIDATES: [string, (a: Side, b: Side) => boolean][] = [
  ['third format', (a, b) => disjoint(thirdFormat(a.cluster), thirdFormat(b.cluster))],
  ['kind only', (a, b) => disjoint(kind(a.cluster), kind(b.cluster))],
  ['type disagreement', (a, b) => disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>)],
  ['marker', (a, b) => marked(a.profile.titles, b.profile.titles, SWEPT_MARKERS)],
  ['SHIPPED both', (a, b) =>
    disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>)
    && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)],
]

/* ------------------------------------------------------------------ the run */

type Arm = { name: string, a: Side, b: Side }
const buildArms = () => {
  const arms: Arm[] = []
  for (const pair of pairs) {
    const ea = byId.get(pair.a), eb = byId.get(pair.b)
    if (!ea || !eb) continue
    arms.push({ name: 'weld', a: side(clusterOf(ea, '')), b: side(clusterOf(eb, '')) })
  }
  for (const entry of entries) {
    const kitsu = kitsuMedia(entry, '')
    if (kitsu) arms.push({ name: 'split', a: side([anilistMedia(entry, '')]), b: side([kitsu]) })
    arms.push({ name: 'bridge', a: side(clusterOf(entry, '')), b: side([streamingMedia(entry, '')]) })
  }
  return arms
}

const count = (rows: { name: string, hit: boolean }[], name: string) => rows.filter(r => r.name === name && r.hit).length

test('the real pass, and a reimplementation held to it', async () => {
  /* ---- layer one: the real merge over the real store ---- */
  const real = { weld: 0, split: 0, bridge: 0 }
  let n = 0
  for (const pair of pairs) {
    const ea = byId.get(pair.a), eb = byId.get(pair.b)
    if (!ea || !eb) continue
    const suffix = `-w${n++}`
    const ma = clusterOf(ea, suffix), mb = clusterOf(eb, suffix)
    await link(ma)
    await link(mb)
    await fuzzyMergeMediaClusters([await findAggregatedMedia(ma[0]!.uri), await findAggregatedMedia(mb[0]!.uri)])
    if ((await findAggregatedMedia(ma[0]!.uri)).some(m => m.uri === mb[0]!.uri)) real.weld++
  }
  let m = 0
  for (const entry of entries) {
    const suffix = `-s${m++}`
    const anilist = anilistMedia(entry, suffix)
    const kitsu = kitsuMedia(entry, suffix)
    if (kitsu) {
      await upsertMedia([anilist, kitsu], [])
      await fuzzyMergeMediaClusters([await findAggregatedMedia(anilist.uri), await findAggregatedMedia(kitsu.uri)])
      if ((await findAggregatedMedia(anilist.uri)).some(x => x.uri === kitsu.uri)) real.split++
    }
    const bridgeSuffix = `-b${m}`
    const metadata = clusterOf(entry, bridgeSuffix)
    const streaming = streamingMedia(entry, bridgeSuffix)
    await link(metadata)
    await upsertMedia([streaming], [])
    await fuzzyMergeMediaClusters([await findAggregatedMedia(metadata[0]!.uri), await findAggregatedMedia(streaming.uri)])
    if ((await findAggregatedMedia(metadata[0]!.uri)).some(x => x.uri === streaming.uri)) real.bridge++
  }
  console.log(`SHIPPED, real fuzzyMergeMediaClusters: welds ${real.weld}, split merges ${real.split}, bridge attaches ${real.bridge}`)

  /* ---- layer two: the reimplementation, held to layer one ---- */
  const arms = buildArms()
  const mirrored = { weld: 0, split: 0, bridge: 0 }
  const residual: { name: string, a: Side, b: Side }[] = []
  for (const arm of arms) {
    if (await verdict(arm.a, arm.b)) mirrored[arm.name as keyof typeof mirrored]++
    if (await verdict(arm.a, arm.b, { companion: false })) residual.push(arm)
  }
  console.log(`MIRROR, the reimplementation with the same switches: welds ${mirrored.weld}, split merges ${mirrored.split}, bridge attaches ${mirrored.bridge}`)
  expect(mirrored).toEqual(real)

  const before = {
    weld: residual.filter(r => r.name === 'weld').length,
    split: residual.filter(r => r.name === 'split').length,
    bridge: residual.filter(r => r.name === 'bridge').length,
  }
  console.log(`RESIDUAL, companion check off, everything else on: welds ${before.weld}, split merges ${before.split}, bridge attaches ${before.bridge}`)
  console.log('')
  console.log('candidate            welds refused   split merges lost   bridge attaches lost   ratio')
  for (const [name, rule] of CANDIDATES) {
    const rows = residual.map(r => ({ name: r.name, hit: rule(r.a, r.b) }))
    const refused = count(rows, 'weld')
    const split = count(rows, 'split')
    const bridge = count(rows, 'bridge')
    console.log(`${name.padEnd(20)} ${String(refused).padStart(6)} / ${before.weld}  ${String(split).padStart(8)} / ${before.split}  ${String(bridge).padStart(9)} / ${before.bridge}   ${split + bridge ? (refused / (split + bridge)).toFixed(3) : 'no cost measured'}`)
  }

  console.log('')
  console.log('MARKER SWEEP, one marker at a time under the type-disagreement gate (welds / split / bridge):')
  for (const marker of SWEPT_MARKERS) {
    const rows = residual.map(r => ({
      name: r.name,
      hit: disjoint(r.a.profile.types as Set<string>, r.b.profile.types as Set<string>)
        && marked(r.a.profile.titles, r.b.profile.titles, [marker]),
    }))
    console.log(`  ${marker.padEnd(16)} ${String(count(rows, 'weld')).padStart(3)} / ${String(count(rows, 'split')).padStart(3)} / ${String(count(rows, 'bridge')).padStart(3)}`)
  }

  console.log('')
  console.log('the welds the shipped check refuses:')
  for (const r of residual) {
    if (r.name !== 'weld') continue
    if (!(disjoint(r.a.profile.types as Set<string>, r.b.profile.types as Set<string>) && marked(r.a.profile.titles, r.b.profile.titles, SHIPPED_MARKERS))) continue
    console.log(`  ${[...r.a.profile.types]}/${[...r.b.profile.types]}  ${r.a.profile.titles[0]}  ::  ${r.b.profile.titles[0]}`)
  }
  console.log('the correct merges it destroys:')
  for (const r of residual) {
    if (r.name === 'weld') continue
    if (!(disjoint(r.a.profile.types as Set<string>, r.b.profile.types as Set<string>) && marked(r.a.profile.titles, r.b.profile.titles, SHIPPED_MARKERS))) continue
    console.log(`  ${r.name} ${[...r.a.profile.types]}/${[...r.b.profile.types]}  ${JSON.stringify(r.a.profile.titles)}  ::  ${JSON.stringify(r.b.profile.titles)}`)
  }
}, 3_600_000)

/** the disagreement the format neutrality in profileCluster is defending, priced on its own */
test('how often two catalogues type one anime differently', () => {
  let both = 0, same = 0, crossing = 0
  for (const entry of entries) {
    const anilist = typeOf(entry.format)
    const kitsu = entry.kitsu && kitsuMedia(entry, '')?.type
    if (!anilist || !kitsu) continue
    both++
    if (anilist === kitsu) same++
    else if (EXTRA_TYPES.has(anilist) !== EXTRA_TYPES.has(kitsu)) crossing++
  }
  console.log(`anilist format against kitsu subtype, ${both} anime where both declare one:`)
  console.log(`  identical ${same} (${(100 * same / both).toFixed(2)}%), different ${both - same} (${(100 * (both - same) / both).toFixed(2)}%)`)
  console.log(`  ...of which SPECIAL/OVA/ONA on one side against TV/MOVIE on the other: ${crossing} (${(100 * crossing / both).toFixed(2)}%)`)
  expect(both).toBeGreaterThan(10_000)
})

/**
 * ROBUSTNESS. Clusters here carry two typed sources. Production clusters routinely carry a third,
 * `offline`, which emits manami's `ty` (offline/normalize.ts:98). A third type widens both type sets
 * and so makes the disagreement gate fire LESS, lowering benefit and cost together, and the rule is
 * only worth anything if it survives that.
 */
test('a third typed source in every cluster', async () => {
  const manami = new Map<number, { title: string, type: string }>()
  for (const record of JSON.parse(readFileSync(`${CACHE}manami-titles.json`, 'utf8')).records) {
    for (const source of record.sources ?? []) {
      const match = /anilist\.co\/anime\/(\d+)/.exec(source)
      if (match) manami.set(Number(match[1]), record)
    }
  }
  const KINDS = new Set(['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'])
  const offlineMedia = (entry: Entry) => {
    const record = manami.get(entry.id)
    if (!record) return null
    const type = KINDS.has(record.type) ? record.type : null
    return media({
      uri: `offline:${entry.id}`, score: 0.2, type: type as Media['type'],
      categories: type === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
      titles: [{ language: 'en', title: record.title, score: 0.2 }],
    } as Partial<Media> & { uri: string })
  }
  let both = 0, same = 0
  for (const entry of entries) {
    const anilist = typeOf(entry.format), offline = offlineMedia(entry)?.type
    if (!anilist || !offline) continue
    both++
    if (anilist === offline) same++
  }
  console.log(`manami type against anilist format, ${both} anime where both declare one: identical ${same}, different ${both - same} (${(100 * (both - same) / both).toFixed(2)}%)`)

  for (const withOffline of [false, true]) {
    const clusterFor = (entry: Entry) =>
      [anilistMedia(entry, ''), kitsuMedia(entry, ''), withOffline ? offlineMedia(entry) : null].filter(Boolean) as Media[]
    let welds = 0, refused = 0, merges = 0, lost = 0, attaches = 0, lostAttach = 0
    for (const pair of pairs) {
      const ea = byId.get(pair.a), eb = byId.get(pair.b)
      if (!ea || !eb) continue
      const a = side(clusterFor(ea)), b = side(clusterFor(eb))
      if (!await verdict(a, b, { companion: false })) continue
      welds++
      if (disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>) && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)) refused++
    }
    for (const entry of entries) {
      const kitsu = kitsuMedia(entry, '')
      if (kitsu) {
        const a = side([anilistMedia(entry, '')]), b = side([kitsu])
        if (await verdict(a, b, { companion: false })) {
          merges++
          if (disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>) && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)) lost++
        }
      }
      const a = side(clusterFor(entry)), b = side([streamingMedia(entry, '')])
      if (await verdict(a, b, { companion: false })) {
        attaches++
        if (disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>) && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)) lostAttach++
      }
    }
    console.log(`${withOffline ? 'anilist + kitsu + offline' : 'anilist + kitsu          '}  residual welds ${welds}, refused ${refused}   split merges ${merges}, lost ${lost}   bridge attaches ${attaches}, lost ${lostAttach}`)
  }
}, 3_600_000)

/**
 * REPLICATION on a pool selected a completely different way: the same-year pairs manami's own
 * `related` graph names, which never looks at a title. Agreement with the census above is therefore
 * not agreement by construction.
 */
test('the same measurement on manami related pairs', async () => {
  const data = JSON.parse(readFileSync(`${CACHE}manami-titles.json`, 'utf8'))
  const byUrl = new Map<string, any>()
  for (const record of data.records) for (const url of record.sources) byUrl.set(url, record)
  const anilistIdOf = (urls: string[]) => {
    for (const url of urls) { const match = /anilist\.co\/anime\/(\d+)/.exec(url); if (match) return Number(match[1]) }
  }
  const FORMAT: Record<string, string> = { TV: 'SERIES', MOVIE: 'MOVIE' }
  const candidates: [number, number][] = []
  const seen = new Set<string>()
  for (const record of data.records) {
    if (!record.related.length) continue
    for (const url of record.related) {
      const other = byUrl.get(url)
      if (!other || other === record) continue
      const key = [record.title, other.title].sort().join(' ')
      if (seen.has(key)) continue
      seen.add(key)
      if (record.year === null || other.year === null || record.year !== other.year) continue
      const fa = FORMAT[record.type], fb = FORMAT[other.type]
      if (fa && fb && fa !== fb) continue
      const a = anilistIdOf(record.sources), b = anilistIdOf(other.sources)
      if (a && b) candidates.push([a, b])
    }
  }
  const step = Math.max(1, Math.floor(candidates.length / 900))
  const sample = candidates.filter((_, index) => index % step === 0).slice(0, 900)

  let examined = 0, beforeDate = 0, afterDate = 0, refused = 0
  for (const [idA, idB] of sample) {
    const ea = byId.get(idA), eb = byId.get(idB)
    if (!ea || !eb) continue
    examined++
    const a = side(clusterOf(ea, '')), b = side(clusterOf(eb, ''))
    if (await verdict(a, b, { companion: false, date: false })) beforeDate++
    if (!await verdict(a, b, { companion: false })) continue
    afterDate++
    if (disjoint(a.profile.types as Set<string>, b.profile.types as Set<string>) && marked(a.profile.titles, b.profile.titles, SHIPPED_MARKERS)) refused++
  }
  console.log(`manami same-year related pairs present in the corpus: ${examined} of ${sample.length} sampled`)
  console.log(`  weld with the date axis off ${beforeDate}, with it on ${afterDate}, of those refused by the companion check ${refused}`)
  expect(examined).toBeGreaterThan(500)
}, 3_600_000)
