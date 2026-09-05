// The bundled season is what the home page paints before any source answers, and it painted the
// alphabet: the listing sorts on `popularity` with a STABLE sort, every bundled row has none, so the
// order the bundle ships in is the order the user sees. Measured on the shipped bundle 2026-09-05,
// SUMMER 2026, the first five cards were "Kimi o Aisuru Ki wa Nai", "Kimi wo Aisuru Ki wa Nai",
// "Adventure Time: Side Quests", "Animatica" and "Aware! Meisaku-kun", which is manami's own
// alphabetical dump order.
//
// manami carries NO popularity count, so there is nothing honest to sort by except its 1 to 10
// rating, and only 37 of those 219 records carry one. Ordering by it is a weak proxy and is still
// strictly better than the alphabet: a rated show is one somebody watched.
import { expect, test } from 'vitest'

import { orderSeasonBucket } from '../../../../scripts/season-order.mjs'

const record = (t: string, sc?: number) => ({ t, ty: 'TV', p: '', ...(sc === undefined ? {} : { sc }) })

test('a season bucket leads with its rated records, best first, and keeps the rest behind them', () => {
  const bucket = [record('Aardvark'), record('Mushoku Tensei', 9.7), record('Beta'), record('Clevatess', 10)]

  expect(orderSeasonBucket(bucket).map(entry => entry.t))
    .toEqual(['Clevatess', 'Mushoku Tensei', 'Aardvark', 'Beta'])
})

test('the unrated tail keeps the order it arrived in, so the bundle stays deterministic', () => {
  const bucket = [record('Zulu'), record('Alpha'), record('Mike')]

  expect(orderSeasonBucket(bucket).map(entry => entry.t), 'nothing to rank them by, so nothing is invented')
    .toEqual(['Zulu', 'Alpha', 'Mike'])
})

test('ordering copies rather than mutating, and a zero score is a score', () => {
  const bucket = [record('Rated Zero', 0), record('Unrated')]
  const before = [...bucket]

  const ordered = orderSeasonBucket(bucket)

  expect(bucket, 'the caller keeps its array').toEqual(before)
  expect(ordered.map(entry => entry.t), 'zero is a rating a show was given, not a missing one').toEqual(['Rated Zero', 'Unrated'])
})
