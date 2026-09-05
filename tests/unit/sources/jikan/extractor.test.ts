// MyAnimeList publishes its AniDB link in two shapes, and only one of them puts the id in the path:
//
//   https://anidb.net/perl-bin/animedb.pl?show=anime&aid=23   the common one, measured 2026-09-04 on
//                                                             mal:1, mal:30 and mal:5114
//   https://anidb.net/anime/23                                the modern one
//
// The id read was `searchParams.get('aid') ?? pathname.split('/')[2]`, an unguarded positional
// fallback, and the anizip handle beside it gated on the LINK rather than on the id. So a link the
// first half could not read minted `anizip:undefined`, or `anidb:animedb.pl` off the common shape,
// and every record that produced one produced the SAME one. `upsertMedia` welds those, and `graph.link`
// has no inverse.
import { expect, test, vi } from 'vitest'

import { anidbIdFromUrl, resolvers } from '../../../../src/sources/jikan/extractor'
import { mediaSeasonNow } from '../../../../src/sources/season'

const API = 'https://api.jikan.moe/v4'

const context = (external: { name: string, url: string }[]) => ({
  fetch: async (url: string) => {
    if (!url.startsWith(`${API}/anime/1/full`)) throw new Error(`fixture has no route for ${url}`)
    return {
      json: async () => ({
        data: {
          mal_id: 1,
          url: 'https://myanimelist.net/anime/1',
          title: 'Cowboy Bebop',
          type: 'TV',
          external,
          images: { jpg: {}, webp: {} },
        },
      }),
    }
  },
}) as never

const handlesFor = async (external: { name: string, url: string }[]) => {
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'mal:1' } }, context(external)).next()
  // handles are edges now: { node, relation }. These assertions are about WHICH ids get minted, so
  // they read the nodes; the relation each one carries is asserted where it is the point.
  return ((value?.media?.handles ?? []) as { node: { uri: string, origin: string, id: string } }[])
    .map(handle => handle.node)
}

const ANIDB = (url: string) => [{ name: 'AniDB', url }]

test('a link on either real shape yields the anidb id, and both handles carry it', async () => {
  for (const url of [
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=23',
    'https://anidb.net/anime/23',
  ]) {
    const uris = (await handlesFor(ANIDB(url))).map(handle => handle.uri)
    expect(uris, url).toContain('anidb:23')
    expect(uris, url).toContain('anizip:23')
  }
})

// The weld. Before the fix this record minted `anidb:animedb.pl` and `anizip:animedb.pl`, and so did
// every other record whose `aid` was missing from the same url shape.
test('a common-shape link with no aid mints NOTHING, never the script name', async () => {
  const handles = await handlesFor(ANIDB('https://anidb.net/perl-bin/animedb.pl?show=anime'))

  expect(handles.map(handle => handle.uri)).not.toContain('anidb:animedb.pl')
  expect(handles.filter(handle => handle.origin === 'anidb' || handle.origin === 'anizip')).toEqual([])
})

// The asymmetry that shipped: the anidb handle gated on the id, the anizip handle beside it gated on
// the LINK, so only one of the two refused.
test('a link with no readable id anywhere leaves BOTH handles unminted', async () => {
  for (const url of [
    'https://anidb.net/',
    'https://anidb.net/anime/',
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=',
    'https://anidb.net/perl-bin/animedb.pl?show=anime&aid=not-a-number',
  ]) {
    const handles = await handlesFor(ANIDB(url))
    expect(handles.filter(handle => handle.origin === 'anizip'), url).toEqual([])
    expect(handles.filter(handle => handle.origin === 'anidb'), url).toEqual([])
  }
})

// `new URL(...)` used to run unguarded inside normalizeMedia, so a malformed link threw and took the
// whole record with it rather than costing one handle.
test('a malformed link costs one handle, not the record', async () => {
  const handles = await handlesFor(ANIDB('not a url at all'))

  expect(handles.filter(handle => handle.origin === 'anizip')).toEqual([])
  // the record itself still resolved, which is the part the throw used to take away
  expect(handles).toBeDefined()
})

