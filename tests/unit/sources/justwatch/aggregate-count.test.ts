// An aggregated media ALWAYS carries `episodes: []` (aggregateMedia fills that field from a separate
// resolver), so `media.episodeCount ?? media.episodes?.length` read a cluster that declares no count
// as a run of ZERO episodes. Zero is a count, not an absence: `foldVetoed` then refuses every
// candidate season longer than it, which is all of them, and the refusal looks exactly like "this
// source has nothing" (docs/design-inputs/01-edge-cases.md case 23).
//
// JustWatch reads the cluster twice, on both paths that name a season: the media path for a uri that
// already carries a `jw:` id, and the search path for one that does not. Both are pinned on what the
// shared picker is HANDED, which is what each site exposes.
import { expect, test, vi } from 'vitest'

import type { RunEvidence } from '../../../../src/sources/similar'

const asked = vi.hoisted(() => [] as RunEvidence[])

// the real rules, with every evidence object they are handed recorded on the way in
vi.mock('../../../../src/sources/similar', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/sources/similar')>()
  return {
    ...actual,
    pickSimilarSeason: (evidence: RunEvidence, candidates: Parameters<typeof actual.pickSimilarSeason>[1]) => {
      asked.push(evidence)
      return actual.pickSimilarSeason(evidence, candidates)
    }
  }
})

const { resolvers } = await import('../../../../src/sources/justwatch/extractor')

const JW_API = 'https://apis.justwatch.com/graphql'

const season = (objectId: number, seasonNumber: number, totalEpisodeCount = 12) => ({
  id: `s${objectId}`,
  objectId,
  totalEpisodeCount,
  content: { title: `Season ${seasonNumber}`, seasonNumber, isReleased: true, originalReleaseYear: 2020 + seasonNumber },
  episodes: [],
})

const node = {
  id: 'ts12345',
  objectId: 12345,
  objectType: 'SHOW',
  content: {
    title: 'A Show With Several Seasons',
    fullPath: '/us/tv-show/a-show',
    posterUrl: null,
    shortDescription: 'A show.',
    originalReleaseYear: 2021,
  },
  offers: [],
  extraOffers: [],
  seasons: [season(111, 2), season(222, 3)],
}

const context = (nodes: Record<string, unknown>[], known: unknown) => ({
  findAggregatedMedia: async () => known,
  listenForMediaChanges: async function* () {},
  fetch: async (url: string, init?: { body?: string }) => {
    if (url !== JW_API) throw new Error(`fixture has no route for ${url}`)
    const body = init?.body ?? ''
    if (body.includes('GetSearchTitles')) {
      return { json: async () => ({ data: { popularTitles: { edges: nodes.map(entry => ({ node: entry })) } } }) }
    }
    const nodeId = JSON.parse(body).variables.nodeId
    const match = nodes.find(candidate => candidate.id === nodeId)
    if (!match) throw new Error(`fixture has no node ${nodeId}`)
    return { json: async () => ({ data: { node: match } }) }
  },
}) as never

const evidenceFor = async (uri: string, known: unknown): Promise<RunEvidence> => {
  asked.length = 0
  const subscribe = (resolvers.Subscription as any).media.subscribe
  await subscribe(undefined, { input: { uri } }, context([node], known)).next()
  expect(asked, 'the picker was never asked, so this test could not see what it was handed').not.toHaveLength(0)
  return asked[0]!
}

// THE MEDIA PATH: `resolveSeasonNumber`, for a uri that already names a jw id.
const PINNED = 'ag:(anilist:1,jw:12345)'

test('the media path hands the picker an unknown count for a cluster that declares none', async () => {
  const evidence = await evidenceFor(PINNED, {
    titles: [{ title: 'A Show With Several Seasons' }],
    // what aggregateMedia emits for a cluster whose sources published no count
    episodeCount: null,
    episodes: [],
  })

  expect(evidence.episodeCount, 'zero vetoes both of these seasons, which hold 12 each').toBeUndefined()
})

test('control: the media path still hands the picker a declared count', async () => {
  const evidence = await evidenceFor(PINNED, {
    titles: [{ title: 'A Show With Several Seasons' }],
    episodeCount: 12,
    episodes: [],
  })

  expect(evidence.episodeCount).toBe(12)
})

// THE SEARCH PATH: no `jw:` in the uri, so the show is found by title and its season picked from the
// same evidence. It needs a start date to get past the catalogue gate, which is why one is set here.
const SEARCHED = 'ag:(anilist:999)'

test('the search path hands the picker an unknown count for a cluster that declares none', async () => {
  const evidence = await evidenceFor(SEARCHED, {
    uri: SEARCHED,
    titles: [{ title: 'A Show With Several Seasons' }],
    startDate: '2023-04-10',
    episodeCount: null,
    episodes: [],
  })

  expect(evidence.episodeCount).toBeUndefined()
})

test('control: the search path still hands the picker a declared count', async () => {
  const evidence = await evidenceFor(SEARCHED, {
    uri: SEARCHED,
    titles: [{ title: 'A Show With Several Seasons' }],
    startDate: '2023-04-10',
    episodeCount: 12,
    episodes: [],
  })

  expect(evidence.episodeCount).toBe(12)
})
