// The worker's one ask of `similarMedia`: on a run's page, with the CLUSTER's evidence, once per
// (run cluster, container origin) per session, and the answer claimed as SAME_AS of the run while the
// container edge stays. Fixtures in the shape of container-page.test.ts; the ask is recorded so the
// exact input the answering source would read can be asserted.
import { beforeEach, expect, test, vi } from 'vitest'

import { closeRoot, openRoot, type RequestContext } from '../../../src/worker/request-context'
import { planSimilarAsks, resetSimilarAsks, resolveSimilarRuns, runEvidence } from '../../../src/worker/similar-consumer'
import { findAggregatedMedia, findPartOfMedia, resetStore, upsertEpisodes, upsertMedia } from '../../../src/worker/store/db'

const media = (
  uri: string,
  scope: 'RUN' | 'CONTAINER',
  fields: { score?: number, startDate?: string | null, episodeCount?: number | null, titles?: string[] } = {}
) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  titles: (fields.titles ?? [uri]).map(title => ({ language: 'en', title, score: 1 })),
  startDate: fields.startDate ?? null,
  episodeCount: fields.episodeCount ?? null,
  score: fields.score ?? null,
  scope,
}) as any

const episode = (uri: string, mediaUri: string, title: string) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  mediaUri,
  titles: [{ language: 'en', title, score: 1 }],
  episodeNumber: 1,
}) as any

const uris = (medias: { uri: string }[]) => medias.map(m => m.uri).sort()

/** anilist:1 and kitsu:2, one run, PART_OF a crunchyroll series and an imdb title, with two episodes */
const storeRun = async () => {
  await upsertMedia(
    [
      media('anilist:1', 'RUN', { score: 0.8, startDate: '2026-01-01', episodeCount: 12, titles: ['Show', 'Season 3'] }),
      media('kitsu:2', 'RUN', { score: 0.3, startDate: '2026-07-04', episodeCount: 14, titles: ['Show'] }),
      media('cr:X', 'CONTAINER'),
      media('imdb:tt1', 'CONTAINER'),
    ],
    [
      { mediaUri: 'anilist:1', handleUri: 'kitsu:2' },
      { mediaUri: 'anilist:1', handleUri: 'cr:X' },
      { mediaUri: 'kitsu:2', handleUri: 'imdb:tt1' },
    ]
  )
  await upsertEpisodes([episode('anilist:1-1', 'anilist:1', 'Alpha'), episode('anilist:1-2', 'anilist:1', 'Beta')], [])
  return findAggregatedMedia('anilist:1')
}

const ANSWER = { uri: 'cr:X-S3', origin: 'cr', id: 'X-S3', scope: 'RUN' }
const implemented = (origin: string) => origin === 'cr' || origin === 'nf'
const recorder = () => vi.fn(async () => ANSWER)
/** an origin that cannot place the run */
const refuser = () => vi.fn(async (): Promise<typeof ANSWER | undefined> => undefined)

let root: RequestContext
beforeEach(() => {
  resetStore()
  resetSimilarAsks()
  root = openRoot('MEDIA')
  return () => closeRoot(root.rootId)
})

test('a run page asks each answering container origin once, with the cluster\'s evidence', async () => {
  const cluster = await storeRun()
  const ask = recorder()

  await resolveSimilarRuns(cluster, root, { ask, implemented })

  expect(ask).toHaveBeenCalledTimes(1)
  const [origin, input] = ask.mock.calls[0] as unknown as [string, Record<string, unknown>]
  expect(origin).toBe('cr')
  expect(input.showId).toBe('X')
  expect(input.titles, 'a bare season label names a position, never the run').toEqual(['Show'])
  expect(input.startDate, 'the day-precise date, not the higher-scored January 1').toBe('2026-07-04')
  expect(input.episodeCount, 'the highest-scored count').toBe(12)
  expect(input.episodeTitles).toEqual(['Alpha', 'Beta'])
  expect(input.context, 'the page\'s own root, so the callee reads a MEDIA hop').toBe(root)
})

