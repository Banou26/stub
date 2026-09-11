// The controls for the containment and episode-identity half of the harness.
//
// WHY THIS FILE EXISTS. Today's store holds no INCLUDES and no episode identity that crosses a
// cluster, so no case file can make those checks fire against it: every one of them passes for the
// same reason a store that answered nothing at all would pass. A check nothing can redden is a check
// nobody should believe, so each one is driven here against a stub store that answers wrongly on
// purpose, and the adapter's three methods are asked for a positive answer separately.
import { describe, expect, test } from 'vitest'

import { checkRelations, type CorpusStore } from '../../../corpus/run'
import { validateCase, type CorpusCase, type CorpusIncludes } from '../../../corpus/types'
import { currentStore } from '../../../corpus/adapters/current-store'

const CASE: CorpusCase = validateCase({
  name: 'a season holds two runs',
  source: { file: 'tests/unit/worker/corpus/relation-checks.test.ts', test: 'a season holds two runs' },
  why: 'Two broadcast runs a streamer sells as one season of 24 with a special at the end.',
  rows: [
    { uri: 'anilist:1', origin: 'anilist', id: '1', titles: [], episodeCount: 11 },
    { uri: 'cr:S1', origin: 'cr', id: 'S1', titles: [], episodeCount: 24 },
    { uri: 'nf:9', origin: 'nf', id: '9', titles: [] },
  ],
  claims: [],
  episodes: [
    { uri: 'anilist:1-e1', origin: 'anilist', id: '1-e1', mediaUri: 'anilist:1', episodeNumber: 1, titles: [] },
    { uri: 'cr:S1-e1', origin: 'cr', id: 'S1-e1', mediaUri: 'cr:S1', episodeNumber: 1, titles: [] },
    { uri: 'cr:S1-e24', origin: 'cr', id: 'S1-e24', mediaUri: 'cr:S1', episodeNumber: 24, titles: [] },
  ],
  expect: {
    together: [['anilist:1']],
    apart: [['anilist:1', 'cr:S1']],
    partOf: [{ part: 'anilist:1', whole: 'cr:S1' }],
    includes: [{ container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11 } }],
    episodePairs: [{ a: 'cr:S1-e1', b: 'anilist:1-e1' }],
    episodeApart: [{ a: 'cr:S1-e24', b: 'anilist:1-e1' }],
    unrelated: ['nf:9'],
  },
  checked: { by: 'the test', at: '2026-09-12' },
}, 'relation-checks')

const CLUSTERS = [['anilist:1'], ['cr:S1'], ['nf:9']]

const INCLUDES: CorpusIncludes = {
  container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11 },
}

/** A store that answers exactly what the case asks, with the one answer under test replaced. */
const stub = (overrides: Partial<CorpusStore> = {}): CorpusStore => ({
  reset: async () => {},
  upsert: async () => {},
  clusters: async () => CLUSTERS,
  episodesOf: async () => 11,
  containersOf: async uri => uri === 'anilist:1' ? ['cr:S1'] : [],
  includesOf: async uri => ['cr:S1', 'anilist:1'].includes(uri) ? [INCLUDES] : [],
  episodePairsOf: async uri => ({ 'cr:S1-e1': ['anilist:1-e1'], 'anilist:1-e1': ['cr:S1-e1'] } as Record<string, string[]>)[uri] ?? [],
  ...overrides,
})

const linesFrom = async (store: CorpusStore, clusters = CLUSTERS) => checkRelations(CASE, store, clusters)

