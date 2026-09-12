import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode, MediaScope, SimilarMediaInput } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img, getFirstTitle, simplifyTitle, buildHandlesFromUri, waitForMedia, pickTitleMatch, declaredEpisodeCount } from '../utils'
import { pickSimilarSeason, type SeasonCandidate } from '../similar'
import { yearAppearsInShow } from '../catalogue-gate'
import { percentScore } from '../average-score'

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

type NetflixSeason = { season: number, episodes: UnogsEpisode[] }

const UNOGS = 'https://unogs.com/api'

const fetchDetail = (id: string, ctx: ExtractorServerContext) =>
  api<UnogsTitle[]>(`${UNOGS}/title/detail?netflixid=${id}`, ctx)

const fetchBgImages = (id: string, ctx: ExtractorServerContext) =>
  api<UnogsBgImages>(`${UNOGS}/title/bgimages?netflixid=${id}`, ctx)

const fetchEpisodes = (id: string, ctx: ExtractorServerContext) =>
  api<NetflixSeason[]>(`${UNOGS}/title/episodes?netflixid=${id}`, ctx)

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
    averageScore: percentScore(title.imdbrating, 10)
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
 * Exported for tests/unit/sources/unogs/extractor.test.ts, which drives it directly; nothing else imports it.
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
  const seasons = title.vtype === 'series' ? await fetchEpisodes(id, ctx) : undefined
  return assembleMedia(title, bgImagesRes, seasons, seasonNumber)
}