test('no AniDB link at all is simply no handle', async () => {
  const handles = await handlesFor([{ name: 'AniList', url: 'https://anilist.co/anime/1' }])

  expect(handles.filter(handle => handle.origin === 'anidb' || handle.origin === 'anizip')).toEqual([])
})

test('anidbIdFromUrl reads the id, or refuses', () => {
  expect(anidbIdFromUrl('https://anidb.net/perl-bin/animedb.pl?show=anime&aid=6107')).toBe('6107')
  expect(anidbIdFromUrl('https://anidb.net/anime/22')).toBe('22')
  expect(anidbIdFromUrl('https://anidb.net/anime/22?highlight=1')).toBe('22')

  expect(anidbIdFromUrl('https://anidb.net/perl-bin/animedb.pl?show=anime')).toBeUndefined()
  expect(anidbIdFromUrl('https://anidb.net/creator/1234')).toBeUndefined()
  expect(anidbIdFromUrl('not a url at all')).toBeUndefined()
  expect(anidbIdFromUrl(undefined)).toBeUndefined()
  expect(anidbIdFromUrl(null)).toBeUndefined()
  expect(anidbIdFromUrl('')).toBeUndefined()
})

// The rest of this file drives the same two resolvers against a routed `ctx.fetch`, which records
// every url it was asked for. Which url is asked is half of what a season page is: a season the
// source cannot answer must ask for nothing rather than ask for /seasons/now.

const MAL_ENTITY = (...names: string[]) =>
  names.map((name, index) => ({ mal_id: index + 1, type: 'anime', name, url: `${API}/genre/${index + 1}` }))

const ANIME = (fields: Record<string, unknown>) => ({
  mal_id: 1,
  url: 'https://myanimelist.net/anime/1',
  title: 'Cowboy Bebop',
  type: 'TV',
  images: { jpg: {}, webp: {} },
  ...fields,
})

const routed = (route: (url: string) => unknown) => {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      fetch: async (url: string) => {
        urls.push(url)
        const answer = route(url)
        if (answer instanceof Error) throw answer
        return answer
      },
    } as never,
  }
}

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 504, json: async () => body })

const mediaFor = async (fields: Record<string, unknown>) => {
  const { ctx } = routed(url => {
    if (!url.startsWith(`${API}/anime/1/full`)) throw new Error(`fixture has no route for ${url}`)
    return json({ data: ANIME(fields) })
  })
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri: 'mal:1' } }, ctx).next()
  return value?.media as { genres: string[], tags: string[], season: string | null, seasonYear: number | null }
}

const pageFor = async (input: Record<string, unknown>, ctx: never) => {
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const { value } = await subscribe(undefined, { input }, ctx).next()
  return (value?.mediaPage?.nodes ?? []) as { uri: string, season: string | null, seasonYear: number | null }[]
}

test('genres merge MAL\'s three vocabularies in order, deduplicated, and never explicit_genres', async () => {
  const media = await mediaFor({
    genres: MAL_ENTITY('Action', 'Comedy'),
    explicit_genres: MAL_ENTITY('Hentai'),
    themes: MAL_ENTITY('Isekai', 'action'),
    demographics: MAL_ENTITY('Shounen'),
  })

  expect(media.genres).toEqual(['Action', 'Comedy', 'Isekai', 'Shounen'])
  // jikan carries the highest score of any source, so a rating leaking in here wins the cluster
  expect(media.genres).not.toContain('Hentai')
  expect(media.tags).toEqual([])
})

test('a record with none of the three lists carries no genres rather than failing', async () => {
  expect((await mediaFor({})).genres).toEqual([])
})

