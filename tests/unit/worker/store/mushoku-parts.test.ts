// One season's two PARTS must stay two media. Real titles and real air dates, because the fuzzy pass
// buckets by year and the two parts of Mushoku Tensei season 1 both aired in 2021, which is the only
// bucket where a same-season pair can even meet.
//
// This passes today and is here as a guard rather than as a fix: it was written while chasing a report
// of season 1 and season 2 listing 24 episodes, part 1 plus part 2, and it is the shape that report
// would take in the store. Every reproduction attempt came back correct (11/12/12/12, cold and warm
// store, with and against the plugin, on dev and on the live site), so what welds is still unknown and
// this is where a fix would land when it is.
import { beforeEach, expect, test } from 'vitest'

import { findAggregatedMedia, resetStore, upsertMedia } from '../../../../src/worker/store/db'
import { fuzzyMergeMediaClusters } from '../../../../src/worker/store/fuzzy-merge'

const media = (uri: string, title: string, startDate: string, episodeCount: number) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  startDate,
  episodeCount,
  titles: [{ language: 'en', title, score: 0.8 }],
  scope: 'RUN',
}) as any

const RUNS = {
  s1p1: [
    media('anilist:108465', 'Mushoku Tensei: Jobless Reincarnation', '2021-01-10', 11),
    media('kitsu:42323', 'Mushoku Tensei: Isekai Ittara Honki Dasu', '2021-01-10', 11),
  ],
  s1p2: [
    media('anilist:127720', 'Mushoku Tensei: Jobless Reincarnation Cour 2', '2021-10-03', 12),
    media('kitsu:43907', 'Mushoku Tensei: Isekai Ittara Honki Dasu Part 2', '2021-10-03', 12),
  ],
  s2p1: [
    media('anilist:146065', 'Mushoku Tensei: Jobless Reincarnation Season 2', '2023-07-09', 12),
    media('kitsu:45950', 'Mushoku Tensei: Isekai Ittara Honki Dasu Season 2', '2023-07-09', 12),
  ],
  s2p2: [
    media('anilist:166873', 'Mushoku Tensei: Jobless Reincarnation Season 2 Part 2', '2024-04-07', 12),
    media('kitsu:47694', 'Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2', '2024-04-07', 12),
  ],
}

beforeEach(() => { resetStore() })

const runPass = async (...names: (keyof typeof RUNS)[]) => {
  const clusters = names.map(name => RUNS[name])
  // each run arrives as a real cluster: its members claim each other, the way two sources agreeing do
  for (const cluster of clusters) {
    await upsertMedia(cluster, cluster.slice(1).map(member => ({ mediaUri: cluster[0]!.uri, handleUri: member.uri })))
  }
  await fuzzyMergeMediaClusters(clusters)
  return Object.fromEntries(await Promise.all(names.map(async name =>
    [name, (await findAggregatedMedia(RUNS[name][0]!.uri)).map(m => m.uri).sort()] as const)))
}

test('season one keeps its two parts apart', async () => {
  const after = await runPass('s1p1', 's1p2')
  console.log('S1:', JSON.stringify(after, null, 1))
  expect(after.s1p1).toEqual(['anilist:108465', 'kitsu:42323'])
  expect(after.s1p2).toEqual(['anilist:127720', 'kitsu:43907'])
})

test('and so does season two', async () => {
  const after = await runPass('s2p1', 's2p2')
  console.log('S2:', JSON.stringify(after, null, 1))
  expect(after.s2p1).toEqual(['anilist:146065', 'kitsu:45950'])
  expect(after.s2p2).toEqual(['anilist:166873', 'kitsu:47694'])
})

test('and all four together', async () => {
  const after = await runPass('s1p1', 's1p2', 's2p1', 's2p2')
  console.log('ALL:', JSON.stringify(after, null, 1))
  for (const [name, uris] of Object.entries(after)) expect(uris, name).toHaveLength(2)
})
