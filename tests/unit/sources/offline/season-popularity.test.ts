// The owner's target, with two screenshots on 2026-09-05: a cold "Current season" must lead with
// Mushoku Tensei, Saga of Tanya the Evil II, Smoking Behind the Supermarket and Bleach. That order is
// MyAnimeList's member count, which the live jikan source publishes at score 0.9 and which therefore
// wins the aggregate. manami ships no popularity at all, so the bundle could only sort by its 1 to 10
// rating: 37 of 219 records carry one and its top is three shows tied at a perfect 10 from a handful
// of votes. Jikan's seasonal endpoint hands the real counts over in bulk, 149 entries in 6 pages,
// measured 2026-09-06:
//   254638 Mushoku Tensei III | 233645 Youjo Senki II | 161220 Super no Ura de Yani Suu Futari
import { expect, test } from 'vitest'

import { orderSeasonBucket } from '../../../../scripts/season-order.mjs'

const record = (t: string, over: { sc?: number, pop?: number } = {}) => ({ t, ty: 'TV', p: '', ...over })

test('member counts decide the order, so the season leads with what MyAnimeList says is popular', () => {
  const bucket = [
    record('Clevatess II', { sc: 10 }),
    record('Mushoku Tensei III', { sc: 8.96, pop: 254_638 }),
    record('Youjo Senki II', { sc: 8.44, pop: 233_645 }),
  ]

  expect(orderSeasonBucket(bucket).map(entry => entry.t))
    .toEqual(['Mushoku Tensei III', 'Youjo Senki II', 'Clevatess II'])
})

test('a record with no member count falls behind every record that has one, however it is rated', () => {
  const bucket = [record('Rated Ten', { sc: 10 }), record('Modest But Watched', { pop: 500 })]

  expect(orderSeasonBucket(bucket).map(entry => entry.t), 'a 10 from three votes is not popularity')
    .toEqual(['Modest But Watched', 'Rated Ten'])
})

test('with no member counts at all the rating still orders, so a failed popularity fetch degrades', () => {
  const bucket = [record('Unrated'), record('Well Rated', { sc: 9 }), record('Fairly Rated', { sc: 7 })]

  expect(orderSeasonBucket(bucket).map(entry => entry.t))
    .toEqual(['Well Rated', 'Fairly Rated', 'Unrated'])
})
