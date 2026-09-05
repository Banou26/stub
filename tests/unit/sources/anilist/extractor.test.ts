// The Crunchyroll mapper used to import crunchyroll's `matchSeasonByDate` and `getMedia`, so one source
// walked another's API from inside its own resolver: outside the worker's budget, deduplicated by
// nothing, and reading only the date rule. It now asks `ctx.similarMedia`, which is budgeted,
// deduplicated and verified in one place (worker/extractor.ts) and reads every rule in sources/similar.ts.
//
// Driven through the real `media` subscription so the request context travels the way the consumer
// stamps it: `similarMediaFrom` reads a real hop off `input.context` and descends it with 'anilist' on
// the chain, instead of counting a context miss.
import { afterEach, expect, test, vi } from 'vitest'

import { closeRoot, openRoot } from '../../../../src/worker/request-context'
import { resolvers } from '../../../../src/sources/anilist/extractor'

const ANILIST = 'https://graphql.anilist.co/'

const ENGLISH = 'Mushoku Tensei: Jobless Reincarnation Season 3'
const ROMAJI = 'Mushoku Tensei III: Isekai Ittara Honki Dasu'
const NATIVE = '無職転生 Ⅲ ～異世界行ったら本気だす～'

// AniList's own shape for the season 3 record, trimmed to what fetchMedia reads. The external link is
// the one fact that makes the mapper run at all: siteId 5 is Crunchyroll, and the series id is in the url.
const MEDIA_178789 = {
  id: 178789,
  idMal: 59193,
  title: { english: ENGLISH, romaji: ROMAJI, native: NATIVE },
  startDate: { year: 2026, month: 7, day: 4 },
  endDate: { year: null, month: null, day: null },
  episodes: 14,
  format: 'TV',
  type: 'ANIME',
  status: 'RELEASING',
  siteUrl: 'https://anilist.co/anime/178789',
  externalLinks: [{ site: 'Crunchyroll', siteId: 5, url: 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation' }],
  airingSchedule: { edges: [] },
  coverImage: {},
  trailer: null,
  description: 'A show.',
  popularity: 1,
  averageScore: 80,
}

const CR_SEASON_3 = {
  uri: 'cr:G24H1N3MP-GS00374452',
  origin: 'cr',
  id: 'G24H1N3MP-GS00374452',
  scope: 'RUN',
  titles: [{ title: 'Mushoku Tensei: Jobless Reincarnation' }],
  handles: [],
}

// Every url the resolver reaches, recorded. Only AniList's endpoint is answered: anything else throws,
// so a mapper that still reaches for another source's API fails loudly and leaves the url in the list.
const context = (similarMedia: (...args: unknown[]) => Promise<unknown>) => {
  const urls: string[] = []
  const fetch = async (url: string) => {
    urls.push(url)
    if (url === ANILIST) return { status: 200, json: async () => ({ data: { Media: MEDIA_178789 } }) }
    throw new Error(`fixture has no route for ${url}`)
  }
  return { ctx: { fetch, similarMedia } as never, urls }
}

const roots: string[] = []
afterEach(() => { for (const rootId of roots.splice(0)) closeRoot(rootId) })

const openMedia = async (ctx: never) => {
  const root = openRoot('MEDIA')
  roots.push(root.rootId)
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'anilist:178789', context: root } }, ctx).next()
  return { root, media: value.media }
}

const handleUris = (media: { handles: { node: { uri: string } }[] }) => media.handles.map(handle => handle.node.uri)

test('the crunchyroll link is handed to similarMedia with what anilist knows, and the answer is the handle', async () => {
  const similarMedia = vi.fn(async () => CR_SEASON_3)
  const { ctx, urls } = context(similarMedia)

  const { root, media } = await openMedia(ctx)

  expect(similarMedia).toHaveBeenCalledTimes(1)
  expect(similarMedia).toHaveBeenCalledWith('cr', expect.objectContaining({
    showId: 'G24H1N3MP',
    startDate: 'Sat, 04 Jul 2026 00:00:00 GMT',
    titles: [ENGLISH, ROMAJI, NATIVE],
    episodeCount: 14,
    context: root,
  }))
  expect(handleUris(media)).toContain('cr:G24H1N3MP-GS00374452')
  expect(handleUris(media)).toContain('mal:59193')
  expect([...new Set(urls)], 'the only API this source reaches is its own').toEqual([ANILIST])

  // The handle names the row and does not describe it. A handle node is written to the store as a row,
  // where an array of equal length replaces the one it finds: attached whole, the funnel's answer (titles
  // selected as `{ title }`) replaced crunchyroll's own titles, language and score gone (2026-09-05).
  const cr = media.handles.find((handle: { node: { uri: string } }) => handle.node.uri === 'cr:G24H1N3MP-GS00374452')
  expect(cr.relation).toBe('SAME_AS')
  expect(cr.node.titles, 'an identity handle carries no copy of the row it names').toEqual([])
  expect(cr.node.scope).toBe('RUN')
})

// The control: a refusal from the ask is not a failure of the resolver, which still answers with
// everything else it holds.
test('a refusal leaves the media with its other handles', async () => {
  const similarMedia = vi.fn(async () => undefined)
  const { ctx } = context(similarMedia)

  const { media } = await openMedia(ctx)

  expect(similarMedia).toHaveBeenCalledTimes(1)
  expect(media.uri).toBe('anilist:178789')
  expect(handleUris(media)).toEqual(['mal:59193'])
})
