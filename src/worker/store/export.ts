import type { Episode, Media } from './types'

import { ASSERTED_LABELS, graph, HAS_EPISODE_LABEL } from './db'

export type ExportedCluster = { members: Media[], partOf: Media[], episodes: Episode[] }
export type StoreExport = { exportedAt: string, excludedOrigins: string[], clusters: ExportedCluster[] }
export type ExportOptions = { excludeOrigins: string[], passThroughOrigins?: string[], uris?: string[] }

const originOf = (uri: string) => uri.slice(0, uri.indexOf(':'))
const byUri = (a: { uri: string }, b: { uri: string }) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0

/**
 * Every run-space cluster the store holds, built from ASSERTED sameness only.
 *
 * Promises: it reads, and never writes. It walks only pairs a source claimed through a handle
 * (`ASSERTED_LABELS` in ./db.ts), never a union the fuzzy pass made. It emits nothing whose published
 * members are all CONTAINER: a show with no run is not a run. Output is sorted throughout, so two
 * calls against one store are byte-identical.
 *
 * TWO KINDS OF REFUSAL, and they were one until a measurement separated them (2026-09-05).
 * `excludeOrigins` is for an origin whose word is not trusted, a plugin: it is not walked THROUGH, so
 * a bridge only it supplied splits rather than surviving. `passThroughOrigins` is for one that is
 * trusted to bridge but must not be published, the bundled offline row: it is walked through and then
 * left out of the output. Spelling the second as the first cost a walk its identity, because that row
 * is the hub carrying the handles that bridge mal, anilist and kitsu, which do not assert one another;
 * cutting it left singletons, and asking for a run by its `offline:` uri answered nothing at all.
 *
 * Refuses nothing else: a component of one is a cluster, and a caller that excludes no origin gets
 * the plugin rows too. Excluding them is `osraResolvers.exportStore`'s job, not this one's.
 */
export const exportStore = async ({ excludeOrigins, passThroughOrigins, uris }: ExportOptions): Promise<StoreExport> => {
  const excluded = new Set(excludeOrigins)
  const passThrough = new Set(passThroughOrigins ?? [])
  const medias = graph.labeled('media')
  const episodeRows = graph.labeled('episode')
  const usableMedia = (uri: string) => medias.has(uri) && !excluded.has(originOf(uri))
  const published = (uri: string) => !passThrough.has(originOf(uri))

  const seen = new Set<string>()
  // `walked` is every member the traversal reached, `members` only the ones published: the first is
  // what a `uris` filter matches on, so asking by a pass-through uri still answers
  const clusters: (ExportedCluster & { walked: string[] })[] = []

  for (const seed of [...medias].sort()) {
    if (seen.has(seed) || !usableMedia(seed)) continue
    seen.add(seed)

    const members: Media[] = []
    const queue = [seed]
    while (queue.length) {
      const uri = queue.shift()!
      const row = graph.get(uri) as Media | undefined
      if (row) members.push(row)
      for (const next of graph.neighbours(uri, ASSERTED_LABELS.RUN)) {
        if (seen.has(next) || !usableMedia(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    const walked = members.map(member => member.uri)
    const publishedMembers = members.filter(member => published(member.uri))
    if (!publishedMembers.some(member => member.scope !== 'CONTAINER')) continue

    const partOf: Media[] = []
    const partSeen = new Set<string>()
    for (const member of members) {
      for (const target of graph.targets(member.uri, ASSERTED_LABELS.PART_OF)) {
        const containerQueue = [target]
        while (containerQueue.length) {
          const uri = containerQueue.shift()!
          if (partSeen.has(uri) || !usableMedia(uri)) continue
          partSeen.add(uri)
          const row = graph.get(uri) as Media | undefined
          if (row && published(uri)) partOf.push(row)
          for (const next of graph.neighbours(uri, ASSERTED_LABELS.CONTAINER)) containerQueue.push(next)
        }
      }
    }

    const episodes: Episode[] = []
    const episodeSeen = new Set<string>()
    for (const member of members) {
      for (const episodeUri of graph.targets(member.uri, HAS_EPISODE_LABEL)) {
        if (episodeSeen.has(episodeUri) || !episodeRows.has(episodeUri)) continue
        if (excluded.has(originOf(episodeUri)) || !published(episodeUri)) continue
        episodeSeen.add(episodeUri)
        const row = graph.get(episodeUri) as Episode | undefined
        if (row) episodes.push(row)
      }
    }

    clusters.push({
      walked,
      members: publishedMembers.sort(byUri),
      partOf: partOf.sort(byUri),
      episodes: episodes.sort(byUri),
    })
  }

  const wanted = uris && new Set(uris)
  return {
    exportedAt: new Date().toISOString(),
    excludedOrigins: [...excluded].sort(),
    clusters:
      (wanted ? clusters.filter(cluster => cluster.walked.some(uri => wanted.has(uri))) : clusters)
        .sort((a, b) => byUri(a.members[0]!, b.members[0]!))
        .map(({ walked: _walked, ...cluster }) => cluster),
  }
}
