import { describe, expect, test } from 'vitest'

import { relationLanes, sortRelations, watchableRelations, type RelationEdge } from '../../../src/utils/relation-lanes'

// The row reads as a TIMELINE: what came before on the left, what comes after on the right, and
// everything that is neither between them. A single grid filled left to right put the sequel beside
// the prequel with the modal's right half empty, and moved a work's position every time another
// relation was added.

const edge = (relation: string, id: string, format = 'TV'): RelationEdge =>
  ({ relation, format, node: { uri: `anilist:${id}`, titles: [{ title: id }] } } as unknown as RelationEdge)

const uris = (edges: readonly RelationEdge[]) => edges.map(e => e.node.uri)

describe('relationLanes', () => {
  // Mushoku Tensei season 2 part 2 as the page really renders it: a prequel, a sequel and a special
  test('a prequel goes left, a sequel right, and the rest between them', () => {
    const lanes = relationLanes([
      edge('SIDE_STORY', 'side'), edge('SEQUEL', 'next'), edge('PREQUEL', 'previous'),
    ])
    expect(uris(lanes.before)).toEqual(['anilist:previous'])
    expect(uris(lanes.middle)).toEqual(['anilist:side'])
    expect(uris(lanes.after)).toEqual(['anilist:next'])
  })

  test('every relation lands in exactly one lane', () => {
    const all = [
      edge('SOURCE', 'a'), edge('PREQUEL', 'b'), edge('SEQUEL', 'c'), edge('PARENT', 'd'),
      edge('SIDE_STORY', 'e'), edge('ALTERNATIVE', 'f'), edge('OTHER', 'g'),
    ]
    const lanes = relationLanes(all)
    const placed = [...lanes.before, ...lanes.middle, ...lanes.after]
    expect(placed).toHaveLength(all.length)
    expect(new Set(uris(placed)).size).toBe(all.length)
  })

  // several prequels is ordinary for a franchise with an OVA before the season, and they stay together
  test('several of one kind share a lane', () => {
    const lanes = relationLanes([edge('PREQUEL', 'p1'), edge('SEQUEL', 's1'), edge('PREQUEL', 'p2')])
    expect(uris(lanes.before)).toEqual(['anilist:p1', 'anilist:p2'])
    expect(uris(lanes.after)).toEqual(['anilist:s1'])
  })

  // the middle keeps the rank order the row has always used, so the lanes change WHERE a card sits
  // and never the order within one
  test('the middle is still ranked by what the relation is', () => {
    const middle = relationLanes([edge('OTHER', 'z'), edge('SOURCE', 'a'), edge('SIDE_STORY', 'm')]).middle
    expect(uris(middle)).toEqual(uris(sortRelations([edge('SOURCE', 'a'), edge('SIDE_STORY', 'm'), edge('OTHER', 'z')])))
  })

  // an empty lane is not an absent one: it is what holds the middle in the centre, so the component
  // renders all three regardless
  test('a row with no prequel still has a before lane to render', () => {
    const lanes = relationLanes([edge('SEQUEL', 'next')])
    expect(lanes.before).toEqual([])
    expect(uris(lanes.after)).toEqual(['anilist:next'])
  })

  test('nothing at all is three empty lanes rather than a throw', () => {
    expect(relationLanes([])).toEqual({ before: [], middle: [], after: [] })
  })

  // the lanes run over what the row actually shows, which is the watchable subset: a source novel is
  // a real PREQUEL-adjacent relation and not something this app can open
  test('and it composes with the watchable filter the row applies first', () => {
    const lanes = relationLanes(watchableRelations([edge('PREQUEL', 'novel', 'NOVEL'), edge('PREQUEL', 'season', 'TV')]))
    expect(uris(lanes.before)).toEqual(['anilist:season'])
  })
})
