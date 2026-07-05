import type { Media } from './types'

import { titleSimilarity } from '../../sources/utils'
import { linkSameMediaPairs } from './db'

// conservative on purpose: merge needs shared year + non-conflicting format + >=0.9 title similarity
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
  cacheKey: string
}

// titleSimilarity's normalization plus article stripping, so "Beyond the Journey's End" == "Beyond Journey's End"
const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

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
        .filter(Boolean)
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
  return {
    cluster,
    key,
    titles,
    years,
    formats,
    // normalized titles only contain [a-z0-9\s], so ',' cannot collide
    cacheKey: `${key}#${titles.join(',')}#${[...formats].sort().join(',')}`,
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

// Year equality is guaranteed by the caller's bucketing
const sameShow = async (a: ClusterProfile, b: ClusterProfile) => {
  if (a.formats.size && b.formats.size && ![...a.formats].some(format => b.formats.has(format))) return false
  for (const titleA of a.titles) {
    for (const titleB of b.titles) {
      if (titleA === titleB) return true
      if (maxPossibleSimilarity(titleA, titleB) < SIMILARITY_THRESHOLD) continue
      if (await titleSimilarity(titleA, titleB) >= SIMILARITY_THRESHOLD) return true
    }
  }
  return false
}

const pairKey = (a: ClusterProfile, b: ClusterProfile) =>
  a.cacheKey < b.cacheKey ? `${a.cacheKey}|${b.cacheKey}` : `${b.cacheKey}|${a.cacheKey}`

const pairDecisions = new Map<string, boolean>()

// Returns true if any new same_as links were created - the caller should re-read its clusters
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
