// `graph.link` has always reported whether it changed anything and `graph.edge` did not, so every
// caller of the second had to guess. `upsertMedia` guessed "yes", which meant a source re-minting a
// handle it had already minted emitted `media:changed` anyway.
//
// That is not a cosmetic event. `media:changed` re-runs the whole fuzzy merge pass and wakes every
// subscribed page, and the sources re-mint constantly: the DataLoader flushes on a 50ms timer and the
// media page re-asks every origin. So a PART_OF edge that never changes still paid for a full pass
// each time it was asserted.
import { beforeEach, expect, test } from 'vitest'

import { graph, resetStore } from './db'

beforeEach(() => { resetStore() })

test('graph.edge reports whether the edge is new, the same as graph.link', () => {
  expect(graph.edge('a:1', 'b:2', 'test:label'), 'the first assertion is a change').toBe(true)
  expect(graph.edge('a:1', 'b:2', 'test:label'), 'the second asserts what is already there').toBe(false)
  expect(graph.edge('a:1', 'b:3', 'test:label'), 'a different target is a change again').toBe(true)
})
