import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

export const test = async () => {
  const { upsertMedia, findAggregatedMedia, findAllAggregatedMedia } = await import('../src/worker/store/db')

  await upsertMedia(
    [
      { uri: 'anilist:1', origin: 'anilist', id: '1', url: null, score: 0.9, type: null, status: null, titles: [{ language: 'en', title: 'Test Show' }], descriptions: [], shortDescriptions: [], trailers: [], covers: [], banners: [], externalLinks: null, averageScore: null, popularity: 1000, startDate: null, endDate: null, isAdult: null, episodeCount: null },
      { uri: 'mal:1', origin: 'mal', id: '1', url: null, score: 0.5, type: null, status: null, titles: [{ language: 'en', title: 'Test Show' }], descriptions: [], shortDescriptions: [], trailers: [], covers: [], banners: [], externalLinks: null, averageScore: null, popularity: null, startDate: null, endDate: null, isAdult: null, episodeCount: null },
    ],
    [{ mediaUri: 'anilist:1', handleUri: 'mal:1' }]
  )

  const cluster = await findAggregatedMedia('anilist:1')
  expect(cluster.length).to.equal(2)

  const allMedia = await findAllAggregatedMedia()
  expect(allMedia.length).to.equal(1)

  // Upsert anilist:1 again with empty titles — should keep existing (longer array wins)
  await upsertMedia(
    [{ uri: 'anilist:1', origin: 'anilist', id: '1', url: null, score: 0.9, type: null, status: null, titles: [], descriptions: [], shortDescriptions: [], trailers: [], covers: [], banners: [], externalLinks: null, averageScore: null, popularity: 1000, startDate: null, endDate: null, isAdult: null, episodeCount: null }],
    []
  )

  const updatedCluster = await findAggregatedMedia('anilist:1')
  const anilist = updatedCluster.find(m => m.uri === 'anilist:1')!
  expect(anilist.titles.length).to.equal(1)
  expect(anilist.titles[0]!.title).to.equal('Test Show')

  // Scalar last-write-wins: popularity changes
  await upsertMedia(
    [{ uri: 'anilist:1', origin: 'anilist', id: '1', url: null, score: 0.9, type: null, status: null, titles: [], descriptions: [], shortDescriptions: [], trailers: [], covers: [], banners: [], externalLinks: null, averageScore: null, popularity: 2000, startDate: null, endDate: null, isAdult: null, episodeCount: null }],
    []
  )
  const updated2 = await findAggregatedMedia('anilist:1')
  const anilist2 = updated2.find(m => m.uri === 'anilist:1')!
  expect(anilist2.popularity).to.equal(2000)
  expect(anilist2.titles.length).to.equal(1) // still preserved
}

export const graphLabels = async () => {
  const { Graph } = await import('../src/worker/store/graph')

  const g = new Graph<{ name: string; tags: string[] }>()

  // registerLabel stores a merge function
  const mergeFn = (incoming: any, existing: any) => ({ ...existing, ...incoming })
  g.registerLabel('person', { merge: mergeFn })

  // registering the same label again overwrites
  g.registerLabel('person', { merge: mergeFn })

  // registerLabel without merge is fine
  g.registerLabel('tag')

  // --- set with addLabels ---
  const merge = (incoming: any, existing: any) => {
    const result = { ...existing }
    for (const key in incoming) {
      const val = incoming[key]
      if (Array.isArray(val)) {
        const ex = existing[key]
        result[key] = (Array.isArray(ex) && ex.length > val.length) ? ex : val
      } else {
        result[key] = val ?? existing[key]
      }
    }
    return result
  }

  const g2 = new Graph<{ name: string; tags: string[] }>()
  g2.registerLabel('item', { merge })

  // First set — no existing node, stores as-is
  g2.set('a', { name: 'Alice', tags: ['x', 'y'] }, { addLabels: ['item'] })
  expect(g2.get('a')).to.deep.equal({ name: 'Alice', tags: ['x', 'y'] })

  // Second set — existing node, merge runs: scalar last-write-wins, array longest-wins
  g2.set('a', { name: 'Bob', tags: ['z'] }, { addLabels: ['item'] })
  expect(g2.get('a')!.name).to.equal('Bob')       // scalar: last write wins
  expect(g2.get('a')!.tags).to.deep.equal(['x', 'y'])  // array: existing is longer, kept

  // Set without options on a labeled node — still merges
  g2.set('a', { name: 'Carol', tags: ['a', 'b', 'c'] })
  expect(g2.get('a')!.name).to.equal('Carol')     // scalar: last write wins
  expect(g2.get('a')!.tags).to.deep.equal(['a', 'b', 'c'])  // array: incoming is longer, wins

  // Set without label on unlabeled node — raw overwrite
  const g3 = new Graph<{ name: string; tags: string[] }>()
  g3.set('b', { name: 'first', tags: ['1', '2'] })
  g3.set('b', { name: 'second', tags: [] })
  expect(g3.get('b')).to.deep.equal({ name: 'second', tags: [] })  // raw overwrite

  // --- setLabel ---
  const g4 = new Graph<{ name: string; tags: string[] }>()
  g4.set('c', { name: 'test', tags: [] })
  g4.setLabel('c', 'item', 'special')

  // --- labeled ---
  expect(g4.labeled('item').has('c')).to.equal(true)
  expect(g4.labeled('special').has('c')).to.equal(true)
  expect(g4.labeled('nonexistent').size).to.equal(0)

  // --- removeLabels via set ---
  g4.registerLabel('special')
  g4.set('c', { name: 'updated', tags: [] }, { removeLabels: ['special'] })
  expect(g4.labeled('special').has('c')).to.equal(false)
  expect(g4.labeled('item').has('c')).to.equal(true)

  // --- clusters with nodeLabel ---
  const g5 = new Graph<{ name: string; tags: string[] }>()
  g5.registerLabel('media')
  g5.registerLabel('episode')

  g5.set('m1', { name: 'Show A', tags: [] }, { addLabels: ['media'] })
  g5.set('m2', { name: 'Show A alt', tags: [] }, { addLabels: ['media'] })
  g5.set('e1', { name: 'Ep 1', tags: [] }, { addLabels: ['episode'] })
  g5.link('m1', 'm2', 'same_as')
  g5.edge('m1', 'e1', 'has_ep')

  // clusters seeded from 'media' label — finds the m1+m2 cluster
  const mediaClusters = g5.clusters('same_as', 'media')
  expect(mediaClusters.length).to.equal(1)
  expect(mediaClusters[0]!.length).to.equal(2)

  // clusters without nodeLabel — finds all nodes (including isolated e1 as its own cluster)
  const allClusters = g5.clusters('same_as')
  expect(allClusters.length).to.equal(2) // [m1,m2] and [e1]
}
