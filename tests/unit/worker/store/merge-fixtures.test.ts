// Runs every case in ./merge-fixtures.ts through the real store and the real merge pass. See that
// file for what the cases are and why their answers are what they are.
//
// The failure messages matter as much as the assertions. A merge bug reads as "these two shows are
// one media", so a bare `expected true to be false` sends the next person back to work out which two
// and why. Every assertion here names the pair, the case, and the reason the case gives.
import { beforeEach, describe, expect, test } from 'vitest'

import type { Episode, Media } from '../../../../src/worker/store/types'
import { MERGE_CASES, type FixtureMedia, type MergeCase } from './merge-fixtures'
import {
  findAggregatedMedia, findRunEpisodes, resetStore, upsertEpisodes, upsertMedia,
} from '../../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../../src/worker/store/fuzzy-merge'
import { clusterAnomalies } from '../../../../src/worker/store/anomalies'

// Per-source score, because it decides which titles survive MAX_TITLES_PER_CLUSTER's slice and so
// which pairs the matcher ever compares. These are the real constants: anizip and jikan 0.9,
// anilist 0.8, kitsu 0.3.
const SCORE: Record<string, number> = { anizip: 0.9, jikan: 0.9, anilist: 0.8, kitsu: 0.3, mal: 0.9 }

const toStoreMedia = (fixture: FixtureMedia): Media => {
  const origin = fixture.uri.slice(0, fixture.uri.indexOf(':'))
  const score = SCORE[origin] ?? 0.5
  return {
    uri: fixture.uri,
    origin,
    id: fixture.uri.slice(fixture.uri.indexOf(':') + 1),
    type: 'TV',
    categories: ['ANIME', 'SERIES'],
    startDate: fixture.startDate,
    episodeCount: fixture.episodeCount ?? null,
    score,
    titles: fixture.titles.map(title => ({ language: 'en', title, score })),
  } as unknown as Media
}

/**
 * The episodes a source publishes, attached to the media that published them.
 *
 * Numbered per source and never linked across sources, which is what the real store holds: two
 * catalogues describing episode 1 of one run produce two rows, and it is `findAggregatedEpisodesForMedia`
 * that groups them. So a case asserting what a cluster LISTS is asserting that grouping, not the
 * fixture's own arithmetic.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000

const toStoreEpisodes = (fixture: FixtureMedia): Episode[] => {
  // Weekly from the run's own start, by POSITION in this source's list rather than by its number.
  // That is what makes two sources that number the same broadcast differently still share dates, which
  // is the only thing an alignment can be read off. A real anime is weekly and a real fixture would
  // carry the dates; this is the same shape with the arithmetic done here.
  const start = fixture.startDate ? Date.parse(fixture.startDate) : Number.NaN
  return (fixture.episodes ?? []).map((episodeNumber, index) => ({
    uri: `${fixture.uri}-e${episodeNumber}`,
    origin: fixture.uri.slice(0, fixture.uri.indexOf(':')),
    id: `${fixture.uri.slice(fixture.uri.indexOf(':') + 1)}-e${episodeNumber}`,
    mediaUri: fixture.uri,
    episodeNumber,
    releaseDate: Number.isFinite(start) ? new Date(start + index * WEEK).toISOString() : null,
    score: SCORE[fixture.uri.slice(0, fixture.uri.indexOf(':'))] ?? 0.5,
    titles: [],
  } as unknown as Episode))
}

const runCase = async (testCase: MergeCase) => {
  resetStore()
  await upsertMedia(
    testCase.medias.map(toStoreMedia),
    (testCase.handles ?? []).map(([mediaUri, handleUri]) => ({ mediaUri, handleUri }))
  )
  const episodes = testCase.medias.flatMap(toStoreEpisodes)
  if (episodes.length) await upsertEpisodes(episodes, [])

  // the app calls this on every page build, and it is idempotent, so running it until it stops
  // linking is what the app converges to rather than a single pass being what is under test
  for (let round = 0; round < 5; round++) {
    const clusters = await Promise.all(testCase.medias.map(({ uri }) => findAggregatedMedia(uri)))
    if (!(await fuzzyMergeMediaClusters(clusters))) break
  }

  const clusterOf = new Map<string, string[]>()
  for (const { uri } of testCase.medias) {
    clusterOf.set(uri, (await findAggregatedMedia(uri)).map(member => member.uri).sort())
  }
  return clusterOf
}

/** How many distinct episode numbers the cluster holding `uri` lists, the way the page renders them. */
const listedEpisodes = async (uri: string): Promise<number> => {
  const cluster = await findAggregatedMedia(uri)
  const groups = await findRunEpisodes(cluster)
  const numbers = new Set<number>()
  for (const group of groups) {
    for (const episode of group) if (episode.episodeNumber != null) numbers.add(episode.episodeNumber)
  }
  return numbers.size
}

