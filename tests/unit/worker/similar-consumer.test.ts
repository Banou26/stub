// The worker's asks of `similarMedia`: on a run's page, with the CLUSTER's evidence, per (run cluster,
// container) pair, re-asked only when the question changes, and the answer claimed as SAME_AS of the
// run once its title names our show, while the container edge stays. Fixtures in the shape of
// container-page.test.ts; the ask is recorded so the exact input the answering source would read can
// be asserted.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { SimilarOutcome } from '../../../src/sources/similar'

import { closeRoot, openRoot, type RequestContext } from '../../../src/worker/request-context'
import { MAX_ASKS_PER_PAIR, planSimilarAsks, resetSimilarAsks, resolveSimilarRuns, runEvidence } from '../../../src/worker/similar-consumer'
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

/** three more titled episodes on anilist:1, which is the evidence Rule 2 reads and a new fingerprint */
const addEpisodeTitles = () =>
  upsertEpisodes(
    [episode('anilist:1-3', 'anilist:1', 'Gamma'), episode('anilist:1-4', 'anilist:1', 'Delta'), episode('anilist:1-5', 'anilist:1', 'Epsilon')],
    []
  )

const episodeTitlesOfCall = (ask: ReturnType<typeof vi.fn>, index: number) =>
  ((ask.mock.calls[index] as unknown as [string, { episodeTitles?: string[] }])[1].episodeTitles ?? [])

// the real answer carries the row's titles, which the consumer reads to check the show
const ANSWER = { uri: 'cr:X-S3', origin: 'cr', id: 'X-S3', scope: 'RUN', titles: [{ title: 'Show' }] }
const answered = (media: typeof ANSWER = ANSWER): SimilarOutcome => ({ outcome: 'answered', media })
const REFUSED: SimilarOutcome = { outcome: 'refused', reason: 'null' }
const implemented = (origin: string) => origin === 'cr' || origin === 'nf'
const recorder = () => vi.fn(async (): Promise<SimilarOutcome> => answered())
/** an origin that cannot place the run */
const refuser = () => vi.fn(async (): Promise<SimilarOutcome> => REFUSED)
/** an ask that never reached the source */
const decliner = (reason: 'ceiling' | 'timeout' | 'error') => vi.fn(async (): Promise<SimilarOutcome> => ({ outcome: 'declined', reason }))

let root: RequestContext
beforeEach(() => {
  resetStore()
  resetSimilarAsks()
  root = openRoot('MEDIA')
  return () => closeRoot(root.rootId)
})
// a test failing before its own mockRestore would hand its console spy, calls included, to the next
afterEach(() => vi.restoreAllMocks())

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
  expect(ask, 'growing with no new evidence is the same question, so it is not asked again').toHaveBeenCalledTimes(1)
})

test('a refusal on partial evidence is asked again when the evidence changes, and not before', async () => {
  const cluster = await storeRun()
  const ask = refuser()

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await resolveSimilarRuns(cluster, root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)

  await addEpisodeTitles()
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'five episode titles is a new question').toHaveBeenCalledTimes(2)
  expect(episodeTitlesOfCall(ask, 1)).toHaveLength(5)

  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'and the same five is the same question').toHaveBeenCalledTimes(2)
})

test('a ceiling decline is retried on the next read with the same evidence', async () => {
  const cluster = await storeRun()
  const ask = decliner('ceiling')

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await resolveSimilarRuns(cluster, root, { ask, implemented })
  expect(ask, 'a decline never reached the source, so nothing about the evidence was learned').toHaveBeenCalledTimes(3)
})

test('an answer ends the asking for that pair', async () => {
  const cluster = await storeRun()
  const ask = recorder()

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)

  await addEpisodeTitles()
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'new evidence about a settled pair asks nothing').toHaveBeenCalledTimes(1)
})

test('asks per pair are capped', async () => {
  const cluster = await storeRun()
  const ask = decliner('timeout')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  for (let i = 0; i < 6; i++) await resolveSimilarRuns(cluster, root, { ask, implemented })

  expect(ask).toHaveBeenCalledTimes(MAX_ASKS_PER_PAIR)
  expect(warn.mock.calls.map(call => String(call[0]))).toContainEqual(expect.stringMatching(/^similarMedia: consumer settled cr X for anilist:1 \(cap 4 reached\)$/))
  warn.mockRestore()
})

