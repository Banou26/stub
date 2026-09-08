// A franchise graph has three ways of going wrong that all look like a rendering bug: the same
// relationship drawn twice because the source published both ends of it, a season placed beside the
// thing it follows instead of after it, and a cycle that a naive depth-first layering never returns
// from. All three are arithmetic, so none of them needs a browser.
import { describe, expect, test } from 'vitest'

import { canonicalEdges, formatsIn, inStoryOrder, isVideoFormat, layoutFranchise, nodeTitle, onlyFormats } from '../../../src/utils/franchise-layout'
import type { FranchiseEdge, FranchiseNode } from '../../../src/utils/franchise-layout'

const node = (uri: string, extra: Partial<FranchiseNode> = {}): FranchiseNode =>
  ({ uri, titles: [{ title: uri }], ...extra })

const edge = (from: string, to: string, relation: string): FranchiseEdge => ({ from, to, relation })

describe('canonicalEdges', () => {
  test('both ends of one relationship become one arrow, pointing the way the story runs', () => {
    // exactly what AniList publishes: 108465 says SEQUEL to 127720, and 127720 says PREQUEL back
    const edges = canonicalEdges([edge('a', 'b', 'SEQUEL'), edge('b', 'a', 'PREQUEL')])
    expect(edges).toEqual([{ from: 'a', to: 'b', relation: 'SEQUEL' }])
  })

  test('and it works when only the backwards one was published', () => {
    expect(canonicalEdges([edge('b', 'a', 'PREQUEL')])).toEqual([{ from: 'a', to: 'b', relation: 'SEQUEL' }])
  })

  test('every inverse pair collapses, not just the sequel one', () => {
    expect(canonicalEdges([edge('novel', 'show', 'ADAPTATION'), edge('show', 'novel', 'SOURCE')]))
      .toEqual([{ from: 'show', to: 'novel', relation: 'SOURCE' }])
    expect(canonicalEdges([edge('a', 'b', 'COMPILATION'), edge('b', 'a', 'CONTAINS')]))
      .toEqual([{ from: 'b', to: 'a', relation: 'CONTAINS' }])
  })

  test('two DIFFERENT relationships between the same works both survive', () => {
    const edges = canonicalEdges([edge('a', 'b', 'SEQUEL'), edge('a', 'b', 'ALTERNATIVE')])
    expect(edges).toHaveLength(2)
  })

  test('a work related to itself is dropped rather than drawn as a loop', () => {
    expect(canonicalEdges([edge('a', 'a', 'SEQUEL')])).toEqual([])
  })

  test('and an edge missing an end is dropped rather than placing a phantom column', () => {
    expect(canonicalEdges([{ from: '', to: 'b', relation: 'SEQUEL' } as FranchiseEdge])).toEqual([])
  })
})

