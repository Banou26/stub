import type { Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import type { Media, Episode } from './types'
import { getRoutePath, Route } from '../../router/path'
import { registerAggregatedId } from './db'

// ─── Shared utilities ────────────────────────────────────────────────────────

/** Sort array by score descending (highest first), nulls last */
function byScore<T extends { score?: number | null }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

export function removeDuplicatesByField<T extends Record<string, any>>(field: keyof T, array: T[]): T[] {
  const seen = new Set<string | number>()
  const result: T[] = []
  for (const item of array) {
    if (!seen.has(item[field])) {
      seen.add(item[field])
      result.push(item)
    }
  }
  return result
}

const unwrapMediaCache = new WeakMap<GQLMedia, GQLMedia[]>()
export function recursivelyUnwrapMediaHandles(media: GQLMedia): GQLMedia[] {
  if (unwrapMediaCache.has(media)) return unwrapMediaCache.get(media)!
  const result = media.handles
    ? [media, ...media.handles.flatMap(recursivelyUnwrapMediaHandles)]
    : [media]
  if (media.handles) unwrapMediaCache.set(media, result)
  return result
}

// ─── GQL conversion ─────────────────────────────────────────────────────────

function mediaToGQL(media: Media): GQLMedia {
  return {
    _id: media.uri,
    uri: media.uri,
    origin: media.origin,
    id: media.id,
    url: media.url,
    score: media.score,
    type: media.type,
    status: media.status,
    titles: media.titles ?? [],
    descriptions: media.descriptions ?? [],
    shortDescriptions: media.shortDescriptions ?? [],
    trailers: media.trailers ?? [],
    covers: media.covers ?? [],
    banners: media.banners ?? [],
    externalLinks: media.externalLinks,
    averageScore: media.averageScore,
    popularity: media.popularity,
    startDate: media.startDate,
    endDate: media.endDate,
    isAdult: media.isAdult,
    episodeCount: media.episodeCount,
    episodes: [],
    handles: [],
  }
}

function episodeToGQL(episode: Episode): GQLEpisode {
  return {
    _id: episode.uri,
    uri: episode.uri,
    origin: episode.origin,
    id: episode.id,
    url: episode.url,
    mediaUri: episode.mediaUri,
    score: episode.score,
    titles: episode.titles ?? [],
    descriptions: episode.descriptions ?? [],
    shortDescriptions: episode.shortDescriptions ?? [],
    thumbnails: episode.thumbnails ?? [],
    releaseDate: episode.releaseDate,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
    runtime: episode.runtime,
    handles: [],
  }
}

// ─── Aggregation helpers ─────────────────────────────────────────────────────

// Stable opaque UUID per cluster — cached by smallest URI (which is stable across cluster growth)
const clusterIdCache = new Map<string, string>()

function getStableClusterId(uris: string[]): string {
  const key = [...uris].sort()[0]!
  if (!clusterIdCache.has(key)) clusterIdCache.set(key, crypto.randomUUID())
  return clusterIdCache.get(key)!
}

function buildAggregatedIdentity(uris: string[]): { uri: string; id: string } {
  const sorted = [...uris].sort()
  return {
    uri: `ag:(${sorted.join(',')})`,
    id: `(${sorted.join(',')})`,
  }
}

// ─── Aggregate media cluster ─────────────────────────────────────────────────

export function aggregateMedia(medias: Media[], locationOrigin: string): GQLMedia {
  if (medias.length === 0) throw new Error('Cannot aggregate empty cluster')
  if (medias.length === 1) {
    const m = medias[0]!
    const _id = getStableClusterId([m.uri])
    registerAggregatedId(_id, m.uri)
    return {
      ...mediaToGQL(m),
      _id,
      handles: [mediaToGQL(m)],
    }
  }

  const sorted = [...medias].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const { uri, id } = buildAggregatedIdentity(medias.map(m => m.uri))
  const _id = getStableClusterId(medias.map(m => m.uri))
  registerAggregatedId(_id, medias[0]!.uri)

  const merged = sorted.reduce<Partial<GQLMedia>>((acc, media) => {
    const gql = mediaToGQL(media)
    return {
      ...gql,
      ...acc,
      // Scalars: keep first non-null value (highest-scored source wins, fallback to others)
      url: acc.url ?? gql.url,
      type: acc.type ?? gql.type,
      status: acc.status ?? gql.status,
      externalLinks: acc.externalLinks ?? gql.externalLinks,
      averageScore: acc.averageScore ?? gql.averageScore,
      popularity: acc.popularity ?? gql.popularity,
      startDate: acc.startDate ?? gql.startDate,
      endDate: acc.endDate ?? gql.endDate,
      isAdult: acc.isAdult ?? gql.isAdult,
      episodeCount: acc.episodeCount ?? gql.episodeCount,
      // Arrays: concatenate
      titles: [...(acc.titles ?? []), ...(media.titles ?? [])],
      descriptions: [...(acc.descriptions ?? []), ...(media.descriptions ?? [])],
      shortDescriptions: [...(acc.shortDescriptions ?? []), ...(media.shortDescriptions ?? [])],
      covers: [...(acc.covers ?? []), ...(media.covers ?? [])],
      banners: [...(acc.banners ?? []), ...(media.banners ?? [])],
      trailers: [...(acc.trailers ?? []), ...(media.trailers ?? [])],
    }
  }, {
    _id,
    uri,
    id,
    origin: 'ag',
    url: `${locationOrigin}/${getRoutePath(Route.MEDIA, { uri }).replace(/^\//, '')}`,
    score: Math.max(...medias.map(m => m.score ?? 0)),
    handles: sorted.map(m => mediaToGQL(m)),
    episodes: [],
  })

  return {
    ...merged as GQLMedia,
    titles: removeDuplicatesByField('title', byScore(merged.titles ?? [])),
    descriptions: byScore(merged.descriptions ?? []),
    shortDescriptions: byScore(merged.shortDescriptions ?? []),
    covers: byScore(merged.covers ?? []),
    banners: byScore(merged.banners ?? []),
    trailers: removeDuplicatesByField('uri', byScore(merged.trailers ?? [])),
  }
}

// ─── Aggregate episode cluster ───────────────────────────────────────────────

export function aggregateEpisode(episodes: Episode[], locationOrigin: string): GQLEpisode {
  if (episodes.length === 0) throw new Error('Cannot aggregate empty cluster')
  if (episodes.length === 1) {
    const e = episodes[0]!
    return {
      ...episodeToGQL(e),
      _id: getStableClusterId([e.uri]),
      handles: [episodeToGQL(e)],
    }
  }

  const sorted = [...episodes].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const { uri, id } = buildAggregatedIdentity(episodes.map(e => e.uri))
  const _id = getStableClusterId(episodes.map(e => e.uri))

  const merged = sorted.reduce<Partial<GQLEpisode>>((acc, episode) => {
    const gql = episodeToGQL(episode)
    return {
      ...gql,
      ...acc,
      url: acc.url ?? gql.url,
      releaseDate: acc.releaseDate ?? gql.releaseDate,
      seasonNumber: acc.seasonNumber ?? gql.seasonNumber,
      episodeNumber: acc.episodeNumber ?? gql.episodeNumber,
      absoluteEpisodeNumber: acc.absoluteEpisodeNumber ?? gql.absoluteEpisodeNumber,
      runtime: acc.runtime ?? gql.runtime,
      titles: [...(acc.titles ?? []), ...(episode.titles ?? [])],
      descriptions: [...(acc.descriptions ?? []), ...(episode.descriptions ?? [])],
      shortDescriptions: [...(acc.shortDescriptions ?? []), ...(episode.shortDescriptions ?? [])],
      thumbnails: [...(acc.thumbnails ?? []), ...(episode.thumbnails ?? [])],
    }
  }, {
    _id,
    uri,
    id,
    origin: 'ag',
    url: `${locationOrigin}/${getRoutePath(Route.MEDIA, { uri }).replace(/^\//, '')}`,
    mediaUri: uri,
    score: Math.max(...episodes.map(e => e.score ?? 0)),
    handles: sorted.map(e => episodeToGQL(e)),
  })

  return {
    ...merged as GQLEpisode,
    titles: removeDuplicatesByField('title', byScore(merged.titles ?? [])),
    descriptions: byScore(merged.descriptions ?? []),
    shortDescriptions: byScore(merged.shortDescriptions ?? []),
    thumbnails: byScore(merged.thumbnails ?? []),
  }
}