test('two runs of one show keep their own records', async () => {
  const s1 = await storeRun()
  await upsertMedia(
    [media('anilist:5', 'RUN', { titles: ['Show Season 3'], startDate: '2026-07-04', episodeCount: 14 })],
    [{ mediaUri: 'anilist:5', handleUri: 'cr:X' }]
  )
  const s3 = await findAggregatedMedia('anilist:5')
  expect(uris(s3), 'the setup: season 3 is its own run under the same show').toEqual(['anilist:5'])
  const ask = refuser()

  await resolveSimilarRuns(s1, root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)
  await resolveSimilarRuns(s3, root, { ask, implemented })
  expect(ask, 'another run of the show is another question').toHaveBeenCalledTimes(2)
  await resolveSimilarRuns(s1, root, { ask, implemented })
  expect(ask, 'season 3 being asked did not forget season 1 was').toHaveBeenCalledTimes(2)
})

test('a cold read with no evidence burns nothing', async () => {
  await upsertMedia(
    [{ ...media('mal:3', 'RUN', { titles: [] }), titles: [], categories: ['ANIME'] }, media('cr:Z', 'CONTAINER')],
    [{ mediaUri: 'mal:3', handleUri: 'cr:Z' }]
  )
  const ask = recorder()

  await resolveSimilarRuns(await findAggregatedMedia('mal:3'), root, { ask, implemented })
  expect(ask).not.toHaveBeenCalled()

  await upsertMedia(
    [media('kitsu:4', 'RUN', { titles: ['Show'], startDate: '2026-07-04', episodeCount: 12 })],
    [{ mediaUri: 'mal:3', handleUri: 'kitsu:4' }]
  )
  await resolveSimilarRuns(await findAggregatedMedia('mal:3'), root, { ask, implemented })
  expect(ask, 'the first read holding evidence is the first ask').toHaveBeenCalledTimes(1)
})

test('one ask in flight per pair, and evidence that lands meanwhile is asked once it settles', async () => {
  const cluster = await storeRun()
  let settleFirst!: (outcome: SimilarOutcome) => void
  const pending = new Promise<SimilarOutcome>(resolve => { settleFirst = resolve })
  const ask = vi.fn(async (): Promise<SimilarOutcome> => REFUSED).mockImplementationOnce(() => pending)

  const first = resolveSimilarRuns(cluster, root, { ask, implemented })
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1))

  await addEpisodeTitles()
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'the pair has an ask in flight, so the new evidence waits').toHaveBeenCalledTimes(1)

  settleFirst(REFUSED)
  await first
  expect(ask, 'the evidence that landed meanwhile is asked once the first settles').toHaveBeenCalledTimes(2)
  expect(episodeTitlesOfCall(ask, 1)).toHaveLength(5)
})

test('a run with no titles is not asked until a title lands', async () => {
  await upsertMedia(
    [{ ...media('mal:3', 'RUN', { titles: [], startDate: '2026-07-04', episodeCount: 12 }), titles: [], categories: ['ANIME'] }, media('cr:Z', 'CONTAINER')],
    [{ mediaUri: 'mal:3', handleUri: 'cr:Z' }]
  )
  const ask = recorder()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await resolveSimilarRuns(await findAggregatedMedia('mal:3'), root, { ask, implemented })
  expect(ask, 'an answer could not be checked against the show').toHaveBeenCalledTimes(0)
  expect(warn.mock.calls.map(call => String(call[0])).filter(text => /^similarMedia: consumer skipped /.test(text))).toHaveLength(1)

  await upsertMedia([media('kitsu:4', 'RUN', { titles: ['Show'] })], [{ mediaUri: 'mal:3', handleUri: 'kitsu:4' }])
  await resolveSimilarRuns(await findAggregatedMedia('mal:3'), root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)
  warn.mockRestore()
})

test('an answer titled for another show is refused, and the same titles do not ask again', async () => {
  const cluster = await storeRun()
  const ask = vi.fn(async (): Promise<SimilarOutcome> => answered({ ...ANSWER, titles: [{ title: 'Grand Blue Dreaming' }] }))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await upsertMedia([media('cr:X-S3', 'RUN', { titles: ['Grand Blue Dreaming'] })], [])

  expect(uris(await findAggregatedMedia('anilist:1')), 'a season of another show is never our run').toEqual(['anilist:1', 'kitsu:2'])
  expect(warn.mock.calls.map(call => String(call[0])))
    .toContainEqual(expect.stringMatching(/^similarMedia: consumer refused-by-title cr:X-S3 for anilist:1 \(best 0\.\d{3} of 1 run titles against 1 answer titles, threshold 0\.9\); re-asks on a new title$/))

  await addEpisodeTitles()
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'more evidence about the SEASON cannot change the show the answer names').toHaveBeenCalledTimes(1)
  warn.mockRestore()
})