describe('layoutFranchise', () => {
  const columnOf = (layout: ReturnType<typeof layoutFranchise>, uri: string) =>
    layout.nodes.find(node => node.uri === uri)?.column

  test('a series reads left to right in the order it happened', () => {
    // the shape the whole layout is for: season one, season two, the film, season three
    const layout = layoutFranchise({
      nodes: [
        node('film', { startDate: '2022-06-01' }),
        node('s3', { startDate: '2024-01-05' }),
        node('s1', { startDate: '2018-10-02' }),
        node('s2', { startDate: '2021-01-12' }),
      ],
      edges: [],
    })
    expect(columnOf(layout, 's1')).toBe(0)
    expect(columnOf(layout, 's2')).toBe(1)
    expect(columnOf(layout, 'film')).toBe(2)
    expect(columnOf(layout, 's3')).toBe(3)
    expect(layout.columns).toBe(4)
  })

  test('and the chain says that order outright, step by step', () => {
    const layout = layoutFranchise({
      nodes: [
        node('s2', { startDate: '2021-01-12' }),
        node('s1', { startDate: '2018-10-02' }),
        node('film', { startDate: '2022-06-01' }),
      ],
      edges: [],
    })
    expect(layout.chain).toEqual([{ from: 's1', to: 's2' }, { from: 's2', to: 'film' }])
  })

  test('the order is by DAY, not by year, since a franchise puts two cours in one year', () => {
    const layout = layoutFranchise({
      nodes: [node('cour2', { startDate: '2021-10-04' }), node('cour1', { startDate: '2021-01-11' })],
      edges: [],
    })
    expect(columnOf(layout, 'cour1')).toBe(0)
    expect(columnOf(layout, 'cour2')).toBe(1)
  })

  test('a work whose date nobody recorded goes last, not first', () => {
    const layout = layoutFranchise({
      nodes: [node('unknown'), node('s1', { startDate: '2018-10-02' })],
      edges: [],
    })
    expect(columnOf(layout, 's1')).toBe(0)
    expect(columnOf(layout, 'unknown')).toBe(1)
  })

  test('a cycle lays out instead of hanging, which a depth-first walk would not', () => {
    const layout = layoutFranchise({
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b', 'SEQUEL'), edge('b', 'c', 'SEQUEL'), edge('c', 'a', 'OTHER')],
    })
    expect(layout.nodes).toHaveLength(3)
    expect(layout.nodes.every(placed => Number.isFinite(placed.column))).toBe(true)
  })

  test('works released the same day share a column and stack, rather than being put in an order nobody stated', () => {
    const layout = layoutFranchise({
      nodes: [node('a', { startDate: '2020-04-01' }), node('b', { startDate: '2020-04-01' })],
      edges: [],
    })
    expect(columnOf(layout, 'a')).toBe(columnOf(layout, 'b'))
    expect(new Set(layout.nodes.map(item => item.row)).size).toBe(2)
    expect(layout.rows).toBe(2)
    // and no chain step between them, since neither comes first
    expect(layout.chain).toEqual([])
  })

  test('and their order is stable, by year then title, so the same graph draws the same twice', () => {
    const build = () => layoutFranchise({
      nodes: [node('root'), node('later', { startDate: '2021' }), node('earlier', { startDate: '2018' })],
      edges: [edge('root', 'later', 'SIDE_STORY'), edge('root', 'earlier', 'SIDE_STORY')],
    })
    const rows = (layout: ReturnType<typeof layoutFranchise>) =>
      layout.nodes.filter(item => item.uri !== 'root').sort((a, b) => a.row - b.row).map(item => item.uri)
    expect(rows(build())).toEqual(['earlier', 'later'])
    expect(rows(build())).toEqual(rows(build()))
  })

  test('a graph is never wider than it has works, however the edges loop', () => {
    // the guard for a real measurement: 18 works of one franchise laid out across 56 columns, a canvas
    // 16,730px wide, because a cycle kept raising its members' columns on every pass
    const nodes = ['a', 'b', 'c', 'd'].map(uri => node(uri))
    const layout = layoutFranchise({
      nodes,
      edges: [
        edge('a', 'b', 'SEQUEL'), edge('b', 'c', 'SEQUEL'),
        edge('c', 'd', 'SEQUEL'), edge('d', 'b', 'OTHER'),
      ],
    })
    expect(layout.columns).toBeLessThanOrEqual(nodes.length)
    expect(Math.max(...layout.nodes.map(placed => placed.column))).toBeLessThan(nodes.length)
  })

  test('and its columns are consecutive, so no empty band is drawn between two works', () => {
    const layout = layoutFranchise({
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b', 'SEQUEL'), edge('b', 'c', 'SEQUEL'), edge('c', 'a', 'OTHER')],
    })
    const columns = [...new Set(layout.nodes.map(placed => placed.column))].sort((x, y) => x - y)
    expect(columns).toEqual(columns.map((_, index) => index))
  })

  test('an edge naming a work the graph has no node for is not drawn', () => {
    const layout = layoutFranchise({
      nodes: [node('a', { startDate: '2018-01-01' }), node('b', { startDate: '2019-01-01' })],
      edges: [edge('a', 'b', 'SEQUEL'), edge('a', 'ghost', 'SEQUEL')],
    })
    expect(layout.edges).toHaveLength(1)
    expect(layout.columns).toBe(2)
  })

  test('an empty franchise lays out as nothing rather than throwing', () => {
    const layout = layoutFranchise({ nodes: [], edges: [] })
    expect(layout.nodes).toEqual([])
    expect(layout.columns).toBe(0)
    expect(layout.rows).toBe(0)
  })
})

describe('nodeTitle', () => {
  test('a work with no title still names itself, so no box is blank', () => {
    expect(nodeTitle({ uri: 'anilist:1', titles: [] })).toBe('anilist:1')
    expect(nodeTitle({ uri: 'anilist:1', titles: [{ title: 'Slime' }] })).toBe('Slime')
  })
})

