import type { Media, Episode, Origin, HandleRelation } from './types'
import { createGraph, lastWriteLongestArray } from './graph'
import { emit } from './events'

const MEDIA_SAME_AS = 'media:same_as'

// Origins whose id names a SHOW and has no season-level equivalent to name instead.
//
// A handle is an identity claim: linking it says "this media and that one are the same thing". An
// IMDb `tt` id is the series, so every season of a show carries the same one and the claim is that
// they are all one media - which is what merged Mushoku Tensei's three seasons even after JustWatch,
// TMDB and TVmaze each stopped doing it, because five separate sources (tvmaze, trakt, simkl, omdb,
// watchmode) all emit it.
//
// TMDB and TVmaze could be scoped because both model seasons; IMDb does not, so there is no honest
// season id to mint and scoping would invent one that no source could independently reproduce.
//
// THAT WAY NOW EXISTS, so this no longer drops the handle: a SAME_AS for one of these origins is
// DEMOTED to PART_OF, which carries its url without asserting sameness. The comment that used to end
// here read "Until there is a way to attach a handle for its LINK without asserting identity, it is
// not linked at all. The cost is the IMDb link disappearing from the aggregated media." That cost is
// paid back by this line.
//
// It stays as a backstop rather than being deleted with the producers migrated: it is one Set lookup,
// and it means a source that starts emitting a bare imdb id again is corrected here instead of
// welding every season of a show.
const SHOW_LEVEL_ORIGINS = new Set(['imdb'])

const originOf = (uri: string) => uri.slice(0, uri.indexOf(':'))
const EPISODE_SAME_AS = 'episode:same_as'
const EPISODE_PART_OF = 'episode:part_of'
const HAS_EPISODE = 'has_episode'

/**
 * PART_OF rides a DIRECTED edge, which unions nothing.
 *
 * `graph.link` maintains a union-find per label, so two labels would give two separate clusters, and a
 * PART_OF cluster is a thing nobody wants: it would merge every run of a show with every other run
 * that pointed at the same container. `graph.edge` is the primitive that already exists for exactly
 * this and is what HAS_EPISODE uses.
 */
const MEDIA_PART_OF = 'media:part_of'

export const graph = createGraph<Media | Episode>()
const originMap = new Map<string, Origin>()

graph.registerLabel('media', { merge: lastWriteLongestArray })
graph.registerLabel('episode', { merge: lastWriteLongestArray })

export async function upsertMedia(
  newMedias: Media[],
  handles: { mediaUri: string; handleUri: string; relation?: HandleRelation }[]
) {
  let changed = false

  for (const media of newMedias) {
    const isNew = !graph.has(media.uri)
    graph.set(media.uri, media, { addLabels: ['media'] })
    if (isNew) changed = true
  }

  for (const { mediaUri, handleUri, relation } of handles) {
    // an origin that cannot name a run is demoted, never trusted, whatever the producer asked for
    const claimed = relation ?? 'SAME_AS'
    const effective = SHOW_LEVEL_ORIGINS.has(originOf(handleUri)) ? 'PART_OF' : claimed
    if (effective === 'SAME_AS') {
      if (graph.link(mediaUri, handleUri, MEDIA_SAME_AS)) changed = true
    } else {
      graph.edge(mediaUri, handleUri, MEDIA_PART_OF)
      changed = true
    }
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

/**
 * Every row a cluster points at but does not claim to be, deduped by uri.
 *
 * Read from the DIRECTED PART_OF edges of every cluster member, because the aggregated media is the
 * cluster and any of its members may hold one. A node with no stored row is skipped: `graph.edge`
 * accepts a uri that was never `set`, exactly as `graph.link` does.
 */
export function findPartOfMedia(cluster: Media[]): Media[] {
  const seen = new Set<string>()
  const out: Media[] = []
  for (const member of cluster) {
    for (const targetUri of graph.targets(member.uri, MEDIA_PART_OF)) {
      if (seen.has(targetUri)) continue
      seen.add(targetUri)
      const node = graph.get(targetUri) as Media | undefined
      if (node) out.push(node)
    }
  }
  return out
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

export async function upsertEpisodes(
  newEpisodes: Episode[],
  handles: { episodeUri: string; handleUri: string; relation?: HandleRelation }[]
) {
  for (const episode of newEpisodes) {
    graph.set(episode.uri, episode, { addLabels: ['episode'] })
    graph.edge(episode.mediaUri, episode.uri, HAS_EPISODE)
  }

  for (const { episodeUri, handleUri, relation } of handles) {
    if ((relation ?? 'SAME_AS') === 'SAME_AS') graph.link(episodeUri, handleUri, EPISODE_SAME_AS)
    else graph.edge(episodeUri, handleUri, EPISODE_PART_OF)
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

/**
 * Empty the store. TESTS ONLY, and it exists for one kind of test.
 *
 * The store is a module singleton, so every test in a run shares it. The suites that predate this
 * dodged that by inventing ids no other test uses (`anilist:2460`, `anilist:601`), which works right
 * up until the fixtures carry REAL ids: `merge-fixtures.test.ts` asserts on kitsu:49002 and
 * anilist:178789 as they really are, and the same show legitimately appears in several cases. Without
 * a reset the second case inherits the first case's welds and passes or fails for reasons that are
 * not in it.
 *
 * Not exported through ./index.ts, and never called by the app: a live reset would drop every cluster
 * mid-session with no way to rebuild them short of re-asking every source.
 */
export function resetStore() {
  graph.clear()
  originMap.clear()
}

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
