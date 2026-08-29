import type { Media } from './types'

import { stripTitle, titleSimilarity } from '../../sources/utils'
import { isOnlySeasonLabel, parseSeasonNumber } from '../../sources/season'
import { findAggregatedMedia, linkSameMediaPairs } from './db'

const SIMILARITY_THRESHOLD = 0.9
// Bounds the wasm work, and it is the square that matters: sameShow compares every kept title of one
// cluster against every kept title of the other, so a pair costs up to 36 alignments today and a year
// bucket costs that times its pairs. Eight titles would take one pair to 64, +78% on the single loop
// the whole pass spends its time in, so this is not a knob to turn without measuring the loop first.
const MAX_TITLES_PER_CLUSTER = 6
const MAX_CACHED_DECISIONS = 50_000

type Format = 'MOVIE' | 'SERIES'

type ClusterProfile = {
  cluster: Media[]
  key: string
  titles: string[]
  years: Set<number>
  formats: Set<Format>
  seasons: Set<number>
  cacheKey: string
}

// shares titleSimilarity's strip. Widen only this one and the similarity path strips a title back down to its
// latin fragment, so two Vanguard seasons both reduce to "divinez" and score a perfect 1.
const normalizeTitle = (title: string) =>
  stripTitle(title)
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// a title with no letter left is a year or a season number, never an identity, and a bad link is permanent: graph.link has no inverse
const HAS_LETTER = /\p{L}/u

// ...and neither is one that has letters but says only which season it is, which HAS_LETTER waves
// through: see isOnlySeasonLabel for the pair of shows that cost
const carriesIdentity = (title: string) => HAS_LETTER.test(title) && !isOnlySeasonLabel(title)

// Code unit order rather than localeCompare, which is locale dependent: the point of every comparator
// in this file is that two runs agree, and a collation that reads a locale off the host does not.
const compareStrings = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

const yearOf = (date: string | null) => {
  if (!date) return null
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear()
}

/**
 * The tie inside a score tier is broken by the title itself, and that choice was MEASURED rather than
 * argued, because the obvious arguments point the wrong way.
 *
 * Three arms move when the ordering changes, over the manami database (41537 records, 2026-27), and
 * no rule wins all three, so the numbers rather than a principle decide it:
 *
 *   A  two different shows sharing one junk franchise label, does it survive the slice on BOTH sides
 *      and weld them ("Star"t and Agitation! both carry "irodorimidori"): 1547 pairs, lower is better
 *   B  one show reaching the store as two clusters holding overlapping subsets of one title pool, do
 *      they keep a title in common: 6502 cases, higher is better
 *   C  a ONE-title streaming cluster meeting a fat metadata cluster, is that title among the six:
 *      12399 cases, higher is better. This is JustWatch attaching to Mushoku Tensei.
 *
 *                       A weld     B split     C attach
 *     arrival order      64.5%       94.9%        56.0%     what this replaces
 *     title ascending    69.6%       99.9%        70.0%     what this is
 *     longest first      53.8%      100.0%        19.9%     best on A and unusable on C
 *     shortest first     82.7%      100.0%        98.7%     the control, and it inverts A as predicted
 *
 * So ordering by the title costs five points on A and buys five on B and fourteen on C. Both recall
 * arms rise for the same reason: an ordering applied identically to both sides cannot drop a title one
 * side keeps, which is exactly what arrival order was doing to one split cluster in twenty.
 *
 * Two things worth knowing before changing this again. Latin code points sort below CJK ones, so this
 * does hand a tie to the english titles, and the intuition that this starves the native title and
 * costs matches is measurably wrong: C rises, because a streaming catalogue lists in latin and the
 * native title is not what it is looked up by. And A is not really the slice's job. Relying on a random
 * six to drop a third of the wrong welds is relying on luck for correctness, and it is what made the
 * same two shows merge on one load and not the next. The 255 of those 1547 where exactly one side
 * names a season ("86" against "86 Part 2", both carrying "86 不存在的战区") are a veto gap, and closing
 * it was measured afterwards and does NOT pay A back: see the season check in sameShow for the numbers.
 */
const orderWithinTier = (titles: string[]) => [...titles].sort(compareStrings)