describe('isVideoFormat', () => {
  test('the things you watch', () => {
    for (const format of ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']) {
      expect(isVideoFormat(format), format).toBe(true)
    }
  })

  test('and the things you read', () => {
    for (const format of ['MANGA', 'NOVEL', 'ONE_SHOT']) {
      expect(isVideoFormat(format), format).toBe(false)
    }
  })

  test('a work whose format nobody named is kept, since a gap is worse than a stray box', () => {
    expect(isVideoFormat(undefined)).toBe(true)
    expect(isVideoFormat(null)).toBe(true)
    expect(isVideoFormat('')).toBe(true)
  })
})

describe('formatsIn', () => {
  test('names every kind present, once each, in a stable order', () => {
    const franchise = {
      nodes: [node('a', { format: 'TV' }), node('b', { format: 'NOVEL' }), node('c', { format: 'TV' })],
      edges: [],
    }
    expect(formatsIn(franchise)).toEqual(['NOVEL', 'TV'])
  })

  test('and offers nothing for a work whose format is unknown', () => {
    expect(formatsIn({ nodes: [node('a')], edges: [] })).toEqual([])
  })
})

describe('isVideoFormat', () => {
  test('the things you watch', () => {
    for (const format of ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']) {
      expect(isVideoFormat(format), format).toBe(true)
    }
  })

  test('and the things you read', () => {
    for (const format of ['MANGA', 'NOVEL', 'ONE_SHOT']) {
      expect(isVideoFormat(format), format).toBe(false)
    }
  })

  test('a work whose format nobody named is kept, since a gap is worse than a stray box', () => {
    expect(isVideoFormat(undefined)).toBe(true)
    expect(isVideoFormat(null)).toBe(true)
    expect(isVideoFormat('')).toBe(true)
  })
})

describe('formatsIn', () => {
  test('names every kind present, once each, in a stable order', () => {
    const franchise = {
      nodes: [node('a', { format: 'TV' }), node('b', { format: 'NOVEL' }), node('c', { format: 'TV' })],
      edges: [],
    }
    expect(formatsIn(franchise)).toEqual(['NOVEL', 'TV'])
  })

  test('and offers nothing for a work whose format is unknown', () => {
    expect(formatsIn({ nodes: [node('a')], edges: [] })).toEqual([])
  })
})


describe('inStoryOrder', () => {
  test('earliest first, and an undated work last', () => {
    const ordered = inStoryOrder([
      node('late', { startDate: '2024-01-01' }),
      node('undated'),
      node('early', { startDate: '2018-01-01' }),
    ])
    expect(ordered.map(item => item.uri)).toEqual(['early', 'late', 'undated'])
  })

  test('and ties break on the title, so the same series draws the same way twice', () => {
    const same = { startDate: '2020-01-01' }
    expect(inStoryOrder([node('b', same), node('a', same)]).map(item => item.uri)).toEqual(['a', 'b'])
  })
})

describe('onlyFormats', () => {
  const mixed = () => ({
    nodes: [
      node('s1', { format: 'TV', startDate: '2018-01-01' }),
      node('novel', { format: 'NOVEL', startDate: '2014-01-01' }),
      node('s2', { format: 'TV', startDate: '2021-01-01' }),
    ],
    edges: [edge('s1', 'novel', 'SOURCE'), edge('s2', 'novel', 'SOURCE')],
  })

  test('a hidden work is GONE, not shrunk, and its arrows go with it', () => {
    const only = onlyFormats(mixed(), item => isVideoFormat(item.format))
    expect(only.nodes.map(item => item.uri).sort()).toEqual(['s1', 's2'])
    expect(only.edges).toEqual([])
  })

  test('and the survivors still read in order, which is what replaces the arrows', () => {
    const layout = layoutFranchise(onlyFormats(mixed(), item => isVideoFormat(item.format)))
    expect(layout.nodes.find(item => item.uri === 's1')?.column).toBe(0)
    expect(layout.nodes.find(item => item.uri === 's2')?.column).toBe(1)
    expect(layout.chain).toEqual([{ from: 's1', to: 's2' }])
  })

  test('keeping everything changes nothing', () => {
    const only = onlyFormats(mixed(), () => true)
    expect(only.nodes).toHaveLength(3)
    expect(only.edges).toHaveLength(2)
  })

  test('hiding everything leaves nothing rather than throwing', () => {
    expect(onlyFormats(mixed(), () => false)).toEqual({ nodes: [], edges: [] })
  })
})
