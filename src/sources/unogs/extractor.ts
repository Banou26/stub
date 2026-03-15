import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, fromAggregatedUri, isAggregatedUri, isUri, toUri } from '../../utils/uri'

export const icon = 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2023.ico'
export const originUrl = 'https://www.netflix.com'
export const categories = ['ANIME'] as const
export const name = 'Netflix'
export const origin = 'nf'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['nf']

// --- Auth ---

let _token: string | undefined
let _tokenExpiry: number = 0
let _tokenPromise: Promise<string> | undefined

const getToken = async (ctx: ExtractorServerContext): Promise<string> => {
  if (_token && Date.now() < _tokenExpiry) return _token
  if (_tokenPromise) return _tokenPromise
  _tokenPromise = (async () => {
    const res = await ctx.fetch('https://unogs.com/api/user', {
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: 'user_name=anonymous',
      method: 'POST',
      mode: 'cors',
      credentials: 'include'
    }).then(r => r.json())
    if (!res.token?.access_token) throw new Error(`uNoGS token fetch failed: ${JSON.stringify(res)}`)
    _tokenExpiry = Date.now() + 12 * 60 * 60 * 1000
    return (_token = res.token.access_token)
  })().finally(() => { _tokenPromise = undefined })
  return _tokenPromise
}

// --- API ---

const _inflight = new Map<string, Promise<unknown>>()

const api = async <T>(url: string, ctx: ExtractorServerContext): Promise<T> => {
  const existing = _inflight.get(url)
  if (existing) return existing as Promise<T>
  const promise = getToken(ctx).then(token =>
    ctx.fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${token}`, REFERRER: 'http://unogs.com', referer: 'http://unogs.com' },
      mode: 'cors',
      credentials: 'include'
    }).then(r => r.json() as T)
  )
  _inflight.set(url, promise)
  promise.finally(() => _inflight.delete(url))
  return promise
}

interface UnogsTitle {
  netflixid: number
  title: string
  synopsis: string
  vtype: string
  img: string
  lgimg: string
  nfdate: string
  imdbrating: number | null
}

interface UnogsBgImages {
  bo166x236: { url: string }[]
  bo342x192: { url: string }[]
  bo665x375: { url: string }[]
  bg: { url: string }[]
}

interface UnogsEpisode {
  epid: number
  seasnum: number
  synopsis: string
  title: string
  img: string
}

const UNOGS = 'https://unogs.com/api'

const fetchDetail = (id: string, ctx: ExtractorServerContext) =>
  api<UnogsTitle[]>(`${UNOGS}/title/detail?netflixid=${id}`, ctx)

const fetchBgImages = (id: string, ctx: ExtractorServerContext) =>
  api<UnogsBgImages>(`${UNOGS}/title/bgimages?netflixid=${id}`, ctx)

const fetchEpisodes = (id: string, ctx: ExtractorServerContext) =>
  api<{ season: number, episodes: UnogsEpisode[] }[]>(`${UNOGS}/title/episodes?netflixid=${id}`, ctx)

const searchApi = (query: string, ctx: ExtractorServerContext) =>
  api<{ results: { title: string, nfid: number, synopsis: string, img: string }[] }>(
    `${UNOGS}/search?limit=50&offset=0&query=${encodeURIComponent(query)}&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`,
    ctx
  )

// --- Helpers ---

const decodeEntities = (str: string): string =>
  str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")

const httpsUrl = (url: string) => url.replace(/^http:/, 'https:')

const getFirstTitle = (media: { titles?: { title: string }[] } | undefined) =>
  media?.titles?.[0]?.title

const simplifyTitle = (title: string): string[] => {
  const queries: string[] = []
  const stripped = title.replace(/\s+(Season|Part|Cour)\s+\d+$/i, '').trim()
  if (stripped !== title) queries.push(stripped)
  const colonIdx = title.indexOf(':')
  if (colonIdx > 2) queries.push(title.slice(0, colonIdx).trim())
  return queries
}

const findMatchingSeason = (
  seasons: { season: number, episodes: unknown[] }[],
  targetCount: number
): number | undefined => {
  if (seasons.length <= 1) return undefined
  let best: { season: number, diff: number } | undefined
  for (const s of seasons) {
    const diff = Math.abs(s.episodes.length - targetCount)
    if (!best || diff < best.diff) best = { season: s.season, diff }
  }
  return best?.season
}

const buildHandlesFromAggregatedUri = (aggregatedUri: string): GQLMedia[] => {
  const parsed = fromAggregatedUri(aggregatedUri as Parameters<typeof fromAggregatedUri>[0])
  if (!parsed) return []
  return parsed.handleUrisValues
    .filter(({ origin: o }) => o !== origin)
    .map(({ origin: o, id }) => ({
      _id: crypto.randomUUID(),
      uri: toUri({ origin: o, id }),
      origin: o, id,
      url: undefined, handles: [], titles: [], descriptions: [],
      shortDescriptions: [], covers: [], banners: [], episodes: [], trailers: []
    } satisfies GQLMedia))
}

// --- Normalization ---

const normalizeTitle = (title: UnogsTitle, bgImages?: UnogsBgImages): GQLMedia => {
  const id = String(title.netflixid)
  const decodedTitle = decodeEntities(title.title)
  const decodedSynopsis = title.synopsis ? decodeEntities(title.synopsis) : undefined

  const covers: { url: string }[] = []
  const banners: { url: string }[] = []
  if (title.img) covers.push({ url: httpsUrl(title.img) })
  if (bgImages) {
    const poster = bgImages.bo166x236?.[0]?.url
    if (poster && !covers.some(c => c.url === poster)) covers.push({ url: poster })
    const banner = bgImages.bo665x375?.[0]?.url ?? bgImages.bo342x192?.[0]?.url
    if (banner) banners.push({ url: banner })
    const bg = bgImages.bg?.[0]?.url
    if (bg) banners.push({ url: bg })
  }
  if (title.lgimg && !banners.some(b => b.url === title.lgimg)) banners.push({ url: title.lgimg })

  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin, id,
    url: `https://www.netflix.com/title/${title.netflixid}`,
    handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis ? [{ language: 'en', description: decodedSynopsis }] : [],
    shortDescriptions: decodedSynopsis ? [{ language: 'en', shortDescription: decodedSynopsis }] : [],
    covers, banners,
    episodes: [], trailers: [],
    startDate: title.nfdate ? new Date(title.nfdate).toISOString() : undefined,
    averageScore: title.imdbrating ?? undefined
  } satisfies GQLMedia
}

