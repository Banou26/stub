// Kitsu publishes a streaming link on every one of a show's season records, and it is always the
// SHOW's url. Measured 2026-08-31 off /anime/<id>/streaming-links: the identical
// `https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation` sits on
// kitsu:45950 (season 2), kitsu:47694 (season 2 part 2) and kitsu:49002 (season 3).
//
// Minting `cr:G24H1N3MP` off that welds all three permanently. Dropping it loses a real offer. This
// file pins the third path: the show id goes back to Crunchyroll through `ctx.resolveSeason` with the
// date of OUR run, and the season-scoped media that comes back is the handle.
import { expect, test, vi } from 'vitest'

import { resolvers } from './extractor'

const API = 'https://kitsu.io/api/edge'

// the real link, verbatim, because the whole defect is what this url's path says
const CR_SHOW_URL = 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation'

const context = (
  { subtype, startDate, resolveSeason }:
  { subtype: string, startDate: string | null, resolveSeason: ReturnType<typeof vi.fn> }
) => ({
  fetch: async (url: string) => {
    const body =
      url.startsWith(`${API}/anime/49002/streaming-links`) ? { data: [{ id: '1', attributes: { url: CR_SHOW_URL } }] }
      : url.startsWith(`${API}/anime/49002/episodes`) ? { data: [] }
      : url.startsWith(`${API}/anime/49002`) ? {
        data: {
          id: '49002',
          attributes: {
            subtype,
            startDate,
            canonicalTitle: 'Mushoku Tensei: Jobless Reincarnation Season 3',
            titles: { en: 'Mushoku Tensei: Jobless Reincarnation Season 3' },
            episodeCount: 14,
          },
          relationships: { mappings: { data: [] } },
        },
        included: [],
      }
      : undefined
    if (!body) throw new Error(`fixture has no route for ${url}`)
    return { json: async () => body }
  },
  resolveSeason,
}) as never

const handlesFor = async (ctx: never) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'kitsu:49002' } }, ctx).next()
  return (value?.media?.handles ?? []) as { uri: string, origin: string, id: string }[]
}

test('a series link is handed to the owning origin as a show plus a date', async () => {
  const resolveSeason = vi.fn(async () => ({
    uri: 'cr:G24H1N3MP-GS00374452',
    origin: 'cr',
    id: 'G24H1N3MP-GS00374452',
    url: 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation',
  }))

  const handles = await handlesFor(context({ subtype: 'TV', startDate: '2026-07-04', resolveSeason }))

  expect(resolveSeason).toHaveBeenCalledWith('cr', expect.objectContaining({
    showId: 'G24H1N3MP',
    startDate: '2026-07-04',
    episodeCount: 14,
  }))
  // the SEASON-scoped id it named, never the show id it was handed
  expect(handles.map(handle => handle.uri)).toContain('cr:G24H1N3MP-GS00374452')
  expect(handles.map(handle => handle.uri)).not.toContain('cr:G24H1N3MP')
})

// The refusal path, and the one that matters most: an origin that cannot place the run answers
// nothing, and nothing is exactly where dropping the link left us. It must never fall back to the
// show id, which is the weld this whole mechanism exists to avoid.
test('an origin that cannot place the run leaves no handle at all', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const handles = await handlesFor(context({ subtype: 'TV', startDate: '2026-07-04', resolveSeason }))

  expect(resolveSeason).toHaveBeenCalled()
  expect(handles.filter(handle => handle.origin === 'cr')).toEqual([])
})

// No date is no basis on which the other source could tell our run from its neighbours, so the ask is
// not worth making. Asking anyway with an empty date is how a source ends up taking "season 1".
test('no start date means the ask is never made', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const handles = await handlesFor(context({ subtype: 'TV', startDate: null, resolveSeason }))

  expect(resolveSeason).not.toHaveBeenCalled()
  expect(handles.filter(handle => handle.origin === 'cr')).toEqual([])
})

// A movie has no seasons to be confused between, so its bare id is exact and goes straight in. This is
// the carve-out, and pinning it stops the guard quietly widening to cover everything.
test('a movie mints the link id directly, with no ask', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const handles = await handlesFor(context({ subtype: 'movie', startDate: '2026-07-04', resolveSeason }))

  expect(resolveSeason).not.toHaveBeenCalled()
  expect(handles.map(handle => handle.uri)).toContain('cr:G24H1N3MP')
})
