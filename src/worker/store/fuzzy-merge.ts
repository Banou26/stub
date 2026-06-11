import type { Media } from './types'

import { titleSimilarity } from '../../sources/utils'
import { linkSameMediaPairs } from './db'

// Catches the same-show clusters that explicit source handles missed. Conservative on
// purpose — over-merging is the only dangerous failure mode: a pair must share a release
// year (no year on either side = no merge), must not conflict on MOVIE/SERIES, and a
// title pair must reach >=0.9 local-alignment similarity.
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
}

// titleSimilarity's normalization (lowercase, alphanumeric) plus article stripping, so
// "Beyond the Journey's End" and "Beyond Journey's End" compare equal
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

const profileCluster = (cluster: Media[]): ClusterProfile => ({
  cluster,
  key: cluster.map(media => media.uri).sort()[0]!,
  titles:
    [...new Set(
      cluster
        .flatMap(media => media.titles ?? [])
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map(({ title }) => normalizeTitle(title))
        .filter(Boolean)
    )].slice(0, MAX_TITLES_PER_CLUSTER),
  years:
    new Set(
      cluster
        .map(media => yearOf(media.startDate))
        .filter((year): year is number => year !== null)
    ),
  formats:
    new Set(
      cluster
        .flatMap(media =>
          // one-off specials straddle the movie/series boundary (Netflix lists them as
          // movies, anime sources as series) — keep them format-neutral
          media.type === 'SPECIAL' || media.type === 'OVA' || media.type === 'ONA' ? []
          : [
            ...media.categories ?? [],
            ...media.type === 'MOVIE' ? ['MOVIE' as const] : media.type === 'TV' ? ['SERIES' as const] : [],
          ]
        )
        .filter((category): category is Format => category === 'MOVIE' || category === 'SERIES')
    ),
})

// Exact upper bound on titleSimilarity (alignment score <= 2×common chars, normalized by
// 2×longer length) — skips the WASM alignment for pairs that can never reach the threshold
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

// normalized titles only contain [a-z0-9\s], so ',' cannot collide
const profileKey = (profile: ClusterProfile) =>
  `${profile.key}#${profile.titles.join(',')}#${[...profile.formats].sort().join(',')}`

const pairKey = (a: ClusterProfile, b: ClusterProfile) => {
  const keyA = profileKey(a)
  const keyB = profileKey(b)
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`
}

const pairDecisions = new Map<string, boolean>()

// Returns true if any new same_as links were created — the caller should re-read its clusters
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