// The real Mushoku Tensei shapes. A cold page's first read is routinely ONE source's row, and kitsu's
// carries the romaji title alone, which scores 0.441 against Crunchyroll's English series title
// (measured 2026-09-05; the native title scores 0.005). Settling the pair on that refusal made the
// recall gap permanent: the English title landing a moment later could never reopen it.
const ENGLISH = 'Mushoku Tensei: Jobless Reincarnation Season 3'
const ROMAJI = 'Mushoku Tensei III: Isekai Ittara Honki Dasu'
const NATIVE = '無職転生 Ⅲ ～異世界行ったら本気だす～'
const CR_SEASON_3 = { uri: 'cr:G24H1N3MP-GS00374452', origin: 'cr', id: 'G24H1N3MP-GS00374452', scope: 'RUN', titles: [{ title: 'Mushoku Tensei: Jobless Reincarnation' }] }

test('a title landing after a refusal by title asks again, and the English title is what passes', async () => {
  await upsertMedia(
    [media('kitsu:49002', 'RUN', { score: 0.3, titles: [ROMAJI], startDate: '2026-07-04', episodeCount: 14 }), media('cr:G24H1N3MP', 'CONTAINER')],
    [{ mediaUri: 'kitsu:49002', handleUri: 'cr:G24H1N3MP' }]
  )
  const ask = vi.fn(async (): Promise<SimilarOutcome> => answered(CR_SEASON_3))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await resolveSimilarRuns(await findAggregatedMedia('kitsu:49002'), root, { ask, implemented })
  await resolveSimilarRuns(await findAggregatedMedia('kitsu:49002'), root, { ask, implemented })
  expect(ask, 'the romaji title alone refuses the answer, and the same title is not asked again').toHaveBeenCalledTimes(1)
  expect(warn.mock.calls.map(call => String(call[0])).filter(text => /^similarMedia: consumer refused-by-title /.test(text))).toHaveLength(1)

  await upsertMedia(
    [media('anilist:178789', 'RUN', { score: 0.8, titles: [ENGLISH, ROMAJI, NATIVE], startDate: '2026-07-04', episodeCount: 14 })],
    [{ mediaUri: 'anilist:178789', handleUri: 'kitsu:49002' }]
  )
  await resolveSimilarRuns(await findAggregatedMedia('kitsu:49002'), root, { ask, implemented })
  expect(ask, 'a new title is a new question').toHaveBeenCalledTimes(2)
  await upsertMedia([media('cr:G24H1N3MP-GS00374452', 'RUN', { titles: ['Mushoku Tensei: Jobless Reincarnation'], startDate: '2026-07-04', episodeCount: 14 })], [])
  expect(uris(await findAggregatedMedia('kitsu:49002'))).toEqual(['anilist:178789', 'cr:G24H1N3MP-GS00374452', 'kitsu:49002'])
  warn.mockRestore()
})

// Two clusters of one show under one container, unioned while the second's ask is in flight. The
// survivor copied the other's in-flight flag, the other's driver cleared its own on settle, and the
// merged pair sat "in flight" for the session with nothing to say about it (2026-09-05).
test('a record absorbed while its ask is in flight does not leave the merged pair stuck', async () => {
  const a = await storeRun()
  await upsertMedia(
    [media('mal:7', 'RUN', { titles: ['Show'], startDate: '2026-07-04', episodeCount: 12 })],
    [{ mediaUri: 'mal:7', handleUri: 'cr:X' }]
  )
  const b = await findAggregatedMedia('mal:7')
  expect(uris(b), 'the setup: a second cluster under the same show').toEqual(['mal:7'])
  let settleB!: (outcome: SimilarOutcome) => void
  const pending = new Promise<SimilarOutcome>(resolve => { settleB = resolve })
  const ask = vi.fn(async (): Promise<SimilarOutcome> => REFUSED)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await resolveSimilarRuns(a, root, { ask, implemented })
  expect(ask).toHaveBeenCalledTimes(1)
  ask.mockImplementationOnce(() => pending)
  const inFlight = resolveSimilarRuns(b, root, { ask, implemented })
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))

  await upsertMedia([], [{ mediaUri: 'anilist:1', handleUri: 'mal:7' }])
  const merged = await findAggregatedMedia('anilist:1')
  expect(uris(merged)).toEqual(['anilist:1', 'kitsu:2', 'mal:7'])
  await resolveSimilarRuns(merged, root, { ask, implemented })
  expect(warn.mock.calls.map(call => String(call[0]))).toContainEqual('similarMedia: consumer merged 2 records under cr:X (3 members)')
  settleB(REFUSED)
  await inFlight
  expect(ask, 'the merged question was already refused for the survivor, so it is not asked again').toHaveBeenCalledTimes(2)

  await addEpisodeTitles()
  await resolveSimilarRuns(await findAggregatedMedia('anilist:1'), root, { ask, implemented })
  expect(ask, 'nothing is in flight any more, and the evidence is new: the merged pair must be asked').toHaveBeenCalledTimes(3)
  warn.mockRestore()
})

