// JustWatch has no season-level node, so the offers it publishes belong to the SHOW. `normalizeMedia`
// builds one media per season out of that one node, and every one of them is handed the SAME offer
// list. A show-level offer is therefore the provider's TITLE, carried as PART_OF: two runs of one show
// share the link and neither claims to be it. The season suffix that used to scope it (`nf:80123-2` on
// season 2) wrote JustWatch's numbering into an id space where unogs writes Netflix's, and Netflix
// folds two anime cours into one season, so the two numberings named different runs under one uri.
// The precise run is `similarMedia`'s to name, asked of the provider's own source with evidence.
//
// Crunchyroll's offers are `/watch/<episodeId>` urls that get resolved through Crunchyroll itself.
// That resolution answers with the season of THAT episode, which is one specific season of the show,
// and the show-level offer hands it to every season media alike, so a pinned season never takes it.
import { expect, test } from 'vitest'

import type { Media as GQLMedia } from '../../../../src/generated/schema/types.generated'
import { resolvers } from '../../../../src/sources/justwatch/extractor'

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

// The same show-level offer on both seasons, as a CONTAINER edge on each: the link is shared, the
// identity is not. It used to be `80123456-2` and `80123456-3`, JustWatch's ordinals in Netflix's id
// space, where unogs mints `80123456-<netflix season>`; Netflix's season 2 of Mushoku Tensei holds two
// anime cours, so the same uri named two different runs and `graph.link` has no inverse.
test('a netflix offer off a show-level node is the TITLE, PART_OF, on every season: the link is shared and the identity is not', async () => {
  const { edges: two } = await scopedEdgesFor('jw:12345-111', node)
  const { edges: three } = await scopedEdgesFor('jw:12345-222', node)

  for (const edges of [two, three]) {
    const netflix = edges.filter(edge => edge.node.origin === 'nf')
    expect(netflix.map(edge => edge.node.id), 'the bare title id, no numbering of anyone\'s').toEqual(['80123456'])
    expect(netflix[0]!.relation, 'a show-level offer is containment, never identity').toBe('PART_OF')
    expect(netflix[0]!.node.scope).toBe('CONTAINER')
  }

  // the control: a FILM's netflix offer names exactly that film, so it keeps the identity
  const filmOnNetflix = {
    ...film,
    offers: [{ monetizationType: 'FLATRATE', standardWebURL: NF_OFFER, package: { clearName: 'Netflix', shortName: 'nfx' } }],
  }
  const { edges: filmEdges } = await scopedEdgesFor('jw:999', filmOnNetflix)
  const netflix = filmEdges.find(edge => edge.node.origin === 'nf')
  expect(netflix?.node.id).toBe('80123456')
  expect(netflix?.relation, 'a film is exact under its bare id').toBe('SAME_AS')
  expect(netflix?.node.scope).toBe('RUN')
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

// The scope stamp. Every handle this source mints is a RUN except the one above: a bare /series/ id
// names the show, so the node has to leave here scoped CONTAINER, which is what keeps it out of every
// run's identity space in the store. Both halves are read off the edge so a stamp that lands on the
// wrong node, or on none, fails here rather than as a weld on the live site.
const scopedEdgesFor = async (uri: string, which: typeof node | typeof film) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri } }, context(which)).next()
  return {
    media: value?.media as { scope: string } | undefined,
    edges: (value?.media?.handles ?? []) as { relation: string, node: { origin: string, id: string, scope: string } }[],
  }
}