const normalizeSearchResult = (result: { title: string, nfid: number, synopsis: string, img: string }): GQLMedia => {
  const id = String(result.nfid)
  const decodedTitle = decodeEntities(result.title)
  const decodedSynopsis = result.synopsis ? decodeEntities(result.synopsis) : undefined
  const imgUrl = result.img ? httpsUrl(result.img) : undefined

  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin, id,
    url: `https://www.netflix.com/title/${result.nfid}`,
    handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis ? [{ language: 'en', description: decodedSynopsis }] : [],
    shortDescriptions: decodedSynopsis ? [{ language: 'en', shortDescription: decodedSynopsis }] : [],
    covers: imgUrl ? [{ url: imgUrl }] : [],
    banners: [], episodes: [], trailers: []
  } satisfies GQLMedia
}

const normalizeEpisode = (episode: UnogsEpisode, mediaUri: string, episodeNumber: number): GQLEpisode => {
  const id = String(episode.epid)
  const imgUrl = episode.img ? httpsUrl(episode.img) : undefined
  const decodedTitle = decodeEntities(episode.title)
  const synopsis = episode.synopsis?.trim()
  const decodedSynopsis = synopsis && !synopsis.startsWith("THIS EPISODE'S SYNOPSIS IS COMING SOON")
    ? decodeEntities(synopsis) : undefined

  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin, id,
    url: `https://www.netflix.com/watch/${episode.epid}`,
    mediaUri, handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis ? [{ language: 'en', description: decodedSynopsis }] : [],
    shortDescriptions: decodedSynopsis ? [{ language: 'en', shortDescription: decodedSynopsis }] : [],
    thumbnails: imgUrl ? [{ url: imgUrl }] : [],
    seasonNumber: episode.seasnum,
    episodeNumber
  } satisfies GQLEpisode
}

// --- Core data fetching ---

