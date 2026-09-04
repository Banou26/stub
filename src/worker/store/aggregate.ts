import type { Media as GQLMedia, Episode as GQLEpisode, MediaCategory } from '../../generated/schema/types.generated'
import type { Media, Episode } from './types'
import { getRoutePath, Route } from '../../router/path'
import { findPartOfMedia, registerAggregatedId } from './db'
import { isRoutableUri } from '../../utils/uri'

// keep ANIME plus exactly ONE of MOVIE/SERIES (highest-scored source's format wins), so a merged media never lands in both the Movies and the Series listing
const reconcileCategories = (cats: MediaCategory[]): MediaCategory[] => {
  const out: MediaCategory[] = []
  if (cats.includes('ANIME')) out.push('ANIME')
  const format = cats.find(category => category === 'MOVIE' || category === 'SERIES')
  if (format) out.push(format)
  return out
}

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

/**
 * The two edge constructors this module needs.
 *
 * Local rather than imported from ../../sources/utils: that module reaches the whole source barrel,
 * and the store must not depend on it. The shape is three fields and duplicating it here is cheaper
 * than the import cycle.
 */
const sameAsHandle = (node: GQLMedia) => ({ node, relation: 'SAME_AS' as const })
const partOfHandle = (node: GQLMedia) => ({ node, relation: 'PART_OF' as const })
const sameAsEpisodeHandle = (node: GQLEpisode) => ({ node, relation: 'SAME_AS' as const })

/**
 * The uris a media claims to BE, out of its handle edges.
 *
 * Exported and used by `Media.episodes` rather than filtered inline there, because that resolver
 * cannot be imported under vitest (it reaches urql, which is CommonJS) and an untestable filter on the
 * most dangerous read in the tree is not good enough.
 *
 * WHY IT IS THE MOST DANGEROUS READ. `findAggregatedEpisodesForMedia` walks HAS_EPISODE for every uri
 * handed to it and `Media.episodes` groups the union by `episodeNumber` ALONE. A PART_OF node is a
 * SHOW, and `unogs/extractor.ts` hangs every season's episodes, each renumbered 1..n, off exactly that
 * kind of uri. Passing one in puts every run's episodes into this run's list and the row count becomes
 * the longest season: the 24-rows-on-a-14-episode-season defect, arriving by a new road.
 */
export const sameAsHandleUris = (handles: { relation: string, node: { uri: string } }[] | undefined | null): string[] =>
  (handles ?? []).filter(handle => handle.relation === 'SAME_AS').map(handle => handle.node.uri)

const unwrapMediaCache = new WeakMap<GQLMedia, GQLMedia[]>()

/**
 * Flatten a media and everything hanging off it into the rows the store should hold.
 *
 * EVERY node becomes a row, whatever it claims: this walk feeds `graph.set`, and a PART_OF node has to
 * be stored or its url can never be rendered. The relation decides how a node is LINKED, in
 * `upsertMedia`, not whether it is stored.
 *
 * THE WALK STOPS AT A PART_OF NODE, and that is the load bearing part. A PART_OF node is a CONTAINER,
 * usually a show, and its own handles are claims about the CONTAINER rather than about the run that
 * pointed at it. Carrying them through means two different runs, each hanging PART_OF off the same
 * show, each contribute a SAME_AS pair rooted at that show:
 *
 *     season 1 -PART_OF-> cr:SERIES -SAME_AS-> kitsu:42323
 *     season 3 -PART_OF-> cr:SERIES -SAME_AS-> kitsu:49002
 *
 * and `cr:SERIES` is one uri, so the union-find puts kitsu:42323 and kitsu:49002 in one cluster. Two
 * seasons welded, with no inverse, by a relation whose entire purpose is not to weld. The container's
 * row still arrives, so its url renders; only its claims are dropped, because nothing can reach them
 * anyway: `findPartOfMedia` returns the direct targets of a cluster and never walks their handles.
 *
 * The copy is what enforces it. Returning the node untouched would leave `handles` populated for the
 * pair loop in worker/extractor.ts to read, so the subtree has to be cut here rather than there.
 */
export function recursivelyUnwrapMediaHandles(media: GQLMedia): GQLMedia[] {
  if (unwrapMediaCache.has(media)) return unwrapMediaCache.get(media)!
  const result = media.handles
    ? [media, ...media.handles.flatMap(handle =>
      handle.relation === 'PART_OF'
        ? [{ ...handle.node, handles: [] }]
        : recursivelyUnwrapMediaHandles(handle.node))]
    : [media]
  if (media.handles) unwrapMediaCache.set(media, result)
  return result
}

