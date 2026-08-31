import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img, getFirstTitle, simplifyTitle, buildHandlesFromUri, waitForMedia, pickTitleMatch } from '../utils'
import { parseSeasonNumber, pickSeasonByEpisodeCount } from '../season'

const SCORE = 0.2

export const icon = 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2023.ico'
export const originUrl = 'https://www.netflix.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Netflix'
export const origin = 'nf'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['nf']

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
  year: number | null
  imdbid: string | null
  imdbrating: number | null
}

interface UnogsSearchResult {
  title: string
  nfid: number
  synopsis: string
  img: string
  vtype?: string
  year?: number | null
  imdbid?: string | null
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
  api<{ results: UnogsSearchResult[] }>(
    `${UNOGS}/search?limit=50&offset=0&query=${encodeURIComponent(query)}&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`,
    ctx
  )

const decode = (str: string): string =>
  str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")

const httpsUrl = (url: string) => url.replace(/^http:/, 'https:')

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
    categories: title.vtype === 'movie' ? ['MOVIE'] : ['SERIES'],
    titles: [{ language: 'en', title: decode(title.title), score: SCORE }],
    ...desc(title.synopsis ? decode(title.synopsis) : undefined, SCORE),
    covers, banners,
    startDate: title.year ? `${title.year}-01-01` : undefined,
    averageScore: title.imdbrating ?? undefined
  })
}

const normalizeSearchResult = (result: UnogsSearchResult): GQLMedia =>
  makeMedia({
    origin,
    id: String(result.nfid),
    url: `https://www.netflix.com/title/${result.nfid}`,
    score: SCORE,
    categories: result.vtype === 'movie' ? ['MOVIE'] : ['SERIES'],
    titles: [{ language: 'en', title: decode(result.title), score: SCORE }],
    ...desc(result.synopsis ? decode(result.synopsis) : undefined, SCORE),
    covers: result.img ? img(httpsUrl(result.img), SCORE) : [],
    startDate: result.year ? `${result.year}-01-01` : undefined
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

// Netflix serves movies at /watch/<id> just like episodes, so the synthetic episode gets a playable url rather than /title/<id>
const normalizeMovieAsEpisode = (media: GQLMedia): GQLEpisode =>
  makeMovieEpisode(media, { url: `https://www.netflix.com/watch/${media.id}`, score: SCORE })

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
  } else {
    media.episodes = [normalizeMovieAsEpisode(media)]
    media.episodeCount = 1
  }

  return media
}

/**
 * Which of this Netflix series' seasons is the cluster asking, or nothing.
 *
 * THE TITLE IS TRIED FIRST, which is what every other consumer of `pickSeasonByEpisodeCount` already
 * does (tmdb/extractor.ts:158-164, tvmaze/extractor.ts:145-148) and what that function's own doc says
 * it requires. This source skipped it and ran on the episode count alone, through a private copy of
 * the same argmin. Measured over 33 real multi-season Netflix series and their 105 anime runs
 * (`scripts/measure-unogs-season-match.probe.ts`), the count alone is ambiguous for 48 of those 105,
 * and the old code answered every one of them anyway: 51 runs landed on a season another run already
 * held, across 20 of the 33 series. Each of those is a permanent weld, since the season-scoped id
 * becomes a handle and `graph.link` has no inverse.
 *
 * An ordinal is used only when the cluster's titles AGREE on one and Netflix has it. Disagreement is a
 * refusal rather than a vote, on the same reasoning as everything else here.
 *
 * WHAT THIS SOURCE STILL CANNOT DO, recorded rather than hidden: Netflix does not agree with anime
 * about what a season is. It splits Fullmetal Alchemist's single 64 episode run into five seasons of
 * about 13 and folds Mushoku Tensei's five runs into three. No amount of counting fixes a disagreement
 * about the unit, so the honest end of this function is a refusal and unOGS simply not appearing.
 */
const resolveSeasonNumber = async (nfId: string, aggregatedUri: string, ctx: ExtractorServerContext) => {
  const known = await waitForMedia<GQLMedia>(aggregatedUri, ctx, media =>
    (media?.episodeCount ?? media?.episodes?.length) ? media as GQLMedia : undefined
  )
  if (!known) return undefined

  const seasons = await fetchEpisodes(nfId, ctx)
  if (!Array.isArray(seasons) || seasons.length <= 1) return undefined

  const named = new Set(
    (known.titles ?? [])
      .map(title => parseSeasonNumber(title.title))
      .filter((season): season is number => season != null)
  )
  if (named.size === 1) {
    const ordinal = [...named][0]!
    if (seasons.some(season => season.season === ordinal)) return ordinal
  }

  const epCount = known.episodeCount ?? known.episodes?.length
  if (!epCount) return undefined
  return pickSeasonByEpisodeCount(
    seasons.map(season => ({ seasonNumber: season.season, episodeCount: season.episodes.length })),
    epCount
  )
}

const searchAndLinkMedia = async (
  title: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext,
  categories?: readonly string[] | null
): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const { results = [] } = await searchApi(query, ctx)
    if (!results.length) continue
    // gate BEFORE resolveSeasonNumber and getMedia, which are four requests spent on a hit that may
    // name nothing we asked for. The search response already carries everything the gate reads.
    const match = await pickTitleMatch(
      query,
      results.map(result => ({
        result,
        // the search payload leaves the title html-escaped, and normalizeSearchResult is the only place
        // that decoded it, so a raw compare would put `&amp;` against `&`
        title: decode(result.title),
        categories: result.vtype === 'movie' ? ['MOVIE'] : ['SERIES'],
      })),
      categories
    )
    if (!match) continue
    const nfId = String(match.result.nfid)
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
    // nfUri.id may carry a season suffix (e.g. '81726714-2') from a previous aggregation
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
  // the whole media, not just its title, because the format gate needs its categories and a second
  // waitForMedia would race the first
  const known = await waitForMedia(uri, ctx, m => (getFirstTitle(m) ? m : undefined), 30_000)
  const title = getFirstTitle(known)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx, known?.categories)
}

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
      if (isMovie(parent)) return [normalizeMovieAsEpisode(parent)]
      const seasonsRes = await fetchEpisodes(parent.id, ctx)
      if (!Array.isArray(seasonsRes)) return parent.episodes ?? []
      return seasonsRes.flatMap(season =>
        season.episodes.map((ep, i) => normalizeEpisode(ep, parent.uri, i + 1))
      )
    }
  }
}
