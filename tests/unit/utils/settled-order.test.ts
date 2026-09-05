import { expect, test } from 'vitest'

import { orderKeys, settledOrder } from '../../../src/utils/settled-order'

const media = (id: string, popularity?: number) => ({ _id: id, uri: `anilist:${id}`, popularity })

test('a card the user has already seen keeps its place when the resolver reorders it', () => {
  const first = [media('a', 100), media('b', 90), media('c', 80)]
  const placed = orderKeys(first)

  // the resolver now ranks c above b, which is the 9 second swap that was measured
  const later = [media('a', 100), media('c', 95), media('b', 90)]

  expect(settledOrder(later, placed).map(node => node._id)).toEqual(['a', 'b', 'c'])
})

test('a show that only appears later is appended, never inserted into what is on screen', () => {
  const placed = orderKeys([media('a'), media('b')])

  expect(settledOrder([media('d', 999), media('a'), media('b')], placed).map(node => node._id))
    .toEqual(['a', 'b', 'd'])
})

test('with nothing placed yet the resolver order is kept exactly', () => {
  const nodes = [media('x', 1), media('y', 2)]

  expect(settledOrder(nodes, []).map(node => node._id)).toEqual(['x', 'y'])
})

test('a card that disappears from the listing simply goes, and the rest hold their order', () => {
  const placed = orderKeys([media('a'), media('b'), media('c')])

  expect(settledOrder([media('c'), media('a')], placed).map(node => node._id)).toEqual(['a', 'c'])
})

test('placement falls back to the uri when a node carries no cluster id', () => {
  const placed = orderKeys([{ uri: 'mal:1' }, { uri: 'mal:2' }])

  expect(settledOrder([{ uri: 'mal:2' }, { uri: 'mal:1' }], placed).map(node => node.uri))
    .toEqual(['mal:1', 'mal:2'])
})