describe('merge fixtures, hand-checked against real source payloads', () => {
  beforeEach(() => { resetStore() })

  for (const testCase of MERGE_CASES) {
    test(testCase.name, async () => {
      const clusterOf = await runCase(testCase)
      const failures: string[] = []

      for (const group of testCase.together ?? []) {
        const expected = [...group].sort()
        for (const uri of group) {
          const actual = clusterOf.get(uri) ?? []
          const missing = expected.filter(member => !actual.includes(member))
          if (missing.length) {
            failures.push(
              `SPLIT: ${uri} should share a cluster with ${missing.join(', ')} but its cluster is [${actual.join(', ')}]`
            )
          }
        }
      }

      for (const [uri, expected] of Object.entries(testCase.lists ?? {})) {
        const listed = await listedEpisodes(uri)
        if (listed !== expected) {
          failures.push(
            `LISTS ${listed} EPISODES, EXPECTED ${expected}: ${uri}'s cluster is ` +
            `[${(clusterOf.get(uri) ?? []).join(', ')}]. A cluster can hold the right members and ` +
            `still list somebody else's episodes.`
          )
        }
      }

      for (const [a, b] of testCase.apart ?? []) {
        if ((clusterOf.get(a) ?? []).includes(b)) {
          failures.push(`WELD: ${a} and ${b} are one cluster and must not be. Cluster is [${(clusterOf.get(a) ?? []).join(', ')}]`)
        }
      }

      if (failures.length) {
        throw new Error(
          `${failures.length} of ${(testCase.together ?? []).length + (testCase.apart ?? []).length + Object.keys(testCase.lists ?? {}).length} expectations failed\n\n` +
          `WHY THIS CASE IS RIGHT: ${testCase.why}\n\n` +
          `${[...new Set(failures)].join('\n')}`
        )
      }
      expect(failures).toEqual([])
    })
  }

  /**
   * THE SWEEP, and the reason it is separate from every case above.
   *
   * Each case decides one answer by hand, which pins what somebody already looked at. These rules
   * need no expected answer: they are contradictions a cluster makes about ITSELF, so they run over
   * every cluster the whole corpus produces, and a case added for one reason is checked for all of
   * them. See store/anomalies.ts.
   */
  for (const testCase of MERGE_CASES) {
    test(`no cluster contradicts itself: ${testCase.name}`, async () => {
      await runCase(testCase)
      const found: string[] = []
      const seen = new Set<string>()
      for (const { uri } of testCase.medias) {
        const cluster = await findAggregatedMedia(uri)
        const key = cluster.map(member => member.uri).sort().join(',')
        if (!key || seen.has(key)) continue
        seen.add(key)
        for (const anomaly of clusterAnomalies(cluster, await listedEpisodes(uri))) {
          found.push(`[${anomaly.rule}] ${key}: ${anomaly.detail}`)
        }
      }
      expect(found, `WHY THIS CASE IS RIGHT: ${testCase.why}`).toEqual([])
    })
  }

  // The suite's own control. Every case above is written so that BOTH directions bite, and a case
  // carrying only one of them would silently be passed by an implementation that merges everything
  // or nothing. This fails the moment someone adds a case without deciding both.
  //
  // `lists` counts as the refusing direction: an implementation that merged everything would hand a
  // run every episode in its franchise and fail it, exactly as `apart` would.
  test('every case asserts both directions, so neither extreme can pass the suite', () => {
    const oneSided = MERGE_CASES
      .filter(testCase => testCase.medias.length > 3)
      .filter(testCase =>
        !(testCase.together ?? []).length
        || !((testCase.apart ?? []).length || Object.keys(testCase.lists ?? {}).length))
      .map(testCase => testCase.name)

    expect(oneSided).toEqual([])
  })
})