// Two callers can name one origin's run for one cluster: anilist's own mapping claims by its day-precise
// date while the consumer's ask is still in flight on weaker evidence. Nothing compared the two, so a
// second season of one origin could land in one cluster, which is two seasons welded.
test('an answer arriving after another run of its origin joined the cluster is refused', async () => {
  const cluster = await storeRun()
  let settle!: (outcome: SimilarOutcome) => void
  const pending = new Promise<SimilarOutcome>(resolve => { settle = resolve })
  const ask = vi.fn((): Promise<SimilarOutcome> => pending)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const first = resolveSimilarRuns(cluster, root, { ask, implemented })
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
  await upsertMedia([media('cr:X-S1', 'RUN', { titles: ['Show'] })], [{ mediaUri: 'anilist:1', handleUri: 'cr:X-S1' }])
  settle(answered())
  await first
  await upsertMedia([media('cr:X-S3', 'RUN', { titles: ['Show'] })], [])

  expect(uris(await findAggregatedMedia('anilist:1')), 'one origin, one run per cluster').toEqual(['anilist:1', 'cr:X-S1', 'kitsu:2'])
  expect(warn.mock.calls.map(call => String(call[0])))
    .toContainEqual('similarMedia: consumer refused-by-origin cr:X-S3 for anilist:1 (cr:X-S1 is already the cluster\'s cr run)')
  warn.mockRestore()
})

test('a read during an in-flight ask says it deferred', async () => {
  const cluster = await storeRun()
  let settle!: (outcome: SimilarOutcome) => void
  const pending = new Promise<SimilarOutcome>(resolve => { settle = resolve })
  const ask = vi.fn((): Promise<SimilarOutcome> => pending)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const first = resolveSimilarRuns(cluster, root, { ask, implemented })
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
  await resolveSimilarRuns(cluster, root, { ask, implemented })
  expect(warn.mock.calls.map(call => String(call[0])))
    .toContainEqual('similarMedia: consumer deferred cr X for anilist:1 (an ask is in flight; asked when it settles if still new)')
  settle(REFUSED)
  await first
  warn.mockRestore()
})

test('an answer with no titles is refused', async () => {
  const cluster = await storeRun()
  const ask = vi.fn(async (): Promise<SimilarOutcome> => answered({ ...ANSWER, titles: [] }))

  await resolveSimilarRuns(cluster, root, { ask, implemented })
  await upsertMedia([media('cr:X-S3', 'RUN', { startDate: '2026-07-04', episodeCount: 14 })], [])

  expect(uris(await findAggregatedMedia('anilist:1')), 'an answer that cannot be checked is not verified').toEqual(['anilist:1', 'kitsu:2'])
})

test('the consumer says what it did, one line per decision', async () => {
  const cluster = await storeRun()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await resolveSimilarRuns(cluster, root, { ask: recorder(), implemented })

  expect(warn.mock.calls.map(call => String(call[0])).filter(text => /^similarMedia: consumer/.test(text))).toEqual([
    'similarMedia: consumer asked cr X for anilist:1 (ask 1 of 4) with {day:2026-07-04, count:12, ordinals:-, parts:no, titles:1, episodeTitles:2}',
    'similarMedia: consumer claimed cr:X-S3 as SAME_AS of anilist:1',
  ])
  warn.mockRestore()
})

test('an origin that does not implement the field, or already has a run in the cluster, is never asked', async () => {
  const cluster = await storeRun()
  const asks = planSimilarAsks(cluster, findPartOfMedia(cluster), implemented)
  expect(asks.map(ask => ask.origin), 'imdb answers nothing, so it is not asked').toEqual(['cr'])

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

test('a refusal claims nothing', async () => {
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
