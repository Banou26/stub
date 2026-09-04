// `graph.link` has always reported whether it changed anything and `graph.edge` did not, so every
// caller of the second had to guess. `upsertMedia` guessed "yes", which meant a source re-minting a
// handle it had already minted emitted `media:changed` anyway.
//
// That is not a cosmetic event. `media:changed` re-runs the whole fuzzy merge pass and wakes every
// subscribed page, and the sources re-mint constantly: the DataLoader flushes on a 50ms timer and the
// media page re-asks every origin. So a PART_OF edge that never changes still paid for a full pass
// each time it was asserted.
import { beforeEach, expect, test } from 'vitest'

import { graph, resetStore, upsertMedia } from './db'
import { listen } from './events'

const media = (uri: string) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  categories: ['ANIME', 'SERIES'],
  titles: [{ language: 'en', title: uri, score: 1 }],
}) as any

beforeEach(() => { resetStore() })

test('graph.edge reports whether the edge is new, the same as graph.link', () => {
  expect(graph.edge('a:1', 'b:2', 'test:label'), 'the first assertion is a change').toBe(true)
  expect(graph.edge('a:1', 'b:2', 'test:label'), 'the second asserts what is already there').toBe(false)
  expect(graph.edge('a:1', 'b:3', 'test:label'), 'a different target is a change again').toBe(true)
})

// The half that matters to the app: the store must not announce a change it did not make.
test('re-asserting the same PART_OF handle emits no second media:changed', async () => {
  const rows = [media('anilist:108465'), media('imdb:tt13303712')]
  const handle = [{ mediaUri: 'anilist:108465', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' as const }]

  let events = 0
  const stop = listen('media:changed', () => { events++ })
  await upsertMedia(rows, handle)
  const afterFirst = events
  await upsertMedia(rows, handle)
  stop()

  expect(afterFirst, 'the first upsert really did change the graph').toBe(1)
  expect(events, 'the second upsert changed nothing and must say so').toBe(1)
})