test('a crunchyroll series offer leaves as a CONTAINER, and everything season scoped stays a RUN', async () => {
  const filmWithSeriesOffer = {
    ...film,
    offers: [
      { monetizationType: 'FLATRATE', standardWebURL: CR_SERIES_OFFER, package: { clearName: 'Crunchyroll', shortName: 'cru' } },
    ],
  }
  const { media, edges } = await scopedEdgesFor('jw:999', filmWithSeriesOffer)
  const series = edges.find(edge => edge.node.origin === 'cr')
  expect(series?.node.id).toBe('GQWH0M1GG')
  expect(series?.node.scope, 'a /series/ id is one id for every run of the show').toBe('CONTAINER')
  expect(media?.scope, 'the film itself is one run').toBe('RUN')

  // the control: a film's own resolved crunchyroll season names one run, and a run that came out
  // CONTAINER would silently lose every SAME_AS it should have taken. This is the proof a film still
  // mints an identity at all.
  const { edges: filmEdges } = await scopedEdgesFor('jw:999', film)
  const resolved = filmEdges.find(edge => edge.node.origin === 'cr')
  expect(resolved?.node.id).toBe('GSERIES-GSEASON2')
  expect(resolved?.node.scope).toBe('RUN')
  expect(resolved?.relation).toBe('SAME_AS')

  // the season media itself is a run; the netflix TITLE it hangs under is not
  const { media: seasonTwo, edges: seasonEdges } = await scopedEdgesFor('jw:12345-111', node)
  expect(seasonTwo?.scope).toBe('RUN')
  const netflix = seasonEdges.find(edge => edge.node.origin === 'nf')
  expect(netflix?.node.id).toBe('80123456')
  expect(netflix?.node.scope).toBe('CONTAINER')
  expect(netflix?.relation).toBe('PART_OF')
})

// The synthesized "<show> Season <n>" is gone. Measured before writing this: the series media carries
// NO titles at all (`titles: []`, the show title moved onto the film's synthetic episode in 65fd475),
// so a title on it is the one place JustWatch's ordinal could re-enter a cluster's title set, where the
// fuzzy merge's exact-title shortcut and the worker's similarMedia evidence both read. It stays empty,
// and the show's title lives on the show CONTAINER, which is the only node it is true of.
test('a season media carries no synthesized ordinal title: its own titles stay empty and the show container carries the show title', async () => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'jw:12345-111' } }, context(node)).next()
  const media = value?.media as GQLMedia

  expect(media.titles.map(title => title.title)).toEqual([])
  const show = media.handles.find(handle => handle.node.origin === 'jw')
  expect(show?.node.titles.map(title => title.title)).toEqual(['A Show With Several Seasons'])
  expect(media.handles.flatMap(handle => handle.node.titles).map(title => title.title))
    .not.toContainEqual(expect.stringMatching(/season\s+\d/i))
})

// What makes JustWatch askable: the worker asks `similarMedia` of CONTAINER origins only, and it is
// also what lets the container space union `jw:<objectId>` with `cr:<series>` and `tvmaze:<show>` on
// a title, so a run PART_OF any one of them reaches JustWatch's offers.
test('a season media is PART_OF its show node, scoped CONTAINER', async () => {
  const { edges } = await scopedEdgesFor('jw:12345-111', node)
  const show = edges.find(edge => edge.node.origin === 'jw')
  expect(show?.node.id).toBe('12345')
  expect(show?.relation).toBe('PART_OF')
  expect(show?.node.scope).toBe('CONTAINER')

  // a film is its own node, and hangs under nothing
  const { edges: filmEdges } = await scopedEdgesFor('jw:999', film)
  expect(filmEdges.find(edge => edge.node.origin === 'jw')).toBeUndefined()
})

// `similarMedia`: another origin's run page describing ITS run, asking which JustWatch season is the
// same run. The rules are shared (../similar.ts); what this file owns is the candidates it builds
// from the node (a count, a year, no finer date) and a refusal being null rather than the show.
const askSimilar = async (which: typeof node | typeof film, input: Record<string, unknown>) => {
  const subscribe = (resolvers.Subscription as any).similarMedia.subscribe
  const yields: { similarMedia: GQLMedia | null }[] = []
  for await (const value of subscribe(undefined, { input }, context(which))) yields.push(value)
  return { yields, answer: yields[0]?.similarMedia ?? null }
}

