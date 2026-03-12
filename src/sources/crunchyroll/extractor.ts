import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'

export const icon = 'https://static.crunchyroll.com/cxweb/assets/img/favicons/favicon-96x96.png'
export const originUrl = 'https://www.crunchyroll.com'
export const categories = ['ANIME'] as const
export const name = 'Crunchyroll'
export const origin = 'cr'
export const official = true
export const metadataOnly = false
export const isApiOnly = false
export const supportedUris = ['cr']

// Token management
type CrunchyrollAuthToken = {
  timestamp: number
  readonly access_token: string
  readonly expires_in: number
  readonly token_type: 'Bearer'
  readonly scope: string
  readonly country: string
}

let _token: CrunchyrollAuthToken | undefined
let _tokenPromise: Promise<CrunchyrollAuthToken> | undefined

const fetchToken = async (context: ExtractorServerContext): Promise<CrunchyrollAuthToken> => {
  const response = await context.fetch('https://www.crunchyroll.com/auth/v1/token', {
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: `Basic ${btoa('cr_web:')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_id',
    method: 'POST',
    mode: 'cors',
    credentials: 'include'
  })
  const res = await response.json()
  if (!res.access_token) {
    throw new Error(`Crunchyroll token fetch failed: ${JSON.stringify(res)}`)
  }
  const token: CrunchyrollAuthToken = {
    timestamp: Date.now(),
    access_token: res.access_token as string,
    expires_in: res.expires_in as number,
    token_type: 'Bearer',
    scope: 'account content offline_access',
    country: 'US'
  }
  _token = token
  return token
}

const getToken = async (context: ExtractorServerContext): Promise<CrunchyrollAuthToken> => {
  if (_token && Date.now() - _token.timestamp < _token.expires_in * 1000) {
    return _token
  }
  // Deduplicate concurrent token fetches — all callers share the same in-flight promise
  if (_tokenPromise) return _tokenPromise
  _tokenPromise = fetchToken(context).finally(() => { _tokenPromise = undefined })
  return _tokenPromise
}

// API Types
interface CrunchyrollImage {
  source: string
  width: number
  height: number
}

interface CrunchyrollSeries {
  id: string
  title: string
  slug_title: string
  description: string
  images: {
    poster_tall?: CrunchyrollImage[][]
    poster_wide?: CrunchyrollImage[][]
  }
  series_metadata?: {
    episode_count: number
    season_count: number
    is_dubbed: boolean
    is_subbed: boolean
    audio_locales: string[]
    subtitle_locales: string[]
    maturity_ratings: string[]
  }
}

interface CrunchyrollSeason {
  id: string
  channel_id: string
  title: string
  slug_title: string
  series_id: string
  season_display_number: string
  season_sequence_number: number
  season_number: number
  is_complete: boolean
  description: string
  // keywords: any[]
  season_tags: string[]
  images: {}
  extended_maturity_rating: {
    system: string
    rating: string
    level: string
  }
  maturity_ratings: string[]
  content_descriptors: string[]
  is_mature: boolean
  mature_blocked: boolean
  is_subbed: boolean
  is_dubbed: boolean
  is_simulcast: boolean
  seo_title: string
  seo_description: string
  availability_notes: string
  audio_locales: string[]
  subtitle_locales: string[]
  audio_locale: string
  versions: {
    audio_locale: string
    guid: string
    original: boolean
    variant: string
    }[]
  identifier: string
  number_of_episodes: number
}

interface CrunchyrollEpisode {
  id: string
  title: string
  description: string
  episode: string
  episode_number: number
  season_number: number
  season_id: string
  series_id: string
  series_title: string
  sequence_number: number
  duration_ms: number
  episode_air_date: string
  is_premium_only: boolean
  is_subbed: boolean
  is_dubbed: boolean
  streams_link?: string
  images?: {
    thumbnail?: CrunchyrollImage[][]
  }
}

interface SearchResult {
  type: string
  count: number
  items: CrunchyrollSeries[]
}

// Deduplicate concurrent GET requests to the same URL
const _inflightRequests = new Map<string, Promise<unknown>>()

const fetchWithAuth = async <T>(url: string, context: ExtractorServerContext): Promise<T> => {
  const existing = _inflightRequests.get(url)
  if (existing) return existing as Promise<T>

  const promise = (async () => {
    const token = await getToken(context)
    const response = await context.fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token.access_token}`,
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

export const fetchSeries = (seriesId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollSeries[] }>(
    `https://www.crunchyroll.com/content/v2/cms/series/${seriesId}?preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

export const fetchSeasons = (seriesId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollSeason[] }>(
    `https://www.crunchyroll.com/content/v2/cms/series/${seriesId}/seasons?force_locale=&preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

export const fetchEpisodes = (seasonId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollEpisode[] }>(
    `https://www.crunchyroll.com/content/v2/cms/seasons/${seasonId}/episodes?preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

export const searchSeriesApi = (query: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: SearchResult[] }>(
    `https://www.crunchyroll.com/content/v2/discover/search?q=${encodeURIComponent(query)}&n=50&type=series&locale=en-US`,
    context
  )

// Picks the largest image from Crunchyroll's nested image arrays (last group, last size)
const bestImage = (images?: CrunchyrollImage[][]) =>
  images?.at(-1)?.at(-1)?.source

// Normalization functions
const normalizeSeries = (series: CrunchyrollSeries): GQLMedia => {
  const uri = toUri({ origin, id: series.id })
  const posterUrl = bestImage(series.images?.poster_tall)
  const bannerUrl = bestImage(series.images?.poster_wide)

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id: series.id,
    url: `https://www.crunchyroll.com/series/${series.id}/${series.slug_title}`,
    handles: [],
    titles: [{ language: 'en', title: series.title }],
    descriptions: series.description
      ? [{ language: 'en', description: series.description }]
      : [],
    shortDescriptions: series.description
      ? [{ language: 'en', shortDescription: series.description }]
      : [],
    covers: posterUrl ? [{ url: posterUrl }] : [],
    banners: bannerUrl ? [{ url: bannerUrl }] : [],
    episodes: [],
    trailers: [],
    episodeCount: series.series_metadata?.episode_count
  } satisfies GQLMedia
}

const normalizeSeason = (series: CrunchyrollSeries, season: CrunchyrollSeason): GQLMedia => {
  const id = crunchyrollId(series.id, resolveSeasonId(season))
  const uri = toUri({ origin, id })
  const posterUrl = bestImage(series.images?.poster_tall)
  const bannerUrl = bestImage(series.images?.poster_wide)

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id,
    url: `https://www.crunchyroll.com/series/${series.id}`,
    handles: [],
    titles: [{ language: 'en', title: season.title }],
    descriptions: season.description
      ? [{ language: 'en', description: season.description }]
      : [],
    shortDescriptions: season.description
      ? [{ language: 'en', shortDescription: season.description }]
      : [],
    covers: posterUrl ? [{ url: posterUrl }] : [],
    banners: bannerUrl ? [{ url: bannerUrl }] : [],
    episodes: [],
    trailers: []
  } satisfies GQLMedia
}

const normalizeEpisode = (episode: CrunchyrollEpisode, mediaUri: string): GQLEpisode => {
  const id = crunchyrollId(episode.series_id, episode.season_id, episode.id)
  const thumbnailUrl = bestImage(episode.images?.thumbnail)

  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin,
    id,
    url: `https://www.crunchyroll.com/watch/${episode.id}`,
    mediaUri,
    handles: [],
    titles: [{ language: 'en', title: episode.title }],
    descriptions: episode.description
      ? [{ language: 'en', description: episode.description }]
      : [],
    shortDescriptions: episode.description
      ? [{ language: 'en', shortDescription: episode.description }]
      : [],
    thumbnails: thumbnailUrl ? [{ url: thumbnailUrl }] : [],
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    absoluteEpisodeNumber: episode.sequence_number,
    releaseDate: episode.episode_air_date
      ? new Date(episode.episode_air_date).toISOString()
      : undefined
  } satisfies GQLEpisode
}

// CR ID utils — format is `seriesId-seasonId-episodeId`
const stripLocale = (id: string) => id.replace(/JAJP$/, '')

/** Resolve the ja-JP (or original) version guid for a season, falling back to stripped season.id */
const resolveSeasonId = (season: CrunchyrollSeason): string =>
  season.versions?.find(v => v.audio_locale === 'ja-JP')?.guid
  ?? season.versions?.find(v => v.original)?.guid
  ?? stripLocale(season.id)

export const crunchyrollId = (
  seriesId: string,
  seasonId?: string,
  episodeId?: string
) => [seriesId, seasonId && stripLocale(seasonId), episodeId].filter(Boolean).join('-')

export const parseCrunchyrollId = (id: string) => {
  const parts = id.split('-')
  return {
    seriesId: parts[0],
    seasonId: parts[1],
    episodeId: parts[2]
  }
}

/** Keep only the last episode per episode_number (regular episodes come after specials in CR's ordering) */
const deduplicateByEpisodeNumber = (episodes: GQLEpisode[]): GQLEpisode[] => {
  const lastByNumber = new Map<number, GQLEpisode>()
  for (const ep of episodes) {
    if (ep.episodeNumber != null) lastByNumber.set(ep.episodeNumber, ep)
  }
  return episodes.filter(ep => ep.episodeNumber == null || lastByNumber.get(ep.episodeNumber) === ep)
}

// Composed data fetching functions
const getSeasonWithEpisodes = async (
  series: CrunchyrollSeries,
  season: CrunchyrollSeason,
  context: ExtractorServerContext
): Promise<GQLMedia> => {
  const media = normalizeSeason(series, season)
  const episodesResponse = await fetchEpisodes(resolveSeasonId(season), context)
  media.episodes = deduplicateByEpisodeNumber(episodesResponse.data.map(ep => normalizeEpisode(ep, media.uri)))
  media.episodeCount = media.episodes.length
  return media
}

const getAllEpisodes = async (
  series: CrunchyrollSeries,
  seasons: CrunchyrollSeason[],
  mediaUri: string,
  context: ExtractorServerContext
): Promise<GQLEpisode[]> => {
  const episodeResponses = await Promise.all(
    seasons.map(season => fetchEpisodes(resolveSeasonId(season), context))
  )
  const episodes = episodeResponses.flatMap(res =>
    deduplicateByEpisodeNumber(res.data.map(ep => normalizeEpisode(ep, mediaUri)))
  )
  return episodes
}

export const getMedia = async (id: string, context: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const { seriesId, seasonId } = parseCrunchyrollId(id)
  if (!seriesId) return undefined

  const [seriesResponse, seasonsResponse] = await Promise.all([
    fetchSeries(seriesId, context),
    fetchSeasons(seriesId, context)
  ])

  const series = seriesResponse?.data?.[0]
  if (!series) {
    console.warn('crunchyroll seriesResponse?.data?.[0] is undefined for', id, seriesResponse)
    return undefined
  }

  const seasons = seasonsResponse.data

  // Specific season requested — match by ID
  if (seasonId) {
    const season = seasons.find(s => stripLocale(s.id) === seasonId || resolveSeasonId(s) === seasonId)
    if (!season) return undefined
    return getSeasonWithEpisodes(series, season, context)
  }

  // Single season series — use that season directly
  if (seasons.length === 1) {
    return getSeasonWithEpisodes(series, seasons[0]!, context)
  }

  // Multi-season series — return series-level media with all episodes
  const media = normalizeSeries(series)
  media.episodes = await getAllEpisodes(series, seasons, media.uri, context)
  media.episodeCount = media.episodes.length
  return media
}

const searchMedia = async (query: string, context: ExtractorServerContext): Promise<GQLMedia[]> => {
  const searchResponse = await searchSeriesApi(query, context)
  const seriesResults = searchResponse.data.find(d => d.type === 'series')?.items ?? []
  return seriesResults.map(normalizeSeries)
}

/**
 * Matches a crunchyroll season to a media based on release date.
 * Fetches the first episode of each season and compares air dates
 * against the target date. Returns composite `seriesId-seasonId` ID,
 * or undefined if no season could be matched.
 */
export const matchSeasonByDate = async (
  seriesId: string,
  startDate: string,
  context: ExtractorServerContext
): Promise<string | undefined> => {
  const targetDate = new Date(startDate)
  if (isNaN(targetDate.getTime())) return undefined

  const seasonsResponse = await fetchSeasons(seriesId, context)
  const seasons = seasonsResponse.data

  if (!seasons.length) return undefined
  if (seasons.length === 1 && seasons[0]) return crunchyrollId(seriesId, resolveSeasonId(seasons[0]))

  // Prefer Japanese audio seasons for matching
  const jaSeasons = seasons.filter(s => s.audio_locale === 'ja-JP')
  const matchSeasons = jaSeasons.length > 0 ? jaSeasons : seasons

  const seasonWithDates = await Promise.all(
    matchSeasons.map(async season => {
      const resolvedId = resolveSeasonId(season)
      const episodesResponse = await fetchEpisodes(resolvedId, context)
      const firstEpisode = episodesResponse.data[0]
      return {
        resolvedId,
        firstAirDate: firstEpisode?.episode_air_date
          ? new Date(firstEpisode.episode_air_date)
          : undefined
      }
    })
  )

  let bestMatch: { seasonId: string, diff: number } | undefined

  for (const { resolvedId, firstAirDate } of seasonWithDates) {
    if (!firstAirDate) continue
    const diff = Math.abs(firstAirDate.getTime() - targetDate.getTime())
    if (!bestMatch || diff < bestMatch.diff) {
      bestMatch = { seasonId: resolvedId, diff }
    }
  }

  return bestMatch ? crunchyrollId(seriesId, bestMatch.seasonId) : undefined
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
        yield {
          media
        }
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
      // If episodes were already populated (e.g. from Subscription.media), return them
      if (parent.episodes?.length) return parent.episodes

      const { seriesId, seasonId } = parseCrunchyrollId(parent.id)
      if (!seriesId) return []

      const seasonsResponse = await fetchSeasons(seriesId, ctx)
      const seasons = seasonsResponse.data

      // Specific season requested
      if (seasonId) {
        const season = seasons.find(s => stripLocale(s.id) === seasonId || resolveSeasonId(s) === seasonId)
        if (!season) return []
        const episodesResponse = await fetchEpisodes(resolveSeasonId(season), ctx)
        return deduplicateByEpisodeNumber(episodesResponse.data.map(ep => normalizeEpisode(ep, parent.uri)))
      }

      // Single season — use it directly
      if (seasons.length === 1 && seasons[0]) {
        const episodesResponse = await fetchEpisodes(resolveSeasonId(seasons[0]), ctx)
        return deduplicateByEpisodeNumber(episodesResponse.data.map(ep => normalizeEpisode(ep, parent.uri)))
      }

      // Multi-season — fetch all episodes from all seasons
      const seriesResponse = await fetchSeries(seriesId, ctx)
      const series = seriesResponse.data[0]
      if (!series) return []
      return getAllEpisodes(series, seasons, parent.uri, ctx)
    }
  }
}