/**
 * The titles this cluster is compared on, as a function of the SET of (title, score) pairs it holds
 * and of nothing else.
 *
 * Every title's `score` is a single module constant per SOURCE (0.9 jikan and ani.zip, 0.8 anilist,
 * 0.5 crunchyroll, 0.3 the english metadata block, 0.25 watchmode, 0.2 the streaming catalogues), so
 * a comparator on it returns 0 for every pair inside a tier and Array.prototype.sort leaves those in
 * insertion order. Insertion order was cluster order, which is union-find component order, which is
 * [surviving root's members..., absorbed root's members...] and therefore the order the extractors'
 * HTTP responses landed in. The same cluster then kept a different six from one run to the next, and
 * the six decide whether it merges at all: an already welded Mushoku Tensei component carries eight
 * distinct normalized titles at 0.9, and whether ani.zip's short "mushoku tensei" is among the six is
 * the whole difference between JustWatch attaching and not. With the long titles only,
 * maxPossibleSimilarity measures 0.389, 0.359 and 0.326 against them and refuses the pair before the
 * matcher even runs.
 *
 * Deduplicating through a Map keyed on the normalized title rather than sorting and then deduplicating
 * matters for the same reason: a dedup over a sorted array keeps whichever copy the sort left first,
 * and inside a tier that is again arrival order.
 */
const selectTitles = (cluster: Media[]): string[] => {
  const bestScore = new Map<string, number>()
  for (const media of cluster) {
    for (const { title, score } of media.titles ?? []) {
      const normalized = normalizeTitle(title)
      if (!carriesIdentity(normalized)) continue
      const value = score ?? -1
      const current = bestScore.get(normalized)
      if (current === undefined || value > current) bestScore.set(normalized, value)
    }
  }

  const byScore = new Map<number, string[]>()
  for (const [title, score] of bestScore) {
    const tier = byScore.get(score)
    if (tier) tier.push(title)
    else byScore.set(score, [title])
  }

  return [...byScore]
    .sort(([a], [b]) => b - a)
    .flatMap(([, titles]) => orderWithinTier(titles))
    .slice(0, MAX_TITLES_PER_CLUSTER)
}

/** Everything the pass reads off a cluster. Nothing here may depend on the order of `cluster`. */
export const profileCluster = (cluster: Media[]): ClusterProfile => {
  const key = cluster.map(media => media.uri).sort()[0]!
  const titles = selectTitles(cluster)
  const years =
    new Set(
      cluster
        .map(media => yearOf(media.startDate))
        .filter((year): year is number => year !== null)
    )
  const formats =
    new Set(
      cluster
        .flatMap(media =>
          // one-off specials straddle the movie/series boundary - keep them format-neutral
          media.type === 'SPECIAL' || media.type === 'OVA' || media.type === 'ONA' ? []
          : [
            ...media.categories ?? [],
            ...media.type === 'MOVIE' ? ['MOVIE' as const] : media.type === 'TV' ? ['SERIES' as const] : [],
          ]
        )
        .filter((category): category is Format => category === 'MOVIE' || category === 'SERIES')
    )
  // read off the RAW titles, because normalizeTitle folds `Season 4` and `Season 40` closer together
  // and drops the delimiters `第 4 期` is allowed to carry
  const seasons =
    new Set(
      cluster
        .flatMap(media => media.titles ?? [])
        .map(({ title }) => parseSeasonNumber(title))
        .filter((season): season is number => season !== undefined)
    )
  return {
    cluster,
    key,
    titles,
    years,
    formats,
    seasons,
    // The key has to identify the SET of titles, because that is all sameShow's verdict depends on: its
    // title comparison is an existential double loop, so no ordering of the same six can change the
    // answer. Sorting here keeps one logical cluster on ONE cache entry, where joining them in
    // selection order once wrote a second entry per arrival order for a pair whose verdict could not
    // differ, re-ran every pair through the wasm loop on the pass after any merge, and counted twice
    // toward the MAX_CACHED_DECISIONS wipe that then threw away the entries still worth keeping.
    // Joining with ',' is safe only because normalizeTitle keeps nothing but letters, numbers and
    // single spaces, so no separator can survive inside a title: let punctuation through there and
    // cache keys start colliding silently. Seasons are joined numerically for legibility only, the
    // default comparator canonicalizes them correctly too ([2,10,1] and [1,10,2] both give "1,10,2").
    cacheKey: `${key}#${[...titles].sort(compareStrings).join(',')}#${[...formats].sort(compareStrings).join(',')}#${[...seasons].sort((a, b) => a - b).join(',')}`,
  }
}