test('similarMedia names the season the evidence establishes and refuses a fold', async () => {
  const ordinal = await askSimilar(node, { showId: '12345', titles: ['A Show Season 3'], episodeCount: 12 })
  expect(ordinal.answer?.uri).toBe('jw:12345-222')
  expect(ordinal.answer?.scope).toBe('RUN')
  expect(ordinal.answer?.handles.map(handle => handle.relation), 'nothing in the answer names another run')
    .toEqual(ordinal.answer?.handles.map(() => 'PART_OF'))

  const fold = await askSimilar(node, { showId: '12345', titles: ['A Show Season 2'], episodeCount: 10 })
  expect(fold.answer, 'JustWatch season 2 holds 12 over our 10: several runs in one season').toBeNull()
  expect(fold.yields, 'a refusal still yields once').toEqual([{ similarMedia: null }])

  // JustWatch has a year and nothing finer, so the year rule is its date axis: the one season dated
  // our year, with no ordinal to read and a count that does not tell 12 from 12
  const year = await askSimilar(node, { showId: '12345', startDate: '2023-01-01', titles: ['A Show'], episodeCount: 12 })
  expect(year.answer?.uri, 'season 222 is the 2023 one').toBe('jw:12345-222')

  const movie = await askSimilar(film, { showId: '999', titles: ['A Film'], episodeCount: 1 })
  expect(movie.yields, 'a film has no seasons to pick between').toEqual([{ similarMedia: null }])
})

// A `totalEpisodeCount` of 0 is a season JustWatch has not listed yet, offered to the picker as no
// count. Until 2026-09-05 the one season dated our year answered without a count to check, so two runs
// of that year with any lengths both took the unlisted season.
test('similarMedia never answers an unlisted season by its year alone', async () => {
  const unlisted = { ...node, seasons: [season(111, 2), { ...season(222, 3), totalEpisodeCount: 0 }] }

  expect((await askSimilar(unlisted, { showId: '12345', startDate: '2023-01-01', titles: ['A Show'], episodeCount: 12 })).answer).toBeNull()
  expect((await askSimilar(unlisted, { showId: '12345', startDate: '2023-01-01', titles: ['A Show'], episodeCount: 24 })).answer).toBeNull()
  expect(
    (await askSimilar(unlisted, { showId: '12345', startDate: '2022-01-01', titles: ['A Show'], episodeCount: 12 })).answer?.uri,
    'the control: the listed season of our year, holding our count, still answers'
  ).toBe('jw:12345-111')
})

// The media path goes through the same picker. A unique episode count used to pick a season on its
// own (../season.ts, `pickSeasonByEpisodeCount`), and a unique count is a number, not an identity:
// with several seasons only the FIRST may be a run whose title names no season, by an exact count.
const knowing = (which: typeof node, known: Record<string, unknown>) => ({
  fetch: (context(which) as { fetch: unknown }).fetch,
  findAggregatedMedia: async () => known,
  listenForMediaChanges: async function* () {},
}) as never

test('the media path picks its season through the shared picker: a season a unique count used to pick is refused', async () => {
  const uneven = { ...node, seasons: [{ ...season(111, 2), totalEpisodeCount: 13 }, season(222, 3)] }
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const uri = 'ag:(anilist:1,jw:12345)'

  const { value: refused } = await subscribe(undefined, { input: { uri } }, knowing(uneven, { titles: [{ title: 'A Show' }], episodeCount: 12 })).next()
  expect(refused?.media, 'the first season is 13, so a run of 12 with no ordinal is not placed by the season that happens to hold 12').toBeNull()

  // the control: an agreed ordinal with a count the season does not exceed still places the run
  const { value: placed } = await subscribe(undefined, { input: { uri } }, knowing(uneven, { titles: [{ title: 'A Show Season 3' }], episodeCount: 12 })).next()
  expect(placed?.media?.uri).toBe('jw:12345-222')
})
