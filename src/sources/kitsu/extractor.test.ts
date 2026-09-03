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

// the real links, verbatim, because the whole defect is what these urls' paths say
const CR_SHOW_URL = 'https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation'
const NF_TITLE_URL = 'https://www.netflix.com/title/81006261'

const context = (
  { subtype, startDate, resolveSeason, streams = [CR_SHOW_URL] }:
  { subtype: string, startDate: string | null, resolveSeason: ReturnType<typeof vi.fn>, streams?: string[] }
) => ({
  fetch: async (url: string) => {
    const body =
      url.startsWith(`${API}/anime/49002/streaming-links`)
        ? { data: streams.map((stream, i) => ({ id: String(i), attributes: { url: stream } })) }
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

const edgesFor = async (ctx: never) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'kitsu:49002' } }, ctx).next()
  return (value?.media?.handles ?? []) as { relation: string, node: { uri: string, origin: string, id: string } }[]
}

/** the nodes, for assertions about WHICH ids get minted */
const handlesFor = async (ctx: never) => (await edgesFor(ctx)).map(handle => handle.node)

/** what this media claims to BE. The only relation that welds, so the only one these tests police. */
const sameAsFor = async (ctx: never) =>
  (await edgesFor(ctx)).filter(handle => handle.relation === 'SAME_AS').map(handle => handle.node)

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
test('an origin that cannot place the run asserts nothing, but keeps the link', async () => {
  const resolveSeason = vi.fn(async () => undefined)
  const ctx = context({ subtype: 'TV', startDate: '2026-07-04', resolveSeason })

  expect(await sameAsFor(ctx), 'the show id must never be claimed as this run').toEqual([])

  const cr = (await edgesFor(context({ subtype: 'TV', startDate: '2026-07-04', resolveSeason })))
    .find(handle => handle.node.origin === 'cr')
  expect(cr?.relation, 'the run IS part of that series, which is worth keeping').toBe('PART_OF')
  expect(cr?.node.id).toBe('G24H1N3MP')
})

// No date is no basis on which the other source could tell our run from its neighbours, so the ask is
// not worth making. Asking anyway with an empty date is how a source ends up taking "season 1".
test('no start date means the ask is never made, and the link is still carried', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const edges = await edgesFor(context({ subtype: 'TV', startDate: null, resolveSeason }))

  expect(resolveSeason).not.toHaveBeenCalled()
  expect(edges.filter(handle => handle.node.origin === 'cr' && handle.relation === 'SAME_AS')).toEqual([])
  expect(edges.find(handle => handle.node.origin === 'cr')?.relation).toBe('PART_OF')
})

// A film that belongs to a running series gets the SERIES' url from Crunchyroll: all four Demon Slayer
// films link to /series/GY5P48XEY, and all fifteen Dragon Ball Z films to /series/GQWH0M1GG. So the
// subtype carve-out that used to sit here minted one id for fifteen films and welded them, the same
// defect the three Mushoku Tensei seasons had.
//
// There is no third path for a film. resolveSeason places a run by air date, and a film has no season
// to be placed into, so asking would match it against a TV season: a wrong merge rather than a missing
// link. It is dropped, and the ask is never made.
test('a film whose link names the show claims nothing, and does not ask either', async () => {
  const resolveSeason = vi.fn(async () => undefined)
  const ctx = context({ subtype: 'movie', startDate: '2020-10-16', resolveSeason })

  const edges = await edgesFor(ctx)
  expect(resolveSeason).not.toHaveBeenCalled()

  // the weld this whole mechanism exists to avoid: fifteen Dragon Ball Z films share one /series/ id
  expect(edges.filter(handle => handle.relation === 'SAME_AS').map(handle => handle.node.uri))
    .not.toContain('cr:G24H1N3MP')
  // and the film really IS part of that series, so the link is kept rather than thrown away
  expect(edges.find(handle => handle.node.origin === 'cr')?.relation).toBe('PART_OF')
})

// Netflix gives every title its own /title/<id>, film and show alike, so a film's Netflix link does
// name the film. This is why the refusal above is a filter on the url and not a blanket one on the
// subtype: a blanket refusal would cost every one of these for nothing.
test('a film whose link names the film itself is still minted directly', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const handles = await handlesFor(context({
    subtype: 'movie',
    startDate: '2020-10-16',
    resolveSeason,
    streams: [CR_SHOW_URL, NF_TITLE_URL],
  }))

  expect(resolveSeason).not.toHaveBeenCalled()
  // the netflix one is an identity, the crunchyroll one is only a link, out of the same record
  expect(handles.map(handle => handle.uri)).toContain('nf:81006261')
  expect((await sameAsFor(context({
    subtype: 'movie',
    startDate: '2020-10-16',
    resolveSeason,
    streams: [CR_SHOW_URL, NF_TITLE_URL],
  }))).map(handle => handle.uri)).toEqual(['nf:81006261'])
})

// The film gate, from the side every other test in this file is blind to. The three non-film cases
// above all carry a crunchyroll /series/ link, which the ALLOWLIST refuses on shape as well, so they
// pass whether or not the gate exists. A netflix link is the case that separates them: `nf:title` is
// on the allowlist, so only the gate stops it being minted here.
//
// It has to stop it. A netflix /title/ id on a cour record is the WHOLE show's: measured 2026-09-04
// over 3000 kitsu records, nf:80135674 is published on all five seasons of Boku no Hero Academia, and
// 36 more ids are shared the same way. Kitsu mints none of them today, because a cour record goes to
// resolveSeason and Netflix registers no mediaSeason resolver, so it answers nothing.
test('a cour record hands its netflix link back rather than minting it', async () => {
  const resolveSeason = vi.fn(async () => undefined)

  const handles = await sameAsFor(context({
    subtype: 'TV',
    startDate: '2026-07-04',
    resolveSeason,
    streams: [NF_TITLE_URL],
  }))

  expect(resolveSeason).toHaveBeenCalledWith('nf', expect.objectContaining({ showId: '81006261' }))
  expect(
    handles.filter(handle => handle.origin === 'nf'),
    'nf:80135674 is all five seasons of Boku no Hero Academia; claiming it here welds them'
  ).toEqual([])
})
