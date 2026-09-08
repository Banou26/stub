// A franchise graph has three ways of going wrong that all look like a rendering bug: the same
// relationship drawn twice because the source published both ends of it, a season placed beside the
// thing it follows instead of after it, and a cycle that a naive depth-first layering never returns
// from. All three are arithmetic, so none of them needs a browser.
import { describe, expect, test } from 'vitest'

import { canonicalEdges, layoutFranchise, nodeTitle } from '../../../src/utils/franchise-layout'
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

  test('a straight run of sequels reads left to right', () => {
    const layout = layoutFranchise({
      nodes: [node('s1'), node('s2'), node('s3')],
      edges: [edge('s1', 's2', 'SEQUEL'), edge('s2', 's3', 'SEQUEL')],
    })
    expect(columnOf(layout, 's1')).toBe(0)
    expect(columnOf(layout, 's2')).toBe(1)
    expect(columnOf(layout, 's3')).toBe(2)
    expect(layout.columns).toBe(3)
  })

  test('a work that follows TWO things sits after both, not beside the earlier one', () => {
    // the shortest-path answer would put the film in column 1, overlapping the thing it follows
    const layout = layoutFranchise({
      nodes: [node('s1'), node('s2'), node('film')],
      edges: [edge('s1', 's2', 'SEQUEL'), edge('s2', 'film', 'SEQUEL'), edge('s1', 'film', 'SEQUEL')],
    })
    expect(columnOf(layout, 'film')).toBe(2)
  })

  test('a cycle lays out instead of hanging, which a depth-first walk would not', () => {
    const layout = layoutFranchise({
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b', 'SEQUEL'), edge('b', 'c', 'SEQUEL'), edge('c', 'a', 'OTHER')],
    })
    expect(layout.nodes).toHaveLength(3)
    expect(layout.nodes.every(placed => Number.isFinite(placed.column))).toBe(true)
  })

  test('works in one column get their own row, so none is drawn on top of another', () => {
    const layout = layoutFranchise({
      nodes: [node('root'), node('a', { startDate: '2019' }), node('b', { startDate: '2020' })],
      edges: [edge('root', 'a', 'SIDE_STORY'), edge('root', 'b', 'SIDE_STORY')],
    })
    const placed = layout.nodes.filter(item => item.uri !== 'root')
    expect(new Set(placed.map(item => item.row)).size).toBe(2)
    expect(layout.rows).toBe(2)
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
      nodes: [node('a'), node('b')],
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
