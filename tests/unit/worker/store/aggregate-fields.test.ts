// Carrying a field through aggregation takes THREE separate edits: `mediaToGQL`, which the one-row
// path returns whole, and the reduce over a multi-row cluster, which has to say per field whether the
// highest-scored source wins it or the cluster unions it. Missing any one is silent for a nullable
// field: no type error, no thrown read, just a page that filters to nothing because every row lost the
// season it was filtered on.
import { beforeEach, expect, test } from 'vitest'

import { aggregateMedia } from '../../../../src/worker/store/aggregate'
import { resetStore } from '../../../../src/worker/store/db'

const row = (uri: string, fields: Record<string, unknown> = {}) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  url: null,
  score: null,
  type: null,
  categories: [],
  status: null,
  titles: [],
  descriptions: [],
  shortDescriptions: [],
  trailers: [],
  covers: [],
  banners: [],
  season: null,
  seasonYear: null,
  genres: [],
  tags: [],
  scope: 'RUN',
  ...fields,
}) as any

beforeEach(() => { resetStore() })

test('a one-row cluster carries season, seasonYear, genres and tags through', () => {
  const aggregated = aggregateMedia([row('anilist:108465', {
    season: 'SUMMER', seasonYear: 2026, genres: ['Sci-Fi'], tags: ['Time Skip'],
  })], 'https://x')
  expect(aggregated.season).toBe('SUMMER')
  expect(aggregated.seasonYear).toBe(2026)
  expect(aggregated.genres).toEqual(['Sci-Fi'])
  expect(aggregated.tags).toEqual(['Time Skip'])
})

// Handed lowest-scored first on purpose: the sort inside aggregateMedia is what decides, never the
// caller's order, and passing them pre-sorted would pass with the sort deleted.
test('a cluster takes season and seasonYear from the highest-scored source that names one', () => {
  const anilist = row('anilist:108465', { score: 0.9, season: 'SUMMER', seasonYear: 2026 })
  const kitsu = row('kitsu:42323', { score: 0.5, season: 'FALL', seasonYear: 2025 })
  const aggregated = aggregateMedia([kitsu, anilist], 'https://x')
  expect(aggregated.season).toBe('SUMMER')
  expect(aggregated.seasonYear).toBe(2026)
})

// The season pair is quoted from ONE member, unlike every other scalar here, which is won field by
// field. SUMMER and 2026 only mean anything together, and store/filter.ts matches on both, so a pair
// assembled from two disagreeing members would answer a season page that no source put the media in.
test('the season pair comes from one source, not one field at a time', () => {
  const anilist = row('anilist:108465', { score: 0.9, season: null, seasonYear: 2026 })
  const kitsu = row('kitsu:42323', { score: 0.5, season: 'FALL', seasonYear: 2025 })
  const aggregated = aggregateMedia([kitsu, anilist], 'https://x')
  expect(aggregated.season, 'the only source that named one').toBe('FALL')
  expect(aggregated.seasonYear, 'its year, not the higher-scored source\u2019s').toBe(2025)
})

test('and the highest-scored source that names a season wins the whole pair', () => {
  const anilist = row('anilist:108465', { score: 0.9, season: 'SUMMER', seasonYear: 2026 })
  const kitsu = row('kitsu:42323', { score: 0.5, season: 'FALL', seasonYear: 2025 })
  const aggregated = aggregateMedia([kitsu, anilist], 'https://x')
  expect(aggregated.season).toBe('SUMMER')
  expect(aggregated.seasonYear).toBe(2026)
})

// A year on its own cannot be mixed with anything, so it is still won field by field: jikan publishes
// one for a film that has no season at all, and dropping it would cost the year filter that row.
test('a year with no season anywhere in the cluster is still carried', () => {
  const jikan = row('mal:1', { score: 0.9, season: null, seasonYear: 2026 })
  const kitsu = row('kitsu:2', { score: 0.5, season: null, seasonYear: null })
  const aggregated = aggregateMedia([kitsu, jikan], 'https://x')
  expect(aggregated.season).toBeNull()
  expect(aggregated.seasonYear).toBe(2026)
})

