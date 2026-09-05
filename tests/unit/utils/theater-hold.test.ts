import { expect, test } from 'vitest'

import { holdTheaterPick, theaterKey } from '../../../src/utils/theater'

const media = (id: string) => ({ _id: id, uri: `anilist:${id}`, titles: ['t'], shortDescriptions: ['d'], trailers: ['v'] })
const always = (at: number) => () => at

// The hero re-rolled every time the candidate count grew, which on a cold load is several times a
// second: 22 candidates arrive from the bundle and live sources add more. Measured by the owner as
// "switches between 5 different anime in like 1s, and it ALWAYS happens".
test('the show already on screen is kept when more candidates arrive', () => {
  const first = [media('a'), media('b')]
  const chosen = holdTheaterPick(first, undefined, [], always(1))
  expect(theaterKey(chosen!)).toBe('b')

  const grown = [media('a'), media('b'), media('c'), media('d')]

  expect(theaterKey(holdTheaterPick(grown, 'b', [], always(0))!), 'a new pick would have given a')
    .toBe('b')
})

test('the show is kept even when the listing reorders under it, which an index could not do', () => {
  const reordered = [media('c'), media('b'), media('a')]

  expect(theaterKey(holdTheaterPick(reordered, 'a', [], always(0))!)).toBe('a')
})

test('a banned show is replaced, and banning is by show rather than by position', () => {
  const candidates = [media('a'), media('b')]

  expect(theaterKey(holdTheaterPick(candidates, 'a', ['a'], always(0))!)).toBe('b')
})

test('a show that leaves the candidates is replaced', () => {
  expect(theaterKey(holdTheaterPick([media('x'), media('y')], 'gone', [], always(1))!)).toBe('y')
})

test('nothing to show when every candidate is banned, or when there are none', () => {
  expect(holdTheaterPick([media('a')], 'a', ['a'])).toBeUndefined()
  expect(holdTheaterPick([], undefined)).toBeUndefined()
})
