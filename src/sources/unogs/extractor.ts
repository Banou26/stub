import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode, MediaScope } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img, getFirstTitle, simplifyTitle, buildHandlesFromUri, waitForMedia, pickTitleMatch } from '../utils'
import { parseSeasonNumber } from '../season'

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

// A bare `nf:<netflixid>` is the whole Netflix TITLE: exact for a film, every season at once for a
// series. Only the season rewrite in `getMedia` turns a series id into a run.
const titleScope = (vtype: string | undefined): MediaScope => vtype === 'movie' ? 'RUN' : 'CONTAINER'

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
    scope: titleScope(title.vtype),
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
    scope: titleScope(result.vtype),
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

/**
 * Exported for ./extractor.test.ts, which drives it directly; nothing else imports it.
 *
 * `requireSeason` is what makes a refusal actually refuse.
 *
 * Without it, a series whose season could not be resolved still produced a media: `seasonNumber` being
 * undefined skips the suffix below, so the uri stays the BARE `nf:<showId>`, the episode filter stops
 * filtering and every season's episodes are attached, and the caller then links the cluster's handles
 * to it. Two runs of one show that both fail to resolve therefore receive the identical show-level uri
 * and union-find welds them, permanently, which is the exact failure this source's season scoping
 * exists to prevent.
 *
 * Measured over 33 multi-season Netflix series and 105 runs: refusing into the show-level id accounted
 * for 30 of 41 welds, and declining to mint anything drops that to 11. The cost is the 56 runs that
 * resolve to no season showing no Netflix row at all, which is the tradeoff already taken for imdb in
 * worker/store/db.ts: a link that has to assert a false identity to exist is not worth having.
 *
 * Callers that do NOT attach cluster handles pass false, because a direct `nf:<id>` browse is the user
 * naming that Netflix title and welds nothing.
 */
/**
 * What a search may offer: FILMS ONLY, for the same reason justwatch's `showRequiresSeason` refuses a
 * seasonless series.
 *
 * A bare `nf:<netflixid>` is the whole Netflix TITLE. For a film that is exact, since a film has no
 * seasons to be confused between. For a series it names every season at once, and this endpoint returns
 * no season information, so there is nothing here to scope it with.
 *
 * An unscoped series id does real damage rather than being merely vague. Measured on the deployed site:
 * searching Mushoku Tensei put the bare `nf:80987039` inside season 1's cluster, with no media page ever
 * opened, claiming the whole show IS that one cour (scripts/reproduce-season-weld.mjs, ARM A). The media
 * path is untouched and still resolves a season, minting `nf:80987039-3`.
 *
 * `vtype` is OPTIONAL on the search payload where the detail payload requires it, so anything that is
 * not exactly 'movie' is read as a series and refused. That is the safe direction, and it is the same
 * ternary `normalizeSearchResult` already uses to assign `categories`.
 */
export const searchNodes = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const { results = [] } = await searchApi(query, ctx)
  return results.filter(result => result.vtype === 'movie').map(normalizeSearchResult)
}