// exact upper bound on titleSimilarity - skips the WASM alignment for pairs that can never reach the threshold
const maxPossibleSimilarity = (a: string, b: string) => {
  const counts = new Map<string, number>()
  for (const char of a) counts.set(char, (counts.get(char) ?? 0) + 1)
  let common = 0
  for (const char of b) {
    const count = counts.get(char) ?? 0
    if (count > 0) {
      counts.set(char, count - 1)
      common++
    }
  }
  return common / Math.max(a.length, b.length)
}

const trailingNumber = (title: string) => {
  const match = /^(.*?)\s*(\d+)$/.exec(title)
  return match ? { stem: match[1]!, value: Number(match[2]) } : { stem: title, value: null }
}

// A trailing number is compared as a VALUE, never as characters. "yami shibai 16" and "yami shibai 17"
// are two different shows and score 0.8849, while "onii-chan!" and "oniichan" are one show and score
// 1.0000, so no threshold tells them apart: alignment charges nothing for a hyphen that is noise and
// almost nothing for a digit that is the whole identity. Both re-measured on frizbee 2026-08-29; they
// read 0.929 and 0.833 here until then, which were seal-wasm's and outlived it.
const differOnlyByTrailingNumber = (a: string, b: string) => {
  const left = trailingNumber(a)
  const right = trailingNumber(b)
  return left.value !== right.value && left.stem === right.stem
}

// Year equality is guaranteed by the caller's bucketing
const sameShow = async (a: ClusterProfile, b: ClusterProfile) => {
  if (a.formats.size && b.formats.size && ![...a.formats].some(format => b.formats.has(format))) return false
  // Only a DISAGREEMENT blocks. A cluster whose sources never spell the season out has to stay free to
  // merge, or the pass stops doing the job it exists for.
  //
  // Making silence itself block was MODELLED and REFUSED, over the manami database (41537 records,
  // 2026-27) driven through this file's own profileCluster and titleSimilarity. The rule tried: refuse
  // when one side declares season N>=2 and the other declares no season at all.
  //
  //   refuses  323 wrong welds
  //   costs    592 of 33188 merges where one show arrives as two overlapping subsets of its titles
  //            11415 of 181677 attaches where a ONE-title streaming cluster meets a fat metadata
  //              cluster, which is arm C above and the job this pass exists for, over 2589 shows
  //            2589 of 2824 on an adversarial split with every season-marked title on one side
  //   ratio    0.55 / 0.03 / 0.12, combined 323 refused against 12007 lost, one wrong weld stopped
  //              per 37 correct merges destroyed
  //
  // The year bucketing has already spent the separation the rule is imagined to buy: of the 373 pairs
  // where exactly one side names a season, ZERO have year sets that differ, because this pass only ever
  // compares within a year bucket, so "[Oshi no Ko]" 2023 against its 2024 second season is refused
  // before any of this runs. What is left in that 373 is same-year split cours, recaps and specials.
  // The cost is not bounded by the year at all, since both sides of a split cluster hold the same
  // record and so the same year, so the rule is paid for out of "[Oshi no Ko] 2nd Season" (2024)
  // attaching to a streaming cluster named "Oshi no Ko", and 2588 other shows. Ten narrower variants
  // were measured too. The best of them (also require the season-less side to carry no season marker in
  // ANY raw title, and the two clusters to hold a title pair that is equal once the marker is stripped
  // and unequal before) keeps 126 of the 323 for 578 lost attaches across 468 shows, ratio 0.22, and
  // still refuses that same Oshi no Ko attach. Nothing in the family reaches 1.
  //
  // WHAT THEREFORE GETS THROUGH, known rather than new: "86" and "86 Part 2", both 2021, both carrying
  // the synonym "86 -不存在的战区-", one naming a season and one not, weld on the exact-title shortcut
  // below. That is 373 of the 12674 pairs of distinct records that share a title after the slice; the
  // other 12050 have NEITHER side naming a season and are franchise-label collisions ("minna no uta" is
  // carried by 1039 records), which no season rule reaches. Pinned by the KNOWN GAP test in
  // season-separation.test.ts, so closing it fails there loudly.
  if (a.seasons.size && b.seasons.size && ![...a.seasons].some(season => b.seasons.has(season))) return false
  for (const titleA of a.titles) {
    for (const titleB of b.titles) {
      if (titleA === titleB) return true
      if (differOnlyByTrailingNumber(titleA, titleB)) continue
      if (maxPossibleSimilarity(titleA, titleB) < SIMILARITY_THRESHOLD) continue
      if (await titleSimilarity(titleA, titleB) >= SIMILARITY_THRESHOLD) return true
    }
  }
  return false
}

