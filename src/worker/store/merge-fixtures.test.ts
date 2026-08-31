// Runs every case in ./merge-fixtures.ts through the real store and the real merge pass. See that
// file for what the cases are and why their answers are what they are.
//
// The failure messages matter as much as the assertions. A merge bug reads as "these two shows are
// one media", so a bare `expected true to be false` sends the next person back to work out which two
// and why. Every assertion here names the pair, the case, and the reason the case gives.
import { beforeEach, describe, expect, test } from 'vitest'

import type { Media } from './types'
import { MERGE_CASES, type FixtureMedia, type MergeCase } from './merge-fixtures'
import { findAggregatedMedia, resetStore, upsertMedia } from './db'
import { fuzzyMergeMediaClusters } from './fuzzy-merge'

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
    titles: fixture.titles.map(title => ({ language: 'en', title, score })),
  } as unknown as Media
}

const runCase = async (testCase: MergeCase) => {
  resetStore()
  await upsertMedia(
    testCase.medias.map(toStoreMedia),
    (testCase.handles ?? []).map(([mediaUri, handleUri]) => ({ mediaUri, handleUri }))
  )

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

      for (const [a, b] of testCase.apart ?? []) {
        if ((clusterOf.get(a) ?? []).includes(b)) {
          failures.push(`WELD: ${a} and ${b} are one cluster and must not be. Cluster is [${(clusterOf.get(a) ?? []).join(', ')}]`)
        }
      }

      if (failures.length) {
        throw new Error(
          `${failures.length} of ${(testCase.together ?? []).length + (testCase.apart ?? []).length} expectations failed\n\n` +
          `WHY THIS CASE IS RIGHT: ${testCase.why}\n\n` +
          `${[...new Set(failures)].join('\n')}`
        )
      }
      expect(failures).toEqual([])
    })
  }

  // The suite's own control. Every case above is written so that BOTH directions bite, and a case
  // carrying only one of them would silently be passed by an implementation that merges everything
  // or nothing. This fails the moment someone adds a case without deciding both.
  test('every case asserts both directions, so neither extreme can pass the suite', () => {
    const oneSided = MERGE_CASES
      .filter(testCase => testCase.medias.length > 3)
      .filter(testCase => !(testCase.together ?? []).length || !(testCase.apart ?? []).length)
      .map(testCase => testCase.name)

    expect(oneSided).toEqual([])
  })
})
