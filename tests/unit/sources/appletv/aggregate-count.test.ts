// An aggregated media ALWAYS carries `episodes: []` (aggregateMedia fills that field from a separate
// resolver), so `media.episodeCount ?? media.episodes?.length` read a cluster that declares no count
// as a run of ZERO episodes. Zero is a count, not an absence: `foldVetoed` then refuses every
// candidate season longer than it, which is all of them, and the refusal looks exactly like "this
// source has nothing" (docs/design-inputs/01-edge-cases.md case 23).
//
// What this site exposes is what the picker is HANDED, so that is what is pinned here. Apple vouches
// for no season count, so its own candidates carry none and the veto has nothing to fire on; the
// evidence is still the contract, and the next source's candidates do carry counts.
import { expect, test, vi } from 'vitest'

import type { ExtractorServerContext } from '../../../../src/worker/extractor'
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

const { resolvers } = await import('../../../../src/sources/appletv/extractor')

const ATV = 'https://uts-api.itunes.apple.com/uts/v3'
const PARAMS = 'caller=web&sf=143441&v=58&pfm=web&locale=en-US&utsk=0'
const url = (path: string) => `${ATV}${path}${path.includes('?') ? '&' : '?'}${PARAMS}`

const SHOW = 'umc.cmc.show'
const SEASON_1 = 'umc.cmc.show.season1'
const SEASON_2 = 'umc.cmc.show.season2'

const showRoutes = () => ({
  [url(`/shows/${SHOW}`)]: {
    data: {
      content: { id: SHOW, type: 'Show', title: 'A Show', releaseDate: Date.UTC(2021, 0, 11) },
      seasons: {
        [SEASON_1]: { id: SEASON_1, seasonNumber: 1, releaseDate: Date.UTC(2021, 0, 11) },
        [SEASON_2]: { id: SEASON_2, seasonNumber: 2, releaseDate: Date.UTC(2023, 3, 3) },
      },
    },
  },
  [url(`/shows/${SHOW}/episodes?selectedSeasonId=${SEASON_1}`)]: {
    data: { episodes: [{ id: 'ep-1-1', title: 'S1E1', seasonNumber: 1, episodeNumber: 1 }] },
  },
  [url(`/shows/${SHOW}/episodes?selectedSeasonId=${SEASON_2}`)]: {
    data: { episodes: [{ id: 'ep-2-1', title: 'S2E1', seasonNumber: 2, episodeNumber: 1 }] },
  },
})

const ctxFor = (known: unknown): ExtractorServerContext => ({
  fetch: (async (input: string) => {
    const table = showRoutes() as Record<string, unknown>
    const key = typeof input === 'string' ? input : String(input)
    if (!(key in table)) throw new Error(`unstubbed url: ${key}`)
    return { json: async () => table[key], ok: true, status: 200 }
  }) as unknown as ExtractorServerContext['fetch'],
  findAggregatedMedia: async () => known,
  listenForMediaChanges: async function* () {},
} as unknown as ExtractorServerContext)

const evidenceFor = async (known: unknown): Promise<RunEvidence> => {
  asked.length = 0
  const subscribe = (resolvers.Subscription as any).media.subscribe
  await subscribe(undefined, { input: { uri: `appletv:${SHOW}` } }, ctxFor(known)).next()
  expect(asked, 'the picker was never asked, so this test could not see what it was handed').toHaveLength(1)
  return asked[0]!
}

test('a cluster declaring no count reaches the picker as an unknown count, never as zero', async () => {
  const evidence = await evidenceFor({
    titles: [{ title: 'A Show' }],
    startDate: '2023-04-10',
    // what aggregateMedia emits for a cluster whose sources published no count
    episodeCount: null,
    episodes: [],
  })

  expect(evidence.episodeCount, 'zero would veto every candidate season longer than it').toBeUndefined()
})

test('control: a cluster that declares a count still hands the picker that count', async () => {
  const evidence = await evidenceFor({
    titles: [{ title: 'A Show' }],
    startDate: '2023-04-10',
    episodeCount: 8,
    episodes: [],
  })

  expect(evidence.episodeCount).toBe(8)
})
