/**
 * The corpus adapter for TODAY's store, `src/worker/store`.
 *
 * It exists so the corpus is proven against the implementation its cases were extracted from: a case
 * that goes red here is a bad extraction, not a bad store. When the union-find store is replaced, this
 * file stays exactly as it is and a second adapter appears beside it, which is what makes the two
 * comparable at all.
 *
 * `resetStore` is deliberately not part of the store's public surface (a live reset would drop every
 * cluster mid-session), so it comes from ./db directly, the way
 * tests/unit/worker/store/merge-fixtures.test.ts takes it.
 */
import type { CorpusStore } from '../run'
import type { Episode, Media } from '../../../src/worker/store/types'
import {
  findAggregatedEpisodesForMedia, findAggregatedMedia, findAllAggregatedMedia, findPartOfMedia, findRunEpisodes,
  resetStore, upsertEpisodes, upsertMedia,
} from '../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../src/worker/store/fuzzy-merge'

/**
 * Which media each episode row was handed on, kept here rather than read back out of the graph.
 *
 * `episodePairsOf` needs the episode's own media to find the cluster its row is drawn in, and the
 * store exposes no episode lookup. The adapter was given the rows, so it remembers them; reaching
 * into `graph` for a field the case already carries would be reading the implementation to answer a
 * question about the implementation.
 */
let episodeMedia = new Map<string, string>()

export const currentStore: CorpusStore = {
  reset: async () => {
    resetStore()
    episodeMedia = new Map()
  },

  upsert: async (rows, claims, episodes) => {
    await upsertMedia(rows as unknown as Media[], claims)
    if (episodes?.length) await upsertEpisodes(episodes as unknown as Episode[], [])
    for (const episode of episodes ?? []) episodeMedia.set(episode.uri, episode.mediaUri)
    // The app runs the fuzzy pass on every page build and it is idempotent, so the settled state is
    // what it converges to rather than what one pass does. Five rounds is the bound
    // merge-fixtures.test.ts uses; it has never needed more than two.
    for (let round = 0; round < 5; round++) {
      if (!await fuzzyMergeMediaClusters(await findAllAggregatedMedia())) break
    }
  },

  clusters: async () => (await findAllAggregatedMedia()).map(cluster => cluster.map(media => media.uri)),

  episodesOf: async uri => {
    const cluster = await findAggregatedMedia(uri)
    const numbers = new Set<number>()
    for (const group of await findRunEpisodes(cluster)) {
      for (const episode of group) if (episode.episodeNumber != null) numbers.add(episode.episodeNumber)
    }
    return numbers.size
  },

  // `findPartOfMedia` is the whole of containment in this store: one directed PART_OF edge per pair,
  // with no range and no per-episode consequence. It already expands each target to its own cluster,
  // which is what the corpus asks for, and it drops a target that ended up inside the asking cluster,
  // so a run welded to its own container reports no container rather than reporting itself.
  containersOf: async uri => {
    const cluster = await findAggregatedMedia(uri)
    return cluster.length ? findPartOfMedia(cluster).map(media => media.uri) : []
  },

  /**
   * Always empty. THIS STORE HAS NO INCLUDES: nothing in `src/worker/store` records which of a
   * container's episodes a run is, so every ranged expectation is unanswerable here rather than
   * wrong. `consensus.ts` aligns a folded season's episode NUMBERS at read time to decide what a run
   * may draw, and throws the alignment away; no edge survives the call, so there is nothing to report
   * even rangeless. The cases that need it are marked `pending` until the store that holds one lands.
   */
  includesOf: async () => [],

  /**
   * The other rows this store would draw as one row, which is `findAggregatedEpisodesForMedia`'s
   * grouping inside the media cluster the episode hangs on.
   *
   * WHAT THAT COVERS, and it is less than the question: an explicit `EPISODE_SAME_AS` handle, which
   * no first-party source emits today (`db.ts:460`), and `mergeByEpisodeNumber`, which is keyed on the
   * NUMBER alone and is safe only because the input is one run cluster. So two rows pair here when
   * they carry the same number inside one cluster, and never otherwise: nothing pairs across a
   * container boundary, and a renumbering (Crunchyroll's 13..20 for a run's 1..8) pairs nothing at
   * all. Those are the cases marked `pending`.
   */
  episodePairsOf: async episodeUri => {
    const mediaUri = episodeMedia.get(episodeUri)
    if (!mediaUri) return []
    const cluster = await findAggregatedMedia(mediaUri)
    const uris = cluster.length ? cluster.map(media => media.uri) : [mediaUri]
    const groups = await findAggregatedEpisodesForMedia(uris)
    const group = groups.find(members => members.some(episode => episode.uri === episodeUri)) ?? []
    return group.map(episode => episode.uri).filter(uri => uri !== episodeUri)
  },
}