test('the answer lands as SAME_AS of the run once its row arrives, and the container edge stays', async () => {
  const cluster = await storeRun()
  await resolveSimilarRuns(cluster, root, { ask: recorder(), implemented })

  // the answering extractor's own insertion, which the deferred claim has been waiting for
  await upsertMedia([media('cr:X-S3', 'RUN', { startDate: '2026-07-04', episodeCount: 14 })], [])

  const merged = await findAggregatedMedia('anilist:1')
  expect(uris(merged)).toEqual(['anilist:1', 'cr:X-S3', 'kitsu:2'])
  expect(uris(findPartOfMedia(merged)), 'the edge to the show is untouched').toEqual(['cr:X', 'imdb:tt1'])
})

test('a cluster is asked once per session, and growing does not re-ask', async () => {
  const cluster = await storeRun()
  const ask = refuser()

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)

  await upsertMedia([media('mal:9', 'RUN')], [{ mediaUri: 'anilist:1', handleUri: 'mal:9' }])
  const grown = await findAggregatedMedia('anilist:1')
  expect(uris(grown)).toContain('mal:9')
  await resolveSimilarRuns(grown, root, { ask, implemented })
  expect(ask, 'membership only grows, so any shared member means already asked').toHaveBeenCalledTimes(1)
})

test('an origin that does not implement the field, or already has a run in the cluster, is never asked', async () => {
  const cluster = await storeRun()
  const asks = planSimilarAsks(cluster, findPartOfMedia(cluster), implemented)
  expect(asks.map(ask => ask.origin), 'imdb answers nothing, so it is not asked').toEqual(['cr'])

  resetSimilarAsks()
  await upsertMedia([media('cr:X-S1', 'RUN')], [{ mediaUri: 'anilist:1', handleUri: 'cr:X-S1' }])
  const withRun = await findAggregatedMedia('anilist:1')
  expect(planSimilarAsks(withRun, findPartOfMedia(withRun), implemented), 'the cluster already holds a cr run').toEqual([])
})

test('a container-only cluster asks nothing, and so does a run with no evidence', async () => {
  await upsertMedia([media('tvmaze:7', 'CONTAINER'), media('cr:Y', 'CONTAINER')], [{ mediaUri: 'tvmaze:7', handleUri: 'cr:Y' }])
  const ask = recorder()
  await resolveSimilarRuns(await findAggregatedMedia('tvmaze:7'), root, { ask, implemented })
  expect(ask).not.toHaveBeenCalled()

  await upsertMedia(
    [{ ...media('mal:3', 'RUN', { titles: [] }), titles: [], categories: ['ANIME'] }, media('cr:Z', 'CONTAINER')],
    [{ mediaUri: 'mal:3', handleUri: 'cr:Z' }]
  )
  const bare = await findAggregatedMedia('mal:3')
  expect(runEvidence(bare, []), 'the setup: nothing to say about the run').toEqual({ titles: [], startDate: undefined, episodeCount: undefined, episodeTitles: [] })
  await resolveSimilarRuns(bare, root, { ask, implemented })
  expect(ask).not.toHaveBeenCalled()
})

test('an undefined answer claims nothing', async () => {
  const cluster = await storeRun()
  await resolveSimilarRuns(cluster, root, { ask: refuser(), implemented })
  await upsertMedia([media('cr:X-S3', 'RUN', { startDate: '2026-07-04' })], [])

  expect(uris(await findAggregatedMedia('anilist:1'))).toEqual(['anilist:1', 'kitsu:2'])
  expect(uris(await findAggregatedMedia('cr:X-S3')), 'the row is its own cluster').toEqual(['cr:X-S3'])
})

// The policy gate. Only `Subscription.media` calls this, so a listing never reaches it by
// construction; the gate is what makes that a property of the consumer rather than of its one caller.
test('a listing root never asks', async () => {
  const cluster = await storeRun()
  const listing = openRoot('MEDIA_PAGE')
  const ask = recorder()

  await resolveSimilarRuns(cluster, listing, { ask, implemented })
  expect(ask).not.toHaveBeenCalled()

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  expect(ask, 'and the refused listing did not count as asked').toHaveBeenCalledTimes(1)
  closeRoot(listing.rootId)
})
