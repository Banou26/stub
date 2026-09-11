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
  findAggregatedMedia, findAllAggregatedMedia, findRunEpisodes, resetStore, upsertEpisodes, upsertMedia,
} from '../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../src/worker/store/fuzzy-merge'

export const currentStore: CorpusStore = {
  reset: async () => { resetStore() },

  upsert: async (rows, claims, episodes) => {
    await upsertMedia(rows as unknown as Media[], claims)
    if (episodes?.length) await upsertEpisodes(episodes as unknown as Episode[], [])
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
}