test('season and seasonYear round-trip, and a season MAL spells otherwise is null', async () => {
  const winter = await mediaFor({ season: 'winter', year: 2024 })
  expect(winter.season).toBe('WINTER')
  expect(winter.seasonYear).toBe(2024)

  // null rather than a guess: the store takes jikan's scalars over every other source's
  const unknown = await mediaFor({ season: 'monsoon', year: 2024 })
  expect(unknown.season).toBeNull()
  expect(unknown.seasonYear).toBe(2024)
})

// `&` ends a query parameter, so an unescaped term silently searched for its own first word.
test('a search term is percent-encoded into the query', async () => {
  const { ctx, urls } = routed(() => json({ data: [] }))

  await pageFor({ search: 'fate & zero' }, ctx)

  expect(urls).toEqual([`${API}/anime?q=fate%20%26%20zero`])
})

test('a named season asks for that season and never for /seasons/now', async () => {
  const { ctx, urls } = routed(() => json({ data: [], pagination: { last_visible_page: 1 } }))

  const nodes = await pageFor({ season: 'WINTER', seasonYear: 2024, status: 'RELEASING' }, ctx)

  expect(urls[0]).toContain('/seasons/2024/winter')
  expect(urls.some(url => url.includes('/seasons/now'))).toBe(false)
  expect(nodes).toEqual([])
})

test('the season the clock is in reuses /seasons/now, which carries the MAL fallback', async () => {
  const { season, year } = mediaSeasonNow()
  const { ctx, urls } = routed(() => json({ data: [ANIME({ season: season.toLowerCase(), year })], pagination: { last_visible_page: 1 } }))

  const nodes = await pageFor({ season, seasonYear: year }, ctx)

  expect(urls[0]).toContain('/seasons/now')
  expect(nodes.map(node => node.season)).toEqual([season])
})

test('a season the api refuses is an empty page, not a throw and not another season', async () => {
  for (const answer of [
    () => new Error('Jikan failed to connect to MyAnimeList'),
    () => json({ status: 504, message: 'gateway' }, false),
    // a body that reads like a season behind a status that says it is not one: the route is
    // unverified from here, so the status is the only thing that can refuse it
    () => json({ data: [ANIME({})], pagination: { last_visible_page: 1 } }, false),
    () => json({ status: 'ok', results: [] }),
  ]) {
    const { ctx, urls } = routed(answer)

    await expect(pageFor({ season: 'SPRING', seasonYear: 2019 }, ctx)).resolves.toEqual([])
    expect(urls.some(url => url.includes('/seasons/now'))).toBe(false)
    expect(urls.some(url => url.includes('myanimelist.net'))).toBe(false)
  }
})

// Half a season is not a season: without the year this would have to guess one.
test('a season with no year, or a year with no season, asks for nothing at all', async () => {
  for (const input of [{ season: 'WINTER' }, { seasonYear: 2024 }]) {
    const { ctx, urls } = routed(() => json({ data: [ANIME({})], pagination: { last_visible_page: 1 } }))

    await expect(pageFor({ ...input, status: 'RELEASING' }, ctx)).resolves.toEqual([])
    expect(urls, JSON.stringify(input)).toEqual([])
  }
})

// The scraped page is one season, the one running, and carries no label saying so. Unstamped, every
// row it returns fails the store's season filter, which empties the page the fallback exists for.
test('the MAL scrape stamps the season it is a page of', async () => {
  const card =
    '<div class="js-anime-category-producer js-anime-type-1">'
    + '<a href="https://myanimelist.net/anime/12345/Some_Show" class="link-title">Some Show</a>'
    + '</div>'
  const { ctx } = routed(url =>
    url.includes('myanimelist.net')
      ? { ok: true, text: async () => card }
      : json({ status: 504, message: 'gateway' })
  )

  const nodes = await pageFor({ status: 'RELEASING' }, ctx)
  const { season, year } = mediaSeasonNow()

  expect(nodes.map(node => node.uri)).toEqual(['mal:12345'])
  expect(nodes[0]!.season).toBe(season)
  expect(nodes[0]!.seasonYear).toBe(year)
})