function mediaToGQL(media: Media): GQLMedia {
  return {
    _id: media.uri,
    uri: media.uri,
    origin: media.origin,
    id: media.id,
    url: media.url,
    score: media.score,
    type: media.type,
    categories: media.categories ?? [],
    status: media.status,
    titles: media.titles ?? [],
    descriptions: media.descriptions ?? [],
    shortDescriptions: media.shortDescriptions ?? [],
    trailers: media.trailers ?? [],
    covers: media.covers ?? [],
    banners: media.banners ?? [],
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
    embedUrl: episode.embedUrl,
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

// keyed by the smallest uri, which is stable across cluster growth
const clusterIdCache = new Map<string, string>()

function getStableClusterId(uris: string[]): string {
  const key = [...uris].sort()[0]!
  if (!clusterIdCache.has(key)) clusterIdCache.set(key, crypto.randomUUID())
  return clusterIdCache.get(key)!
}

function buildAggregatedIdentity(uris: string[]): { uri: string; id: string } {
  // one handle carrying a ',' or a '/' would split the list or the route path, and the media's whole watch page becomes unreachable
  const routable = uris.filter(isRoutableUri)
  const sorted = [...(routable.length ? routable : uris)].sort()
  return {
    uri: `ag:(${sorted.join(',')})`,
    id: `(${sorted.join(',')})`,
  }
}

export function aggregateMedia(medias: Media[], locationOrigin: string): GQLMedia {
  if (medias.length === 0) throw new Error('Cannot aggregate empty cluster')
  if (medias.length === 1) {
    const m = medias[0]!
    const _id = getStableClusterId([m.uri])
    registerAggregatedId(_id, m.uri)
    return {
      ...mediaToGQL(m),
      _id,
      handles: [sameAsHandle(mediaToGQL(m)), ...findPartOfMedia(medias).map(node => partOfHandle(mediaToGQL(node)))],
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
      url: acc.url ?? gql.url,
      type: acc.type ?? gql.type,
      status: acc.status ?? gql.status,
      averageScore: acc.averageScore ?? gql.averageScore,
      popularity: acc.popularity ?? gql.popularity,
      startDate: acc.startDate ?? gql.startDate,
      endDate: acc.endDate ?? gql.endDate,
      isAdult: acc.isAdult ?? gql.isAdult,
      episodeCount: acc.episodeCount ?? gql.episodeCount,
      categories: [...(acc.categories ?? []), ...(gql.categories ?? [])],
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
    // The cluster IS the SAME_AS set, by construction: `graph.cluster` over MEDIA_SAME_AS is what
    // produced `medias`. The PART_OF rows are read here rather than by the caller, so that no caller
    // can forget them: a missing link renders as a dead grey icon, which looks like ordinary absence.
    handles: [
      ...sorted.map(m => sameAsHandle(mediaToGQL(m))),
      ...findPartOfMedia(medias).map(node => partOfHandle(mediaToGQL(node))),
    ],
    episodes: [],
  })

  return {
    ...merged as GQLMedia,
    categories: reconcileCategories(merged.categories ?? []),
    titles: removeDuplicatesByField('title', byScore(merged.titles ?? [])),
    descriptions: byScore(merged.descriptions ?? []),
    shortDescriptions: byScore(merged.shortDescriptions ?? []),
    covers: byScore(merged.covers ?? []),
    banners: byScore(merged.banners ?? []),
    trailers: removeDuplicatesByField('uri', merged.trailers ?? []),
  }
}

export function aggregateEpisode(episodes: Episode[], locationOrigin: string): GQLEpisode {
  if (episodes.length === 0) throw new Error('Cannot aggregate empty cluster')
  if (episodes.length === 1) {
    const e = episodes[0]!
    return {
      ...episodeToGQL(e),
      _id: getStableClusterId([e.uri]),
      handles: [sameAsEpisodeHandle(episodeToGQL(e))],
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
      embedUrl: acc.embedUrl ?? gql.embedUrl,
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
    handles: sorted.map(e => sameAsEpisodeHandle(episodeToGQL(e))),
  })

  return {
    ...merged as GQLEpisode,
    titles: removeDuplicatesByField('title', byScore(merged.titles ?? [])),
    descriptions: byScore(merged.descriptions ?? []),
    shortDescriptions: byScore(merged.shortDescriptions ?? []),
    thumbnails: byScore(merged.thumbnails ?? []),
  }
}
