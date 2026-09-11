/**
 * The canonical form every graph hash is taken over.
 *
 * No engine here: this is the pure half, and it is the half that decides whether a re-fetch is a
 * no-op. It got a file of its own the day the season walk measured what happens when it is wrong.
 */
import { expect, test } from 'vitest'

import { canonicalJson, contentHash } from '../../../../src/worker/graph/hash'

const row = (id: string, handleId: string, title = 'Frieren') => ({
  _id: id,
  uri: 'mal:1',
  origin: 'mal',
  titles: [{ language: 'en', title, score: 1 }],
  handles: [{ relation: 'SAME_AS', node: { _id: handleId, uri: 'kitsu:1', origin: 'kitsu' } }],
})

// A MINTED ID IS NOT CONTENT. `makeMedia` stamps `crypto.randomUUID()` on every row and every nested
// handle node (`src/sources/utils.ts:60`), so hashing it makes every answer new: the summer 2026 walk
// recorded 572 distinct (origin, uri) listing answers as 127,370 rows, 222.7 loads of one listing.
// Mutation: drop `_id` from `NOT_CONTENT` in hash.ts and this fails on the first expect.
test('two answers differing only in minted ids hash alike, at every depth', async () => {
  const first = await contentHash(row('a1b2', 'c3d4'))
  const second = await contentHash(row('99999999-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000000'))
  expect(second).toBe(first)
  expect(canonicalJson(row('a1b2', 'c3d4'))).not.toContain('a1b2')
})

// THE CONTROL, and without it the case above is indistinguishable from "hashes everything alike".
test('two answers differing in a real field do not hash alike', async () => {
  const first = await contentHash(row('a1b2', 'c3d4'))
  const renamed = await contentHash(row('a1b2', 'c3d4', 'Sousou no Frieren'))
  expect(renamed).not.toBe(first)

  // and a nested field is content too, which is the half a top-level comparison would miss
  const nested = row('a1b2', 'c3d4')
  nested.handles[0]!.node.uri = 'kitsu:2'
  expect(await contentHash(nested)).not.toBe(first)
})

test('object keys are sorted recursively and array order is kept', async () => {
  const ordered = { b: 1, a: { d: 2, c: [3, 4] } }
  const shuffled = { a: { c: [3, 4], d: 2 }, b: 1 }
  expect(canonicalJson(ordered)).toBe(canonicalJson(shuffled))
  expect(canonicalJson([1, 2]), 'a list\'s order is content').not.toBe(canonicalJson([2, 1]))
})
