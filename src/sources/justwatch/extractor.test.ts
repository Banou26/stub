// JustWatch has no season-level node, so the offers it publishes belong to the SHOW. `normalizeMedia`
// builds one media per season out of that one node, and every one of them is handed the SAME offer
// list. The season suffix in ./id.ts exists for exactly that: `nf:80123` becomes `nf:80123-2` on
// season 2 and `nf:80123-3` on season 3, so two runs of one show never share a handle.
//
// Crunchyroll has no suffix, because its season identity is `<seriesId>-<seasonId>` rather than a
// number, and its offers are `/watch/<episodeId>` urls that get resolved through Crunchyroll itself.
// That resolution answers with the season of THAT episode, which is one specific season of the show,
// and the show-level offer hands it to every season media alike.
import { expect, test } from 'vitest'

import { resolvers } from './extractor'

const JW_API = 'https://apis.justwatch.com/graphql'
const CMS = 'https://www.crunchyroll.com/content/v2/cms'

// the real affiliate wrapper, because the extractor unwraps `?u=` before reading the url
const CR_OFFER = 'https://crunchyroll.pxf.io/xk92Nv?u=https%3A%2F%2Fwww.crunchyroll.com%2Fwatch%2FGEPISODE1'
const NF_OFFER = 'https://www.netflix.com/title/80123456'

const season = (objectId: number, seasonNumber: number) => ({
  objectId,
  totalEpisodeCount: 12,
  content: { seasonNumber, isReleased: true, originalReleaseYear: 2020 + seasonNumber },
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
  offers: [
    { monetizationType: 'FLATRATE', standardWebURL: CR_OFFER, package: { clearName: 'Crunchyroll', shortName: 'cru' } },
    { monetizationType: 'FLATRATE', standardWebURL: NF_OFFER, package: { clearName: 'Netflix', shortName: 'nfx' } },
  ],
  seasons: [season(111, 2), season(222, 3)],
}

// Every url the resolver can reach, answered from a table. An unlisted url throws rather than
// returning an empty payload, so a fixture that has drifted fails loudly instead of quietly
// producing the absence this file asserts.
const film = {
  id: 'tm999',
  objectId: 999,
  objectType: 'MOVIE',
  content: {
    title: 'A Film',
    fullPath: '/us/movie/a-film',
    posterUrl: null,
    shortDescription: 'A film.',
    originalReleaseYear: 2020,
  },
  offers: [
    { monetizationType: 'FLATRATE', standardWebURL: CR_OFFER, package: { clearName: 'Crunchyroll', shortName: 'cru' } },
  ],
  seasons: [],
}

const context = (which: typeof node | typeof film = node) => ({
  fetch: async (url: string) => {
    if (url === JW_API) return { json: async () => ({ data: { node: which } }) }
    if (url === 'https://www.crunchyroll.com/auth/v1/token') {
      return { json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
    }
    // the episode the show-level offer links to. It belongs to ONE season, GSEASON2, whichever season
    // media is being built.
    if (url.startsWith(`${CMS}/objects/GEPISODE1`)) {
      return { json: async () => ({ data: [{ episode_metadata: { series_id: 'GSERIES', season_id: 'GSEASON2' } }] }) }
    }
    throw new Error(`fixture has no route for ${url}`)
  },
}) as never

const handlesFor = async (uri: string, which?: typeof node | typeof film) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri } }, context(which)).next()
  // handles are edges now: { node, relation }. These assertions are about WHICH ids get minted, so
  // they read the nodes; the relation each one carries is asserted where it is the point.
  return ((value?.media?.handles ?? []) as { node: { uri: string, origin: string, id: string } }[])
    .map(handle => handle.node)
}

const idFor = (handles: { origin: string, id: string }[], origin: string) =>
  handles.filter(handle => handle.origin === origin).map(handle => handle.id)

// The weld. Both uris name the same JustWatch node and different seasons of it, which is what the
// `-<seasonObjectId>` scoping is for, and both used to come back holding `cr:GSERIES-GSEASON2`.
// `upsertMedia` unions on a shared handle and `graph.link` has no inverse, so season 2 and season 3
// became one media for the session.
test('two seasons of one show do not come back holding the same crunchyroll handle', async () => {
  const two = await handlesFor('jw:12345-111')
  const three = await handlesFor('jw:12345-222')

  const shared = idFor(two, 'cr').filter(id => idFor(three, 'cr').includes(id))
  expect(shared, 'a handle on both seasons welds them permanently').toEqual([])
})

// The control, and the reason this is not solved by refusing every provider handle: Netflix's id IS
// season scoped here, by the `-<seasonNumber>` suffix providerContentId appends, so the two seasons
// carry different netflix handles off the very same show-level offer.
test('the netflix handle off the same show-level offer is season scoped, and survives', async () => {
  const two = await handlesFor('jw:12345-111')
  const three = await handlesFor('jw:12345-222')

  expect(idFor(two, 'nf')).toEqual(['80123456-2'])
  expect(idFor(three, 'nf')).toEqual(['80123456-3'])
})

// The control, and the reason the refusal is scoped to a pinned season rather than applied to every
// crunchyroll offer. A film has no season to be confused with, `showRequiresSeason` lets it through
// with a null seasonNumber, and the episode its offer links to is the film itself. That handle is
// honest and it survives: a run where both this and the weld test go quiet has broken the path, not
// fixed the bug.
test('a film still takes the crunchyroll handle its own offer resolves to', async () => {
  const handles = await handlesFor('jw:999', film)

  expect(idFor(handles, 'cr')).toEqual(['GSERIES-GSEASON2'])
})

// A crunchyroll offer that is a /series/ url rather than a /watch/ one. `providerContentId` refuses it
// outright, because `extractContentId` reads a cr id from /series/ and nothing else, so every cr id
// reaching it names a SHOW and, on Crunchyroll, that show's films. That refusal used to be a DROP.
//
// It is a demotion now: the film or run is genuinely PART OF that series, so the link stays on the page
// while the claim does not. Fifteen Dragon Ball Z films share /series/GQWH0M1GG, which is why it can
// never be an identity.
const CR_SERIES_OFFER = 'https://www.crunchyroll.com/series/GQWH0M1GG/dragon-ball-z-movies'

test('a crunchyroll series offer is kept as PART_OF rather than dropped', async () => {
  const filmWithSeriesOffer = {
    ...film,
    offers: [
      { monetizationType: 'FLATRATE', standardWebURL: CR_SERIES_OFFER, package: { clearName: 'Crunchyroll', shortName: 'cru' } },
    ],
  }

  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'jw:999' } }, context(filmWithSeriesOffer)).next()
  const edges = (value?.media?.handles ?? []) as { relation: string, node: { origin: string, id: string } }[]

  const cr = edges.find(edge => edge.node.origin === 'cr')
  expect(cr, 'the link must survive, which is the change').toBeDefined()
  expect(cr!.node.id).toBe('GQWH0M1GG')
  expect(cr!.relation, 'it names the whole collection, so it may never be an identity').toBe('PART_OF')
})