const getMedia = async (id: string, ctx: ExtractorServerContext, seasonNumber?: number): Promise<GQLMedia | undefined> => {
  const [detailRes, bgImagesRes] = await Promise.all([fetchDetail(id, ctx), fetchBgImages(id, ctx)])
  const title = detailRes[0]
  if (!title) return undefined

  const media = normalizeTitle(title, bgImagesRes)
  if (seasonNumber != null) {
    media.id = `${media.id}-${seasonNumber}`
    media.uri = toUri({ origin, id: media.id })
  }

  if (title.vtype === 'series') {
    const seasonsRes = await fetchEpisodes(id, ctx)
    const filtered = seasonNumber != null ? seasonsRes.filter(s => s.season === seasonNumber) : seasonsRes
    media.episodes = filtered.flatMap(season =>
      season.episodes.map((ep, i) => normalizeEpisode(ep, media.uri, i + 1))
    )
    media.episodeCount = media.episodes.length
  }

  return media
}

// --- Wait patterns ---

const waitForEpisodeCount = async (aggregatedUri: string, ctx: ExtractorServerContext): Promise<number | undefined> => {
  const existing = await ctx.findAggregatedMedia(aggregatedUri)
  const count = existing?.episodeCount ?? existing?.episodes?.length
  if (count) return count

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 15_000)
  try {
    for await (const _ of ctx.listenForMediaChanges({ abort: abortController.signal })) {
      const updated = await ctx.findAggregatedMedia(aggregatedUri)
      const epCount = updated?.episodeCount ?? updated?.episodes?.length
      if (epCount) return epCount
    }
  } finally {
    clearTimeout(timeout)
    abortController.abort()
  }
  return undefined
}

const waitForTitle = async (aggregatedUri: string, ctx: ExtractorServerContext): Promise<string | undefined> => {
  const existing = await ctx.findAggregatedMedia(aggregatedUri)
  const title = getFirstTitle(existing)
  if (title) return title

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 30_000)
  try {
    for await (const _ of ctx.listenForMediaChanges({ abort: abortController.signal })) {
      const t = getFirstTitle(await ctx.findAggregatedMedia(aggregatedUri))
      if (t) return t
    }
  } finally {
    clearTimeout(timeout)
    abortController.abort()
  }
  return undefined
}

// --- Media resolution ---

const searchAndLinkMedia = async (title: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const queries = [title, ...simplifyTitle(title)]
  for (const query of queries) {
    const { results = [] } = await searchApi(query, ctx)
    if (!results.length) continue

    const nfId = String(results[0]!.nfid)
    let seasonNumber: number | undefined
    const targetEpCount = await waitForEpisodeCount(aggregatedUri, ctx)
    if (targetEpCount) {
      const seasons = await fetchEpisodes(nfId, ctx)
      if (seasons.length > 1) seasonNumber = findMatchingSeason(seasons, targetEpCount)
    }

    const media = await getMedia(nfId, ctx, seasonNumber)
    if (!media) continue
    media.handles = buildHandlesFromAggregatedUri(aggregatedUri)
    return media
  }
  return null
}

const resolveMedia = async (uri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const nfUri = extractAggregatedUriOrigin(uri, origin)
  if (nfUri) {
    let seasonNumber: number | undefined
    if (isAggregatedUri(uri)) {
      const targetEpCount = await waitForEpisodeCount(uri, ctx)
      if (targetEpCount) {
        const seasons = await fetchEpisodes(nfUri.id, ctx)
        if (seasons.length > 1) seasonNumber = findMatchingSeason(seasons, targetEpCount)
      }
    }
    const media = await getMedia(nfUri.id, ctx, seasonNumber)
    if (!media) return null
    if (isAggregatedUri(uri)) media.handles = buildHandlesFromAggregatedUri(uri)
    return media
  }

  if (!isAggregatedUri(uri)) return null
  const title = await waitForTitle(uri, ctx)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx)
}

// --- Resolvers ---

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        yield { media: await resolveMedia(_uri, ctx) }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) return yield { mediaPage: { nodes: [] } }
        const { results = [] } = await searchApi(search, ctx)
        yield { mediaPage: { nodes: results.map(normalizeSearchResult) } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      const seasonsRes = await fetchEpisodes(parent.id, ctx)
      return seasonsRes.flatMap(season =>
        season.episodes.map((ep, i) => normalizeEpisode(ep, parent.uri, i + 1))
      )
    }
  }
}
