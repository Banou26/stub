import { expect, test } from 'vitest'

import { airedDate } from './aired-date'

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)
const schedule = (nodes: { airingAt: number, episode?: number }[]) => ({ edges: nodes.map(node => ({ node })) })

// A complete FuzzyDate is AniList's own answer and beats everything else.
test('a complete fuzzy date wins outright', () => {
  const date = airedDate({ year: 2016, month: 4, day: 7 }, undefined, 'first')
  expect(new Date(date!).toISOString()).toBe('2016-04-07T00:00:00.000Z')
})

// THE BUG THIS EXISTS FOR. airingSchedule lists what is still SCHEDULED, so for a show four episodes
// into its run edges[0] is episode 5, and reading it by position dated the media in the future.
test('the schedule is read by episode number, never by position', () => {
  const date = airedDate(
    { year: 2016, month: null, day: null },
    schedule([
      { airingAt: at('2016-05-05T00:00:00Z'), episode: 5 },
      { airingAt: at('2016-05-12T00:00:00Z'), episode: 6 },
      { airingAt: at('2016-04-07T00:00:00Z'), episode: 1 },
    ]),
    'first'
  )
  expect(new Date(date!).toISOString()).toBe('2016-04-07T00:00:00.000Z')
})

// and when no node says it is episode 1, the earliest time is still better than the first slot
test('with no episode 1 in the schedule the earliest airing wins', () => {
  const date = airedDate(
    { year: 2016, month: null, day: null },
    schedule([
      { airingAt: at('2016-05-05T00:00:00Z'), episode: 5 },
      { airingAt: at('2016-04-21T00:00:00Z'), episode: 3 },
    ]),
    'first'
  )
  expect(new Date(date!).toISOString()).toBe('2016-04-21T00:00:00.000Z')
})

test('the last end reads the latest airing, not the last slot', () => {
  const date = airedDate(
    undefined,
    schedule([
      { airingAt: at('2016-06-30T00:00:00Z'), episode: 12 },
      { airingAt: at('2016-05-05T00:00:00Z'), episode: 5 },
    ]),
    'last'
  )
  expect(new Date(date!).toISOString()).toBe('2016-06-30T00:00:00.000Z')
})

// THE OTHER HALF OF THE BUG. A finished show has no schedule left, and the old code emitted nothing at
// all for 42% of entries. A cluster with no date carries no year, and fuzzyMergeMediaClusters only
// compares clusters sharing a year, so it was never compared with anything and silently never merged.
test('a finished show with no schedule still gets its date from the fuzzy date', () => {
  const date = airedDate({ year: 1998, month: 4, day: 3 }, { edges: [] }, 'first')
  expect(new Date(date!).toISOString()).toBe('1998-04-03T00:00:00.000Z')
})

// A year alone still buckets correctly, and January 1 is the shape every other source in this codebase
// uses for a year it cannot refine, which is what the precision guards elsewhere look for.
test('a year-only fuzzy date is coerced rather than dropped', () => {
  const date = airedDate({ year: 1998, month: null, day: null }, undefined, 'first')
  expect(new Date(date!).toISOString()).toBe('1998-01-01T00:00:00.000Z')
})

test('nothing at all is undefined, never a guess', () => {
  expect(airedDate(undefined, undefined, 'first')).toBeUndefined()
  expect(airedDate({ year: null, month: null, day: null }, { edges: [] }, 'first')).toBeUndefined()
})

// an edge carrying no airingAt is not a date, and must not be counted as one
test('schedule entries with no time are skipped', () => {
  const date = airedDate(
    { year: 2016, month: null, day: null },
    { edges: [{ node: { airingAt: null, episode: 1 } }, { node: { airingAt: at('2016-04-07T00:00:00Z'), episode: 2 } }] },
    'first'
  )
  expect(new Date(date!).toISOString()).toBe('2016-04-07T00:00:00.000Z')
})