export const getMedia = async (
  id: string,
  ctx: ExtractorServerContext,
  seasonNumber?: number,
  requireSeason = false
): Promise<GQLMedia | undefined> => {
  const [detailRes, bgImagesRes] = await Promise.all([fetchDetail(id, ctx), fetchBgImages(id, ctx)])
  const title = detailRes[0]
  if (!title) return undefined
  if (requireSeason && seasonNumber == null && title.vtype === 'series') return undefined

  const media = normalizeTitle(title, bgImagesRes)
  if (seasonNumber != null) {
    media.id = `${media.id}-${seasonNumber}`
    media.uri = toUri({ origin, id: media.id })
    media.scope = 'RUN'
    // A SEASON-scoped media may never carry the SHOW's year, and only the id used to be rewritten here.
    //
    // `normalizeTitle` stamps `${title.year}-01-01`, which is Netflix's year for the whole TITLE, so
    // every season of a show carried its FIRST season's year. That is not merely inaccurate: it welds
    // seasons together by a route that looks nothing like a date problem. `profileCluster` derives its
    // `years` set from every member's startDate and `fuzzyMergeMediaClusters` buckets by year, so a
    // season 3 media carrying 2021 is compared against the 2021 clusters, where a shared title is
    // enough. Measured on production 2026-09-05: `nf:80987039-3` carried 2021 and put Mushoku Tensei
    // season 3 in season 1's bucket.
    //
    // Nothing is asserted instead of guessing, because unOGS gives no season premiere to use:
    // `UnogsEpisode` carries epid, seasnum, synopsis, title and img, and no air date at all. An absent
    // date costs this source a year bucket; a wrong one costs a permanent weld, and `graph.link` has no
    // inverse. `tvmaze/extractor.ts`, `appletv/extractor.ts` and `tmdb/extractor.ts` each fixed exactly
    // this in their own file; this one was missed.
    media.startDate = undefined
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
 * Which of this Netflix series' seasons is the cluster asking, or the whole TITLE when nothing settles it.
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
 * A UNIQUE COUNT MATCH IS STILL A GUESS, and it is the one that welded Mushoku Tensei on the live site
 * after every other route was closed (2026-09-05, `scripts/reproduce-season-weld.mjs`, five of five
 * runs). Netflix lists that title as three seasons of 24, 25 and 11 episodes. Anime season 1 has 11
 * episodes and a title naming no season, so the count picked Netflix season 3 for it, while season 3's
 * own page took the same `nf:80987039-3` by its title's ordinal. One id, two runs, no inverse. So:
 *
 *   - titles agreeing on an ordinal Netflix has name that season, UNLESS Netflix's season holds MORE
 *     episodes than the run, which means Netflix folded several runs into it (its season 2 is 25
 *     episodes over anime's 13 and 12) and the season is a CONTAINER of ours, not the same thing;
 *   - titles naming no season may be a first season, and only Netflix's FIRST season is tried, by an
 *     exact count. Any other count match is a coincidence about a number, not an identity;
 *   - titles that disagree are a refusal to guess.
 *
 * What is not a season is the TITLE: the bare `nf:<id>` scoped CONTAINER, which the store hangs the
 * run under as PART_OF. The Netflix link survives on the page and asserts nothing.
 *
 * WHAT THIS SOURCE STILL CANNOT DO, recorded rather than hidden: Netflix does not agree with anime
 * about what a season is. It splits Fullmetal Alchemist's single 64 episode run into five seasons of
 * about 13 and folds Mushoku Tensei's five runs into three. No amount of counting fixes a disagreement
 * about the unit; the fold check above only ever detects the direction it can see.
 */
type NetflixMatch = { kind: 'season', season: number } | { kind: 'title' }

const matchNetflixSeason = async (nfId: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<NetflixMatch | undefined> => {
  const known = await waitForMedia<GQLMedia>(aggregatedUri, ctx, media =>
    (media?.episodeCount ?? media?.episodes?.length) ? media as GQLMedia : undefined
  )
  if (!known) return undefined

  const seasons = await fetchEpisodes(nfId, ctx)
  if (!Array.isArray(seasons) || !seasons.length) return undefined

  const epCount = known.episodeCount ?? known.episodes?.length
  if (!epCount) return undefined

  const named = new Set(
    (known.titles ?? [])
      .map(title => parseSeasonNumber(title.title))
      .filter((season): season is number => season != null)
  )
  if (named.size > 1) return { kind: 'title' }
  if (named.size === 1) {
    const ordinal = [...named][0]!
    const season = seasons.find(candidate => candidate.season === ordinal)
    if (season) return season.episodes.length > epCount ? { kind: 'title' } : { kind: 'season', season: ordinal }
  }

  // Netflix listing ONE season is the ordinary single-cour case, and it is most of them: 14 of 20
  // single-cour anime checked on 2026-09-01 had exactly one. It is taken only when its length is
  // exactly ours, which keeps the ordinary case and still declines a listing that folded several of
  // our runs into a single season. With no ordinal only the FIRST season can be ours, on the same test.
  const first = [...seasons].sort((a, b) => a.season - b.season)[0]!
  return first.episodes.length === epCount ? { kind: 'season', season: first.season } : { kind: 'title' }
}

/**
 * The Netflix media a cluster may link to: its season as a RUN, or the whole title as a CONTAINER.
 *
 * Exported for ./extractor.test.ts. A film is itself, since it has no seasons to be confused between.
 * The container carries no episode list: every media in this store is one run, and a show's episodes
 * flattened across seasons collide on episodeNumber (crunchyroll/extractor.ts records the measurement).
 */
export const linkNetflix = async (
  nfId: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext,
  vtype?: string
): Promise<GQLMedia | undefined> => {
  const kind = vtype ?? (await fetchDetail(nfId, ctx))[0]?.vtype
  if (kind !== 'series') return getMedia(nfId, ctx, undefined, true)
  const match = await matchNetflixSeason(nfId, aggregatedUri, ctx)
  if (!match) return undefined
  if (match.kind === 'season') return getMedia(nfId, ctx, match.season, true)
  const title = await getMedia(nfId, ctx, undefined, false)
  if (!title) return undefined
  title.episodes = []
  title.episodeCount = undefined
  return title
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
    // gate BEFORE linkNetflix, which is up to four requests spent on a hit that may
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
    const media = await linkNetflix(nfId, aggregatedUri, ctx, match.result.vtype)
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
    // only the aggregated path attaches handles below, so only it can weld and only it must refuse
    const media = existingSeason != null || !isAggregatedUri(uri)
      ? await getMedia(nfId, ctx, existingSeason, isAggregatedUri(uri))
      : await linkNetflix(nfId, uri, ctx)
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
        yield { mediaPage: { nodes: await searchNodes(search, ctx) } }
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
