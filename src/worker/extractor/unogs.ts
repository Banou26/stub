import type { ExtractorServerContext } from '../extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'

export const icon = 'https://unogs.com/favicon.ico'
export const originUrl = 'https://unogs.com'
export const categories = ['ANIME'] as const
export const name = 'uNoGS'
export const origin = 'nf'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['nf']

// Token management
let _token: string | undefined
let _tokenExpiry: number = 0
let _tokenPromise: Promise<string> | undefined

const fetchToken = async (ctx: ExtractorServerContext): Promise<string> => {
  const response = await ctx.fetch('https://unogs.com/api/user', {
    headers: {
      'accept': 'application/json',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: `user_name=${Date.now()}.804`,
    method: 'POST',
    mode: 'cors',
    credentials: 'include'
  })
  const res = await response.json() as UnogsAuthResponse
  if (!res.token?.access_token) {
    throw new Error(`uNoGS token fetch failed: ${JSON.stringify(res)}`)
  }
  _token = res.token.access_token
  // JWT tokens from uNoGS expire in ~24h, cache for 12h to be safe
  _tokenExpiry = Date.now() + 12 * 60 * 60 * 1000
  return _token
}

const getToken = async (ctx: ExtractorServerContext): Promise<string> => {
  if (_token && Date.now() < _tokenExpiry) {
    return _token
  }
  if (_tokenPromise) return _tokenPromise
  _tokenPromise = fetchToken(ctx).finally(() => { _tokenPromise = undefined })
  return _tokenPromise
}

// API Types
interface UnogsAuthResponse {
  token: {
    access_token: string
  }
}

interface UnogsTitle {
  netflixid: number
  title: string
  matlabel: string | null
  matlevel: string | null
  avgrating: number
  predrating: number | null
  synopsis: string
  vtype: string
  img: string
  lgimg: string
  nfid: number
  runtime: number
  nfdate: string
  curdate: string
  year: number
  imdbposter: string | null
  imdbgenre: string | null
  imdbrated: string | null
  imdbruntime: string | null
  imdbawards: string | null
  imdbcountry: string | null
  imdblanguage: string | null
  imdbrating: number | null
  imdbid: string | null
  imdbplot: string | null
  imdbmetascore: string | null
  imdbvotes: string | null
  imdblocalimage: string | null
  top250: number | null
  top250tv: number | null
}

interface UnogsBgImages {
  bo166x236: UnogsImage[]
  bo342x192: UnogsImage[]
  bo665x375: UnogsImage[]
  bg: UnogsImage[]
}

interface UnogsImage {
  url: string
  width: number
}

interface UnogsPeopleGroup {
  type: string
  arr: { fullname: string }[]
}

interface UnogsCountry {
  cc: string
  id: number
  country: string
  seasdet: string
  expiredate: string | null
  newdate: string
  audio: string
  subtitle: string
  hd: string
  uhd: string
  '3d': string | null
}

interface UnogsSeasonEpisodes {
  season: number
  episodes: UnogsEpisode[]
}

interface UnogsEpisode {
  epid: number
  seasid: number
  epnum: number
  seasnum: number
  synopsis: string
  title: string
  img: string
}

interface UnogsSearchResult {
  title: string
  id: number
  img: string
  vtype: string
  nfid: number
  slug: string
  synopsis: string
  avgrating: number
  year: number
  runtime: number
  imdbid: string | null
  top250: number | null
  top250tv: number | null
}

interface UnogsSearchResponse {
  total: number
  elapse: number
  results: UnogsSearchResult[]
}

// Deduplicate concurrent GET requests to the same URL
const _inflightRequests = new Map<string, Promise<unknown>>()

const fetchWithAuth = async <T>(url: string, ctx: ExtractorServerContext): Promise<T> => {
  const existing = _inflightRequests.get(url)
  if (existing) return existing as Promise<T>

  const promise = (async () => {
    const token = await getToken(ctx)
    const response = await ctx.fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      method: 'GET',
      mode: 'cors',
      credentials: 'include'
    })
    return await response.json() as T
  })()

  _inflightRequests.set(url, promise)
  promise.finally(() => _inflightRequests.delete(url))
  return promise
}