// The media out of payloads already in hand, so `similarSeason` can reuse the detail and episode
// responses it has just read for the pick instead of fetching them a second time.
const assembleMedia = (
  title: UnogsTitle,
  bgImages: UnogsBgImages | undefined,
  seasons: NetflixSeason[] | undefined,
  seasonNumber?: number
): GQLMedia => {
  const media = normalizeTitle(title, bgImages)
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
    if (!Array.isArray(seasons)) return media
    const filtered = seasonNumber != null ? seasons.filter(s => s.season === seasonNumber) : seasons
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
 * Netflix's seasons as the shared picker reads them.
 *
 * unOGS gives no air date at any level (`UnogsEpisode` is epid, seasnum, synopsis, title, img), so the
 * axes are the count, the episode titles and, on the FIRST season only, the title's year: Netflix's
 * `year` is the whole title's, which is its first season's, and offered on any other season it would
 * veto the very run that season holds.
 */
const netflixCandidates = (seasons: NetflixSeason[], titleYear?: number | string | null): SeasonCandidate<NetflixSeason>[] =>
  [...seasons].sort((a, b) => a.season - b.season).map((season, index) => ({
    season,
    seasonNumber: season.season,
    episodeCount: season.episodes.length,
    episodeTitles: season.episodes.map(episode => decode(episode.title ?? '')),
    year: index === 0 ? Number(titleYear) || undefined : undefined
  }))

/**
 * Which of this Netflix series' seasons is the cluster asking, or the whole TITLE when nothing settles it.
 *
 * The rules are `pickSimilarSeason` in ../similar.ts, shared with every source that answers
 * `similarMedia`. What this file measured on its way there, over 33 real multi-season Netflix series
 * and their 105 anime runs (`scripts/measure-unogs-season-match.probe.ts`): the episode count alone is
 * ambiguous for 48 of the 105, and answering anyway landed 51 runs on a season another run already
 * held. A UNIQUE count is still a guess: Netflix lists Mushoku Tensei as 24, 25 and 11 episodes, anime
 * season 1 has 11 and a title naming no season, so the count picked Netflix season 3 for it while
 * season 3's own page took the same `nf:80987039-3` by its ordinal (2026-09-05, five of five runs of
 * `scripts/reproduce-season-weld.mjs`). One id, two runs, and `graph.link` has no inverse.
 *
 * What is not a season is the TITLE: the bare `nf:<id>` scoped CONTAINER, which the store hangs the
 * run under as PART_OF. The Netflix link survives on the page and asserts nothing.
 *
 * WHAT THIS SOURCE STILL CANNOT DO, recorded rather than hidden: Netflix does not agree with anime
 * about what a season is. It splits Fullmetal Alchemist's single 64 episode run into five seasons of
 * about 13 and folds Mushoku Tensei's five runs into three. No amount of counting fixes a disagreement
 * about the unit; the fold veto only ever detects the direction it can see.
 */
type NetflixMatch = { kind: 'season', season: number } | { kind: 'title' }

const matchNetflixSeason = async (
  nfId: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext,
  titleYear?: number | string | null
): Promise<NetflixMatch | undefined> => {
  const known = await waitForMedia<GQLMedia>(aggregatedUri, ctx, media =>
    declaredEpisodeCount(media) ? media as GQLMedia : undefined
  )
  if (!known) return undefined

  const seasons = await fetchEpisodes(nfId, ctx)
  if (!Array.isArray(seasons) || !seasons.length) return undefined

  const verdict = pickSimilarSeason(
    {
      titles: (known.titles ?? []).map(title => title.title),
      episodeCount: declaredEpisodeCount(known),
      startDate: known.startDate
    },
    netflixCandidates(seasons, titleYear)
  )
  return verdict ? { kind: 'season', season: verdict.season.season } : { kind: 'title' }
}

/**
 * The one Netflix season of `showId` that the caller's evidence establishes as its run, built as a
 * season-scoped RUN carrying no handles, or undefined. A film is not a container and has nothing to
 * pick; a refusal by the picker is undefined too, never the title.
 */
const similarSeason = async (input: SimilarMediaInput, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  if (!input?.showId) return undefined
  const detail = (await fetchDetail(input.showId, ctx))?.[0]
  if (detail?.vtype !== 'series') return undefined
  const seasons = await fetchEpisodes(input.showId, ctx)
  if (!Array.isArray(seasons) || !seasons.length) return undefined
  const verdict = pickSimilarSeason(input, netflixCandidates(seasons, detail.year))
  if (!verdict) return undefined
  return assembleMedia(detail, await fetchBgImages(input.showId, ctx), seasons, verdict.season.season)
}

/**
 * The Netflix media a cluster may link to: its season as a RUN, or the whole title as a CONTAINER.
 *
 * Exported for tests/unit/sources/unogs/extractor.test.ts. A film is itself, since it has no seasons to be confused between.
 * The container carries no episode list: every media in this store is one run, and a show's episodes
 * flattened across seasons collide on episodeNumber (crunchyroll/extractor.ts records the measurement).
 * `vtype` and `year` are the search payload's when the caller has it, which saves the detail request.
 */
export const linkNetflix = async (
  nfId: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext,
  vtype?: string,
  year?: number | string | null
): Promise<GQLMedia | undefined> => {
  const detail = vtype === undefined ? (await fetchDetail(nfId, ctx))[0] : undefined
  const kind = vtype ?? detail?.vtype
  if (kind !== 'series') return getMedia(nfId, ctx, undefined, true)
  const match = await matchNetflixSeason(nfId, aggregatedUri, ctx, year ?? detail?.year)
  if (!match) return undefined
  if (match.kind === 'season') return getMedia(nfId, ctx, match.season, true)
  const title = await getMedia(nfId, ctx, undefined, false)
  if (!title) return undefined
  title.episodes = []
  title.episodeCount = undefined
  return title
}

/**
 * One year of slack, and it is the CATALOGUE's year that gets it.
 *
 * The record's own season-level year axis is exact on both of the places it is written down:
 * `yearAppearsInShow` asks for membership and `similar.ts`'s `yearVetoed` for equality. The slack is
 * here because unOGS publishes a LISTING year rather than a premiere, and a film released late in one
 * year is routinely listed under the next. It buys that one case and nothing else: measured over the
 * recorded season corpus it changes no row, since the nearest refused weld is three years out (The
 * Monkey King 2023 against a 2026 run) and both correct film matches are exact.
 */
const LISTING_YEAR_TOLERANCE = 1

/**
 * The year the cluster asking is FROM, as a date the shared year axis reads, or nothing.
 *
 * `seasonYear` first because it survives a coerced date: a source that knows only the broadcast season
 * carries its year there and leaves `startDate` empty, and `mal:64867` in the corpus is exactly that,
 * a run whose only year anywhere is a seasonYear. Nothing at all is undefined, never a guess.
 *
 * Exported for tests/unit/sources/unogs/search-year.test.ts, which measures the gate below over the
 * recorded corpus and has to read a run's year the same way this file does.
 */
export const runYearDate = (
  known: { seasonYear?: number | null, startDate?: string | null } | null | undefined
): string | undefined =>
  known?.seasonYear ? `${known.seasonYear}-01-01` : known?.startDate ?? undefined

/**
 * The DATE half of the search gate: a film whose own year is not the asking run's is a different work.
 *
 * Measured on the recorded summer-2026 season corpus (223 runs, `tests/corpus/`): the search welds a
 * bare Netflix title id into 16 runs whose hand-checked labels say the two are different works. Every
 * one of them clears the title axis and clears the category veto, both of which are about the title
 * and nothing else, and what the sixteen share is a year nobody read. Hollow Man (2000) taken for
 * Potato Man, Indiana Jones and the Last Crusade (1989) for a 2026 Avatar film, The Monkey King (2023)
 * for the 2026 anime of that name, The 40-Year-Old Virgin (2005) for Cherry and Virgin, the two 2012
 * Madoka compilation films for the 2026 fourth one. Fourteen of the sixteen are films carrying their
 * own year and are refused here, 3 to 43 years out. The other two are season picks on a SERIES, which
 * this gate does not judge and cannot: see below.
 *
 * TITLE PICKS THE SHOW, DATE PICKS THE RUN, the rule every other catalogue gate in this tree already
 * runs on (../catalogue-gate.ts). Nothing about the title axis moved to make room for this:
 * TITLE_MATCH_THRESHOLD stays 0.44, calibrated over 243194 correct pairs against 139507 wrong ones,
 * and no threshold could have caught these anyway. Scored with the runs' own recorded titles, The
 * Monkey King reaches 0.7164 against Monkey King and the Madoka compilation 0.7021 against the fourth
 * film, both of them ABOVE the 0.505 that "Cowboy Bebop" scores against "Cowboy Bebop: The Movie",
 * the correct match the threshold is pinned on. There is no number on this axis that separates them.
 *
 * FILMS ONLY, and that is what the payload MEANS rather than caution. unOGS publishes one year per
 * title. On a film that year is the work's. On a series it is the whole TITLE's, which is its first
 * season's, so read as this run's year it would veto the very season that holds the run:
 * `netflixCandidates` below offers it to season 1 alone for exactly that reason, and
 * `yearAppearsInShow` carries what a show-level year does to season-to-parent links (admits 16.543%
 * where season-level membership admits 93.221%).
 *
 * REFUSED BEFORE THE RANKING, never after. `pickTitleMatch` keeps the best scorer, so a wrongly dated
 * candidate left in the list can outscore the right one and take the link with it.
 *
 * SILENCE NEVER BLOCKS. A candidate with no year, or a run whose cluster names no year yet, passes
 * exactly as before: a refusal on absent evidence would drop the link for every run whose date has not
 * landed on the tick its title did, and `graph.link` has no inverse in either direction.
 */
export const filmDatedAnotherYear = (
  result: Pick<UnogsSearchResult, 'vtype' | 'year'>,
  runDate: string | null | undefined
): boolean => {
  if (result.vtype !== 'movie' || !runDate) return false
  // the detail endpoint serves this year as a string where the search payload types it as a number,
  // which is why `netflixCandidates` coerces it too
  const listed = Number(result.year)
  if (!listed) return false
  return !yearAppearsInShow(
    runDate,
    Array.from({ length: LISTING_YEAR_TOLERANCE * 2 + 1 }, (_, index) => listed - LISTING_YEAR_TOLERANCE + index)
  )
}

const searchAndLinkMedia = async (
  title: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext,
  categories?: readonly string[] | null,
  runDate?: string
): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const { results = [] } = await searchApi(query, ctx)
    if (!results.length) continue
    // gate BEFORE linkNetflix, which is up to four requests spent on a hit that may
    // name nothing we asked for. The search response already carries everything the gate reads.
    const match = await pickTitleMatch(
      query,
      results.filter(result => !filmDatedAnotherYear(result, runDate)).map(result => ({
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
    const media = await linkNetflix(nfId, aggregatedUri, ctx, match.result.vtype, match.result.year)
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
  // the whole media, not just its title, because the format gate needs its categories, the date gate
  // its year, and a second waitForMedia would race the first
  const known = await waitForMedia(uri, ctx, m => (getFirstTitle(m) ? m : undefined), 30_000)
  const title = getFirstTitle(known)
  if (!title) return null
  // the wait is still on the TITLE alone, because the year is read as evidence and never as a
  // requirement: a cluster that publishes its year a tick later loses the date axis for this call, and
  // a wait that demanded one would lose the link outright for every run that never carries one
  return searchAndLinkMedia(title, uri, ctx, known?.categories, runYearDate(known))
}

export const resolvers: Resolvers = {
  Subscription: {
    similarMedia: {
      // always yield once: a generator that completes without yielding makes yoga respond 204 and the
      // caller waits out its timeout instead of reading the refusal
      subscribe: async function* (_, { input }, ctx: ExtractorServerContext) {
        yield { similarMedia: await similarSeason(input, ctx) ?? null }
      }
    },
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
