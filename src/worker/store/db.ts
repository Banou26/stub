import type { Media, Episode, Origin } from './types'
import { createGraph, lastWriteLongestArray } from './graph'
import { emit } from './events'

// ─── Edge labels ────────────────────────────────────────────────────────────

const MEDIA_SAME_AS = 'media:same_as'
const EPISODE_SAME_AS = 'episode:same_as'
const HAS_EPISODE = 'has_episode'

// ─── Stores ─────────────────────────────────────────────────────────────────

export const graph = createGraph<Media | Episode>()
const originMap = new Map<string, Origin>()

graph.registerLabel('media', { merge: lastWriteLongestArray })
graph.registerLabel('episode', { merge: lastWriteLongestArray })

// ─── Media ──────────────────────────────────────────────────────────────────

export async function upsertMedia(
  newMedias: Media[],
  handles: { mediaUri: string; handleUri: string }[]
) {
  let changed = false

  for (const media of newMedias) {
    const isNew = !graph.has(media.uri)
    graph.set(media.uri, media, { addLabels: ['media'] })
    if (isNew) changed = true
  }

  for (const { mediaUri, handleUri } of handles) {
    if (graph.link(mediaUri, handleUri, MEDIA_SAME_AS)) changed = true
  }

  if (changed) emit('media:changed', {})
}

export function linkSameMediaPairs(pairs: [string, string][]): boolean {
  let changed = false
  for (const [uriA, uriB] of pairs) {
    if (graph.link(uriA, uriB, MEDIA_SAME_AS)) changed = true
  }
  if (changed) emit('media:changed', {})
  return changed
}

export async function findAggregatedMedia(uri: string): Promise<Media[]> {
  const resolved = graph.resolve(uri)
  if (!graph.has(resolved)) return []
  return graph.cluster(resolved, MEDIA_SAME_AS) as Media[]
}

export function registerAggregatedId(id: string, uri: string) {
  graph.alias(id, uri)
}

export async function findMediaByAggregatedId(aggregatedId: string): Promise<Media[]> {
  return findAggregatedMedia(aggregatedId)
}

export async function findAllAggregatedMedia(uris?: string[]): Promise<Media[][]> {
  return graph.clusters(MEDIA_SAME_AS, uris ? undefined : 'media', uris) as Media[][]
}

// ─── Episodes ───────────────────────────────────────────────────────────────

export async function upsertEpisodes(
  newEpisodes: Episode[],
  handles: { episodeUri: string; handleUri: string }[]
) {
  for (const episode of newEpisodes) {
    graph.set(episode.uri, episode, { addLabels: ['episode'] })
    graph.edge(episode.mediaUri, episode.uri, HAS_EPISODE)
  }

  for (const { episodeUri, handleUri } of handles) {
    graph.link(episodeUri, handleUri, EPISODE_SAME_AS)
  }

  emit('episode:changed', {})
}

export async function findAggregatedEpisodesForMedia(mediaUris: string[]): Promise<Episode[][]> {
  const seen = new Set<string>()
  const allEpisodes: Episode[] = []
  for (const mediaUri of mediaUris) {
    for (const epUri of graph.targets(mediaUri, HAS_EPISODE)) {
      if (!seen.has(epUri)) {
        seen.add(epUri)
        const ep = graph.get(epUri) as Episode | undefined
        if (ep) allEpisodes.push(ep)
      }
    }
  }

  const visited = new Set<string>()
  const groups: Episode[][] = []
  for (const ep of allEpisodes) {
    if (visited.has(ep.uri)) continue
    const cluster = graph.cluster(ep.uri, EPISODE_SAME_AS) as Episode[]
    for (const e of cluster) visited.add(e.uri)
    groups.push(cluster)
  }

  return groups
}

// ─── Origins ────────────────────────────────────────────────────────────────

export async function upsertOrigins(newOrigins: Origin[]) {
  for (const origin of newOrigins) {
    const existing = originMap.get(origin.id)
    originMap.set(origin.id, existing ? lastWriteLongestArray(origin, existing) : origin)
  }
  emit('origin:changed', {})
}

export async function findOrigin(id: string): Promise<Origin | null> {
  return originMap.get(id) ?? null
}

export async function findOrigins(
  ids: string[],
  filters?: ('IS_API_ONLY' | 'IS_NOT_API_ONLY')[]
): Promise<Origin[]> {
  let result: Origin[]

  if (ids.length > 0) {
    result = ids.map(id => originMap.get(id)).filter((o): o is Origin => o != null)
  } else {
    result = [...originMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  if (filters?.length) {
    result = result.filter(o =>
      filters.every(f => f === 'IS_API_ONLY' ? o.isApiOnly : !o.isApiOnly)
    )
  }

  return result
}