describe('the containment and episode checks report what the store actually said', () => {
  test('a store that agrees breaks no promise', async () => {
    expect(await linesFrom(stub())).toEqual([])
  })

  test('PART_OF, when the part is attached to nothing', async () => {
    const [line] = await linesFrom(stub({ containersOf: async () => [] }))
    expect(line).toBe('PART_OF: anilist:1 must be attached to cr:S1 as a container. containersOf(anilist:1) is [nothing]')
  })

  test('PART_OF MERGED, when the part and the whole came back as one cluster', async () => {
    const lines = await linesFrom(stub(), [['anilist:1', 'cr:S1'], ['nf:9']])
    expect(lines).toContain(
      'PART_OF MERGED: anilist:1 and cr:S1 are one cluster and must not be, because a container holds the run '
      + 'and is not the run. Cluster is [anilist:1, cr:S1]'
    )
  })

  test('INCLUDES, when the container holds nothing', async () => {
    const [line] = await linesFrom(stub({ includesOf: async () => [] }))
    expect(line).toBe('INCLUDES: cr:S1 must hold anilist:1. includesOf(cr:S1) is [nothing]')
  })

  test('INCLUDES RANGE, when the container holds the run at the wrong episodes', async () => {
    const wrong = { ...INCLUDES, range: { fromStart: 12, fromEnd: 22, toStart: 1, toEnd: 11 } }
    const [line] = await linesFrom(stub({ includesOf: async () => [wrong] }))
    expect(line).toBe('INCLUDES RANGE: cr:S1 holds anilist:1 at 1..11 onto 1..11 and the store says 12..22 onto 1..11')
  })

  test('INCLUDES RANGE, when the container holds the run with no range at all', async () => {
    const [line] = await linesFrom(stub({ includesOf: async () => [{ container: 'cr:S1', run: 'anilist:1' }] }))
    expect(line).toBe('INCLUDES RANGE: cr:S1 holds anilist:1 at 1..11 onto 1..11 and the store says no range')
  })

  test('EPISODE_PAIR, when two rows of one broadcast episode stay two episodes', async () => {
    const lines = await linesFrom(stub({ episodePairsOf: async () => [] }))
    expect(lines).toContain(
      'EPISODE_PAIR: cr:S1-e1 and anilist:1-e1 are one broadcast episode. episodePairsOf(cr:S1-e1) is [nothing]'
    )
    // the pair is asked in both directions, because a store that answers one way only has half an answer
    expect(lines).toContain(
      'EPISODE_PAIR: anilist:1-e1 and cr:S1-e1 are one broadcast episode. episodePairsOf(anilist:1-e1) is [nothing]'
    )
  })

  test('EPISODE_WELD, when the inserted special lands on an episode', async () => {
    const welded = async (uri: string) => uri === 'cr:S1-e24' ? ['anilist:1-e1'] : ['cr:S1-e24']
    const lines = await linesFrom(stub({ episodePairsOf: welded }))
    expect(lines).toContain(
      'EPISODE_WELD: cr:S1-e24 and anilist:1-e1 are two different episodes and must never be one row. '
      + 'episodePairsOf(cr:S1-e24) is [anilist:1-e1]'
    )
  })

  test('UNRELATED, in all four ways a lone badge stops being one', async () => {
    const merged = await linesFrom(stub(), [['anilist:1'], ['cr:S1', 'nf:9']])
    expect(merged).toContain('UNRELATED MERGED: nf:9 must stand alone and its cluster is [cr:S1, nf:9]')

    const attached = await linesFrom(stub({ containersOf: async uri => uri === 'anilist:1' ? ['cr:S1'] : ['cr:S1'] }))
    expect(attached).toContain('UNRELATED ATTACHED: nf:9 must be part of nothing and containersOf(nf:9) is [cr:S1]')

    const held = await linesFrom(stub({ includesOf: async () => [{ container: 'cr:S1', run: 'nf:9' }] }))
    expect(held).toContain('UNRELATED HELD: nf:9 must be in no INCLUDES and includesOf(nf:9) is [cr:S1 holds nf:9 with no range]')

    const holds = await linesFrom(stub({ containersOf: async uri => uri === 'cr:S1' ? ['nf:9'] : ['cr:S1'] }))
    expect(holds).toContain('UNRELATED HOLDS: cr:S1 is attached to nf:9, which must hold nothing in this case')
  })
})

describe("the adapter for today's store answers its three new methods", () => {
  const rows = [
    { uri: 'anizip:1', origin: 'anizip', id: '1', titles: [{ language: 'en', title: 'A run' }], episodeCount: 2 },
    { uri: 'kitsu:1', origin: 'kitsu', id: '1', titles: [{ language: 'en', title: 'A run' }], episodeCount: 2 },
    { uri: 'cr:SHOW', origin: 'cr', id: 'SHOW', titles: [{ language: 'en', title: 'A show' }], scope: 'CONTAINER' as const },
  ]
  const claims = [
    { mediaUri: 'anizip:1', handleUri: 'kitsu:1' },
    { mediaUri: 'anizip:1', handleUri: 'cr:SHOW', relation: 'PART_OF' as const },
  ]
  const episodes = [
    { uri: 'anizip:1-e1', origin: 'anizip', id: '1-e1', mediaUri: 'anizip:1', episodeNumber: 1, titles: [] },
    { uri: 'anizip:1-e2', origin: 'anizip', id: '1-e2', mediaUri: 'anizip:1', episodeNumber: 2, titles: [] },
    { uri: 'kitsu:1-e1', origin: 'kitsu', id: '1-e1', mediaUri: 'kitsu:1', episodeNumber: 1, titles: [] },
  ]

  test('containersOf names the container, episodePairsOf names the other row of one episode', async () => {
    await currentStore.reset()
    await currentStore.upsert(rows, claims, episodes)

    expect(await currentStore.containersOf('anizip:1')).toEqual(['cr:SHOW'])
    expect(await currentStore.containersOf('cr:SHOW')).toEqual([])
    // one run, one number, two rows: this store draws those as one episode
    expect(await currentStore.episodePairsOf('anizip:1-e1')).toEqual(['kitsu:1-e1'])
    expect(await currentStore.episodePairsOf('anizip:1-e2')).toEqual([])
    expect(await currentStore.episodePairsOf('nobody:1-e1')).toEqual([])
  })

  test('includesOf is empty because this store has no INCLUDES, and says so without throwing', async () => {
    await currentStore.reset()
    await currentStore.upsert(rows, claims, episodes)
    expect(await currentStore.includesOf('cr:SHOW')).toEqual([])
    expect(await currentStore.includesOf('anizip:1')).toEqual([])
  })
})