// API functions
const fetchDetail = (netflixId: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsTitle[]>(
    `https://unogs.com/api/title/detail?netflixid=${netflixId}`,
    ctx
  )

const fetchBgImages = (netflixId: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsBgImages>(
    `https://unogs.com/api/title/bgimages?netflixid=${netflixId}`,
    ctx
  )

const fetchPeople = (netflixId: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsPeopleGroup[]>(
    `https://unogs.com/api/title/people?netflixid=${netflixId}`,
    ctx
  )

const fetchCountries = (netflixId: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsCountry[]>(
    `https://unogs.com/api/title/countries?netflixid=${netflixId}`,
    ctx
  )

const fetchEpisodes = (netflixId: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsSeasonEpisodes[]>(
    `https://unogs.com/api/title/episodes?netflixid=${netflixId}`,
    ctx
  )

const searchApi = (query: string, ctx: ExtractorServerContext) =>
  fetchWithAuth<UnogsSearchResponse>(
    `https://unogs.com/api/search?limit=50&offset=0&query=${encodeURIComponent(query)}&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`,
    ctx
  )

// HTML entity decoder
const decodeEntities = (str: string): string =>
  str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")

// Normalization functions
const normalizeTitle = (title: UnogsTitle, bgImages?: UnogsBgImages): GQLMedia => {
  const id = String(title.netflixid)
  const uri = toUri({ origin, id })

  const covers: { url: string }[] = []
  const banners: { url: string }[] = []

  if (title.img) covers.push({ url: title.img.replace(/^http:/, 'https:') })
  if (bgImages) {
    const poster = bgImages.bo166x236?.[0]?.url
    if (poster && !covers.some(c => c.url === poster)) covers.push({ url: poster })

    const banner = bgImages.bo665x375?.[0]?.url ?? bgImages.bo342x192?.[0]?.url
    if (banner) banners.push({ url: banner })

    const bg = bgImages.bg?.[0]?.url
    if (bg) banners.push({ url: bg })
  }
  if (title.lgimg && !banners.some(b => b.url === title.lgimg)) {
    banners.push({ url: title.lgimg })
  }

  const decodedTitle = decodeEntities(title.title)
  const decodedSynopsis = title.synopsis ? decodeEntities(title.synopsis) : undefined

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id,
    url: `https://www.netflix.com/title/${title.netflixid}`,
    handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis
      ? [{ language: 'en', description: decodedSynopsis }]
      : [],
    shortDescriptions: decodedSynopsis
      ? [{ language: 'en', shortDescription: decodedSynopsis }]
      : [],
    covers,
    banners,
    episodes: [],
    trailers: [],
    startDate: title.nfdate ? new Date(title.nfdate).toISOString() : undefined,
    averageScore: title.imdbrating ?? undefined,
  } satisfies GQLMedia
}

const normalizeSearchResult = (result: UnogsSearchResult): GQLMedia => {
  const id = String(result.nfid)
  const uri = toUri({ origin, id })

  const decodedTitle = decodeEntities(result.title)
  const decodedSynopsis = result.synopsis ? decodeEntities(result.synopsis) : undefined
  const imgUrl = result.img?.replace(/^http:/, 'https:')

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id,
    url: `https://www.netflix.com/title/${result.nfid}`,
    handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis
      ? [{ language: 'en', description: decodedSynopsis }]
      : [],
    shortDescriptions: decodedSynopsis
      ? [{ language: 'en', shortDescription: decodedSynopsis }]
      : [],
    covers: imgUrl ? [{ url: imgUrl }] : [],
    banners: [],
    episodes: [],
    trailers: [],
  } satisfies GQLMedia
}

const normalizeEpisode = (episode: UnogsEpisode, mediaUri: string): GQLEpisode => {
  const id = String(episode.epid)
  const imgUrl = episode.img?.replace(/^http:/, 'https:')
  const decodedTitle = decodeEntities(episode.title)
  const synopsis = episode.synopsis?.trim()
  const decodedSynopsis =
    synopsis && synopsis !== '' && !synopsis.startsWith("THIS EPISODE'S SYNOPSIS IS COMING SOON")
      ? decodeEntities(synopsis)
      : undefined

  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin,
    id,
    url: undefined,
    mediaUri,
    handles: [],
    titles: [{ language: 'en', title: decodedTitle }],
    descriptions: decodedSynopsis
      ? [{ language: 'en', description: decodedSynopsis }]
      : [],
    shortDescriptions: decodedSynopsis
      ? [{ language: 'en', shortDescription: decodedSynopsis }]
      : [],
    thumbnails: imgUrl ? [{ url: imgUrl }] : [],
    seasonNumber: episode.seasnum,
    episodeNumber: episode.epnum,
  } satisfies GQLEpisode
}

// Composed data fetching
const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const [detailRes, bgImagesRes] = await Promise.all([
    fetchDetail(id, ctx),
    fetchBgImages(id, ctx),
  ])

  const title = detailRes[0]
  if (!title) return undefined

  const media = normalizeTitle(title, bgImagesRes)

  if (title.vtype === 'series') {
    const seasonsRes = await fetchEpisodes(id, ctx)
    media.episodes = seasonsRes.flatMap(season =>
      season.episodes.map(ep => normalizeEpisode(ep, media.uri))
    )
    media.episodeCount = media.episodes.length
  }

  return media
}

const searchMedia = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const searchResponse = await searchApi(query, ctx)
  return (searchResponse.results ?? []).map(normalizeSearchResult)
}

// Resolvers
export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (!uri) return yield { media: null }
        const media = await getMedia(uri.id, ctx) ?? null
        yield { media }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        yield { mediaPage: { nodes: search ? await searchMedia(search, ctx) : [] } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes

      const seasonsRes = await fetchEpisodes(parent.id, ctx)
      return seasonsRes.flatMap(season =>
        season.episodes.map(ep => normalizeEpisode(ep, parent.uri))
      )
    }
  }
}