// Genres and tags are the one pair that UNIONS rather than being won, because a catalogue publishing
// three genres is not contradicting one publishing five, and a filter is only as good as the labels
// the cluster kept.
test('genres and tags union across a cluster', () => {
  const anilist = row('anilist:108465', { score: 0.9, genres: ['Sci-Fi', 'Action'], tags: ['Time Skip'] })
  const kitsu = row('kitsu:42323', { score: 0.5, genres: ['Comedy'], tags: ['Male Protagonist'] })
  const aggregated = aggregateMedia([kitsu, anilist], 'https://x')
  expect(aggregated.genres).toEqual(['Sci-Fi', 'Action', 'Comedy'])
  expect(aggregated.tags).toEqual(['Time Skip', 'Male Protagonist'])
})

// The same genre in two cases is one genre. Listed twice it reads as a bug in the chip row, and it
// doubles the list a user picks from.
test('genres and tags dedupe case-insensitively, keeping the highest-scored spelling', () => {
  const anilist = row('anilist:108465', { score: 0.9, genres: ['Sci-Fi'], tags: ['Time Skip'] })
  const kitsu = row('kitsu:42323', { score: 0.5, genres: ['sci-fi', 'Comedy'], tags: ['TIME SKIP'] })
  const aggregated = aggregateMedia([kitsu, anilist], 'https://x')
  expect(aggregated.genres).toEqual(['Sci-Fi', 'Comedy'])
  expect(aggregated.tags).toEqual(['Time Skip'])
})

// The three-edit rule this file opens with, applied to the field the search page's card and list modes
// lead with. Only AniList publishes a schedule, and it is NOT the highest-scored source in a cluster
// jikan also answered, so a field won by the top source alone would lose it on exactly the media that
// have one.
test('the next airing is carried through, from whichever source has one', () => {
  const airing = { episodeNumber: 11, airingAt: 'Sun, 06 Sep 2026 15:30:00 GMT' }

  const alone = aggregateMedia([row('anilist:1', { nextAiringEpisode: airing })], 'https://x')
  expect(alone.nextAiringEpisode).toEqual(airing)

  const jikan = row('mal:1', { score: 0.9, nextAiringEpisode: null })
  const anilist = row('anilist:1', { score: 0.8, nextAiringEpisode: airing })
  expect(aggregateMedia([jikan, anilist], 'https://x').nextAiringEpisode).toEqual(airing)
})

test('a cluster nobody scheduled anything for carries none', () => {
  const aggregated = aggregateMedia([row('mal:1', { score: 0.9 }), row('anilist:1', { score: 0.8 })], 'https://x')
  expect(aggregated.nextAiringEpisode ?? null).toBeNull()
})

/**
 * episodeCount is still resolved by SCORE ORDER here, and that is a deliberate stop rather than an
 * oversight. A weighted vote was written, wired in and MEASURED over the 100 cluster snapshot in
 * dist-seed on 2026-09-09: it returned the same number as this reduce in 100 of 100 clusters, 35 of
 * which disagree about their own length, so it bought nothing and carried a real failure class.
 *
 * The blocker is that `anizip` passes no score to its media row (0.9 on its titles and episodes, null
 * on the row), so the source with the most exact counts weighs ZERO in any vote. On a cluster like
 * `anizip(null)=12 cr(0.5)=10 kitsu(0.3)=12` the vote publishes 10, the same wrong answer as today
 * and for a worse reason. Scoring anizip is its own change with its own before/after, because it also
 * flips who wins status, startDate, type, averageScore, popularity and season everywhere.
 *
 * What DID ship is the same rule where it is safe: store/consensus.ts trims an episode list a longer
 * packaging brings, behind two witnesses and twice the weight. See projects/stub.md in the agent repo.
 */
