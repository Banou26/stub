import type { Media } from './types'

import { stripTitle, titleSimilarity } from '../../sources/utils'
import { parseSeasonNumber } from '../../sources/season'
import { linkSameMediaPairs } from './db'

const SIMILARITY_THRESHOLD = 0.9
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

const yearOf = (date: string | null) => {
  if (!date) return null
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear()
}

const profileCluster = (cluster: Media[]): ClusterProfile => {
  const key = cluster.map(media => media.uri).sort()[0]!
  const titles =
    [...new Set(
      cluster
        .flatMap(media => media.titles ?? [])
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map(({ title }) => normalizeTitle(title))
        .filter(title => HAS_LETTER.test(title))
    )].slice(0, MAX_TITLES_PER_CLUSTER)
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
    // joining titles with ',' is safe only because normalizeTitle keeps nothing but letters, numbers and single spaces, so no separator can survive inside a title: let punctuation through there and cache keys start colliding silently
    cacheKey: `${key}#${titles.join(',')}#${[...formats].sort().join(',')}#${[...seasons].sort().join(',')}`,
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
// score 0.929 and "onii-chan!" and "oniichan" score 0.833, so no threshold tells one from the other:
// alignment charges the same for a digit that is the whole identity as for a hyphen that is noise.
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
        let match = pairDecisions.get(key)
        if (match === undefined) {
          match = await sameShow(a, b)
          pairDecisions.set(key, match)
        }
        if (match) links.push([a.cluster[0]!.uri, b.cluster[0]!.uri])
      }
    }
  }

  return links.length ? linkSameMediaPairs(links) : false
}