const pairKey = (a: ClusterProfile, b: ClusterProfile) =>
  a.cacheKey < b.cacheKey ? `${a.cacheKey}|${b.cacheKey}` : `${b.cacheKey}|${a.cacheKey}`

const pairDecisions = new Map<string, boolean>()

// The cache is keyed on exactly the three fields sameShow reads plus the component's identity, so a
// reused verdict is always still a verdict about the same inputs. That is what makes it safe to ask
// again below without paying for the wasm loop twice when nothing has moved.
const decide = async (a: ClusterProfile, b: ClusterProfile) => {
  const key = pairKey(a, b)
  const cached = pairDecisions.get(key)
  if (cached !== undefined) return cached
  const match = await sameShow(a, b)
  pairDecisions.set(key, match)
  return match
}

export const fuzzyMergeMediaClusters = async (clusters: Media[][]): Promise<boolean> => {
  const profiles = clusters.filter(cluster => cluster.length).map(profileCluster)

  const byYear = new Map<number, ClusterProfile[]>()
  for (const profile of profiles) {
    if (!profile.titles.length) continue
    for (const year of profile.years) {
      const bucket = byYear.get(year)
      if (bucket) bucket.push(profile)
      else byYear.set(year, [profile])
    }
  }

  if (pairDecisions.size > MAX_CACHED_DECISIONS) pairDecisions.clear()

  const links: [string, string][] = []
  const visited = new Set<string>()
  for (const bucket of byYear.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]!
        const b = bucket[j]!
        const key = pairKey(a, b)
        if (visited.has(key)) continue
        visited.add(key)
        // The link names the two components by their `key`, the lowest uri each holds, and names them
        // in a fixed order. Taking cluster[0] instead named them by union-find component order, and the
        // ARGUMENT order is what graph.link hands to union(), which keeps the first argument's root on
        // a rank tie (two fresh singletons, the common case) and appends the absorbed members after it.
        // So arrival order chose the link direction, the link direction fixed the merged component's
        // order, and that order chose which title the next pass sliced off: the loop this pass both
        // consumed and fed.
        if (await decide(a, b)) links.push(a.key < b.key ? [a.key, b.key] : [b.key, a.key])
      }
    }
  }

  // ...and the SEQUENCE of unions decides root survival just as much as their direction does, so the
  // links are applied in an order the bucket cannot influence either.
  links.sort(([leftA, leftB], [rightA, rightB]) => compareStrings(leftA, rightA) || compareStrings(leftB, rightB))

  let changed = false
  for (const [uriA, uriB] of links) {
    // Every verdict above was computed against a SNAPSHOT taken before the first await, and the pass
    // awaits the wasm matcher hundreds of times: extractor.ts flushes its DataLoader batch on a 50ms
    // timer throughout, and each flush can weld more medias into a component that has already been
    // judged. Applying a verdict about a small component to whatever that component has become is how
    // a Crunchyroll season 1 gets welded into a component that grew a season 2 while the pass ran, and
    // graph.link has no inverse. So the two components are read again as they stand NOW and put
    // through the same checks, with the link applied in the same turn as the check that allowed it.
    // This can only ever REFUSE a link the snapshot allowed - it is an AND with the original verdict,
    // never a replacement - and it costs one extra pass over the matched pairs only, which are few.
    // The check is free whenever nothing moved, because an unchanged component profiles to the same
    // cacheKey and the decision is already memoized.
    const clusterA = await findAggregatedMedia(uriA)
    const clusterB = await findAggregatedMedia(uriB)
    if (!clusterA.length || !clusterB.length) continue
    const a = profileCluster(clusterA)
    const b = profileCluster(clusterB)
    // already one component, so both profiles are the same component and there is nothing to link
    if (a.key === b.key) continue
    if (!await decide(a, b)) continue
    if (linkSameMediaPairs([[uriA, uriB]])) changed = true
  }

  return changed
}
