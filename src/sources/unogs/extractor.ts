import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img, getFirstTitle, simplifyTitle, buildHandlesFromUri, waitForMedia } from '../utils'

const SCORE = 0.2

export const icon = 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2023.ico'
export const originUrl = 'https://www.netflix.com'
export const categories = ['ANIME'] as const
export const name = 'Netflix'
export const origin = 'nf'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['nf']

// Auth

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

// API

const _inflight = new Map<string, Promise<unknown>>()

const api = async <T>(url: string, ctx: ExtractorServerContext): Promise<T> => {
  const existing = _inflight.get(url)
  if (existing) return existing as Promise<T>
  const promise = getToken(ctx).then(token =>
    ctx.fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        REFERRER: 'http://unogs.com',
        referer: 'http://unogs.com'
      },
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

// Helpers

const decode = (str: string): string =>
  str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")

const httpsUrl = (url: string) => url.replace(/^http:/, 'https:')

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

// Normalization

const normalizeTitle = (title: UnogsTitle, bgImages?: UnogsBgImages): GQLMedia => {
  const covers: { url: string, score: number }[] = []
  const banners: { url: string, score: number }[] = []
  if (title.img) covers.push({ url: httpsUrl(title.img), score: SCORE })
  if (bgImages) {
    const poster = bgImages.bo166x236?.[0]?.url
    if (poster && !covers.some(c => c.url === poster)) covers.push({ url: poster, score: SCORE })
    const banner = bgImages.bo665x375?.[0]?.url ?? bgImages.bo342x192?.[0]?.url
    if (banner) banners.push({ url: banner, score: SCORE })
    const bg = bgImages.bg?.[0]?.url
    if (bg) banners.push({ url: bg, score: SCORE })
  }
  if (title.lgimg && !banners.some(b => b.url === title.lgimg)) banners.push({ url: title.lgimg, score: SCORE })

  return makeMedia({
    origin,
    id: String(title.netflixid),
    url: `https://www.netflix.com/title/${title.netflixid}`,
    score: SCORE,
    titles: [{ language: 'en', title: decode(title.title), score: SCORE }],
    ...desc(title.synopsis ? decode(title.synopsis) : undefined, SCORE),
    covers, banners,
    startDate: title.nfdate ? new Date(title.nfdate).toISOString() : undefined,
    averageScore: title.imdbrating ?? undefined
  })
}

const normalizeSearchResult = (result: { title: string, nfid: number, synopsis: string, img: string }): GQLMedia =>
  makeMedia({
    origin,
    id: String(result.nfid),
    url: `https://www.netflix.com/title/${result.nfid}`,
    score: SCORE,
    titles: [{ language: 'en', title: decode(result.title), score: SCORE }],
    ...desc(result.synopsis ? decode(result.synopsis) : undefined, SCORE),
    covers: result.img ? img(httpsUrl(result.img), SCORE) : []
  })

const normalizeEpisode = (episode: UnogsEpisode, mediaUri: string, episodeNumber: number): GQLEpisode => {
  const synopsis = episode.synopsis?.trim()
  const decodedSynopsis = synopsis && !synopsis.startsWith("THIS EPISODE'S SYNOPSIS IS COMING SOON")
    ? decode(synopsis) : undefined
  return makeEpisode({
    origin,
    id: String(episode.epid),
    mediaUri,
    url: `https://www.netflix.com/watch/${episode.epid}`,
    score: SCORE,
    titles: [{ language: 'en', title: decode(episode.title), score: SCORE }],
    ...desc(decodedSynopsis, SCORE),
    thumbnails: episode.img ? img(httpsUrl(episode.img), SCORE) : [],
    seasonNumber: episode.seasnum,
    episodeNumber
  })
}

// Core data fetching

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
    if (!Array.isArray(seasonsRes)) return media
    const filtered = seasonNumber != null ? seasonsRes.filter(s => s.season === seasonNumber) : seasonsRes
    media.episodes = filtered.flatMap(season =>
      season.episodes.map((ep, i) => normalizeEpisode(ep, media.uri, i + 1))
    )
    media.episodeCount = media.episodes.length
  }

  return media
}

// Media resolution

const resolveSeasonNumber = async (nfId: string, aggregatedUri: string, ctx: ExtractorServerContext) => {
  const epCount = await waitForMedia(aggregatedUri, ctx, m => m?.episodeCount ?? m?.episodes?.length)
  if (!epCount) return undefined
  const seasons = await fetchEpisodes(nfId, ctx)
  return seasons.length > 1 ? findMatchingSeason(seasons, epCount) : undefined
}

const searchAndLinkMedia = async (title: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const { results = [] } = await searchApi(query, ctx)
    if (!results.length) continue
    const nfId = String(results[0]!.nfid)
    const seasonNumber = await resolveSeasonNumber(nfId, aggregatedUri, ctx)
    const media = await getMedia(nfId, ctx, seasonNumber)
    if (!media) continue
    media.handles = buildHandlesFromUri(aggregatedUri, origin)
    return media
  }
  return null
}

const resolveMedia = async (uri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const nfUri = extractAggregatedUriOrigin(uri, origin)
  if (nfUri) {
    // nfUri.id may contain a season suffix (e.g., '81726714-2') from a previous aggregation
    const dashIdx = nfUri.id.indexOf('-')
    const nfId = dashIdx !== -1 ? nfUri.id.slice(0, dashIdx) : nfUri.id
    const existingSeason = dashIdx !== -1 ? Number(nfUri.id.slice(dashIdx + 1)) : undefined
    const seasonNumber = existingSeason
      ?? (isAggregatedUri(uri) ? await resolveSeasonNumber(nfId, uri, ctx) : undefined)
    const media = await getMedia(nfId, ctx, seasonNumber)
    if (!media) return null
    if (isAggregatedUri(uri)) media.handles = buildHandlesFromUri(uri, origin)
    return media
  }
  if (!isAggregatedUri(uri)) return null
  const title = await waitForMedia(uri, ctx, m => getFirstTitle(m), 30_000)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx)
}

// Resolvers

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
      if (!Array.isArray(seasonsRes)) return parent.episodes ?? []
      return seasonsRes.flatMap(season =>
        season.episodes.map((ep, i) => normalizeEpisode(ep, parent.uri, i + 1))
      )
    }
  }
}
