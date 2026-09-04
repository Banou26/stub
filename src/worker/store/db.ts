import type { Media, Episode, Origin, HandleRelation } from './types'
import { createGraph, lastWriteLongestArray } from './graph'
import { emit } from './events'
import { scopeOfUri } from '../../sources/id-scope'

const MEDIA_SAME_AS = 'media:same_as'

/**
 * Whether a uri names something that HOLDS several runs, rather than being one.
 *
 * A handle is an identity claim: linking it says "this media and that one are the same thing". An id
 * that names a show makes that claim on behalf of every season at once, which is what merged Mushoku
 * Tensei's three seasons even after JustWatch, TMDB and TVmaze each stopped doing it.
 *
 * THIS USED TO BE AN ORIGIN-LEVEL SET, `SHOW_LEVEL_ORIGINS = new Set(['imdb'])`. An origin is the
 * wrong grain: `cr:G24H1N3MP` is a Crunchyroll SERIES and `cr:G24H1N3MP-GS00374452` is one season of
 * it, and no predicate over `cr` can answer differently for the two. The source that owns the origin
 * answers instead, in sources/id-scope.ts, and every origin nobody has surveyed answers UNKNOWN,
 * which behaves exactly as this store did before the question was asked.
 *
 * The stored row is passed as evidence because one origin genuinely needs it: a bare `nf:<digits>` is
 * one film or a whole series depending on nothing but Netflix's `vtype`, which reaches here as
 * `categories`. `graph.get` on a uri with no row returns undefined, which is fine and expected: a
 * union-find member need never have been `set`.
 */
const namesAContainer = (uri: string) =>
  scopeOfUri(uri, graph.get(uri) as { categories?: readonly string[] } | undefined) === 'CONTAINER'

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
    // an id that cannot name a run is demoted, never trusted, whatever the producer asked for. Both
    // ends are asked because SAME_AS is symmetric: a run claiming to be a container welds exactly as
    // hard as a container claiming to be a run, and the edge then points from the run to the thing
    // holding it whichever side that turned out to be.
    const claimed = relation ?? 'SAME_AS'
    const handleIsContainer = namesAContainer(handleUri)
    const mediaIsContainer = !handleIsContainer && namesAContainer(mediaUri)
    if (claimed === 'SAME_AS' && !handleIsContainer && !mediaIsContainer) {
      if (graph.link(mediaUri, handleUri, MEDIA_SAME_AS)) changed = true
    } else if (mediaIsContainer) {
      if (graph.edge(handleUri, mediaUri, MEDIA_PART_OF)) changed = true
    } else {
      if (graph.edge(mediaUri, handleUri, MEDIA_PART_OF)) changed = true
    }
  }

  if (changed) emit('media:changed', {})
}

/**
 * Union two media that no handle connects, which is what a fuzzy title merge decides.
 *
 * IT GOES THROUGH THE SAME REFUSAL `upsertMedia` DOES, and did not until 2026-09-05. Every guard the
 * handle refactor added lives in `upsertMedia`'s loop, so this path, whose only caller is
 * `fuzzyMergeMediaClusters`, was a raw `graph.link` with no relation, no demotion and no check: a
 * show-level origin that could never be minted as SAME_AS by any source could still be welded here by
 * a title match.
 *
 * There is no PART_OF fallback to demote to, because there is no handle and nothing asserted a
 * containment. This path had a TITLE and guessed sameness from it; a title guess is no more evidence
 * of containment than it was of identity, so a pair naming a container is simply refused.
 *
 * REFUSING IS WHAT KILLS THE MUSHOKU SEED, and the seed is on this path rather than the handle one.
 * Searching the show puts the bare `cr:G24H1N3MP` and the bare `nf:80987039` in season 1's cluster
 * with no media page ever opened, and both search rows are minted handle-less, so nothing but this
 * function can have linked them (scripts/reproduce-season-weld.mjs, ARM A).
 *
 * The population it touches was measured on the deployed build over 16 searches and 123 clusters
 * (scripts/measure-container-merge-cost.mjs): 23 clusters held a bare show-level id merged with
 * another origin, and 1 of those was already carrying two disagreeing ids of one origin. The other 22
 * are the price, and they are not all loss: a cour whose cluster holds the SHOW welds the moment a
 * second cour of it appears, which is exactly what ARM B of the reproduction does.
 *
 * WHAT IS NOT ESTABLISHED, said plainly because two runs of that script disagreed about it. Each of
 * these sources has a precise matcher of its own (crunchyroll on title AND air date inside 45 days,
 * unogs on a resolved season number), so the identity may well arrive on the media path anyway and
 * cost only a merged card in a search list. The first run said it always does and the second said it
 * never does; the first matched a season-scoped id anywhere on the page instead of in the cluster
 * under test, and the second read the page at 11 seconds when `searchAndLinkMedia` alone waits 30.
 * The script now carries a control that must SEE a recovery before a count of none is believable.
 */
export function linkSameMediaPairs(pairs: [string, string][]): boolean {
  let changed = false
  for (const [uriA, uriB] of pairs) {
    if (namesAContainer(uriA) || namesAContainer(uriB)) continue
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
