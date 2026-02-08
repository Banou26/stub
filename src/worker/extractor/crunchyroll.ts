import type { ExtractorServerContext } from '../extractor'
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

const fetchToken = async (context: ExtractorServerContext): Promise<CrunchyrollAuthToken> =>
  context.fetch('https://www.crunchyroll.com/auth/v1/token', {
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
    .then(res => res.json())
    .then(res => {
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
    })

const getToken = async (context: ExtractorServerContext): Promise<CrunchyrollAuthToken> => {
  if (_token && Date.now() - _token.timestamp < _token.expires_in * 1000) {
    return _token
  }
  return fetchToken(context)
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
  title: string
  series_id: string
  season_number: number
  description: string
  is_subbed: boolean
  is_dubbed: boolean
  audio_locale: string
  audio_locales: string[]
  subtitle_locales: string[]
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

// API functions
const fetchWithAuth = async <T>(url: string, context: ExtractorServerContext): Promise<T> => {
  const token = await getToken(context)
  return context.fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: `Bearer ${token.access_token}`,
    },
    method: 'GET',
    mode: 'cors',
    credentials: 'include'
  }).then(res => res.json() as Promise<T>)
}

const fetchSeries = (seriesId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollSeries[] }>(
    `https://www.crunchyroll.com/content/v2/cms/series/${seriesId}?preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

const fetchSeasons = (seriesId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollSeason[] }>(
    `https://www.crunchyroll.com/content/v2/cms/series/${seriesId}/seasons?force_locale=&preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

const fetchEpisodes = (seasonId: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: CrunchyrollEpisode[] }>(
    `https://www.crunchyroll.com/content/v2/cms/seasons/${seasonId}/episodes?preferred_audio_language=ja-JP&locale=en-US`,
    context
  )

const searchSeriesApi = (query: string, context: ExtractorServerContext) =>
  fetchWithAuth<{ total: number; data: SearchResult[] }>(
    `https://www.crunchyroll.com/content/v2/discover/search?q=${encodeURIComponent(query)}&n=50&type=series&locale=en-US`,
    context
  )

// Picks the largest image from Crunchyroll's nested image arrays (last group, last size)
const bestImage = (images?: CrunchyrollImage[][]): string | undefined => {
  const group = images?.[images.length - 1]
  return group?.[group.length - 1]?.source
}

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
  const id = `${series.id}-${season.id}`
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
  const id = `${episode.series_id}-${episode.season_id}-${episode.id}`
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

// ID parsing
const parseMediaId = (id: string) => {
  const parts = id.split('-')
  return {
    seriesId: parts[0],
    seasonId: parts[1],
    episodeId: parts[2]
  }
}

// Composed data fetching functions
const getSeasonWithEpisodes = async (
  series: CrunchyrollSeries,
  season: CrunchyrollSeason,
  context: ExtractorServerContext
): Promise<GQLMedia> => {
  const media = normalizeSeason(series, season)
  const episodesResponse = await fetchEpisodes(season.id, context)
  media.episodes = episodesResponse.data.map(ep => normalizeEpisode(ep, media.uri))
  media.episodeCount = media.episodes.length
  return media
}

const getMedia = async (id: string, context: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const { seriesId, seasonId } = parseMediaId(id)
  if (!seriesId) return undefined

  const [seriesResponse, seasonsResponse] = await Promise.all([
    fetchSeries(seriesId, context),
    fetchSeasons(seriesId, context)
  ])

  const series = seriesResponse.data[0]
  if (!series) return undefined

  const seasons = seasonsResponse.data

  // Specific season requested — match by ID
  if (seasonId) {
    const season = seasons.find(s => s.id === seasonId)
    if (!season) return undefined
    return getSeasonWithEpisodes(series, season, context)
  }

  // Single season series — use that season directly
  if (seasons.length === 1) {
    return getSeasonWithEpisodes(series, seasons[0]!, context)
  }

  // Multi-season series without specific season — return series-level media
  return normalizeSeries(series)
}

const searchMedia = async (query: string, context: ExtractorServerContext): Promise<GQLMedia[]> => {
  const searchResponse = await searchSeriesApi(query, context)
  const seriesResults = searchResponse.data.find(d => d.type === 'series')?.items ?? []
  return seriesResults.map(normalizeSeries)
}

// Resolvers
export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (!uri) return yield { media: null }
        yield {
          media: await getMedia(uri.id, ctx) ?? null
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
      if (parent.origin !== origin) return undefined
      // If episodes were already populated (e.g. from Subscription.media), return them
      if (parent.episodes?.length) return parent.episodes

      const { seriesId, seasonId } = parseMediaId(parent.id)
      if (!seriesId) return undefined

      const seasonsResponse = await fetchSeasons(seriesId, ctx)
      const season =
        seasonId
          ? seasonsResponse.data.find(s => s.id === seasonId)
          : seasonsResponse.data.length === 1
            ? seasonsResponse.data[0]
            : undefined
      if (!season) return undefined

      const episodesResponse = await fetchEpisodes(season.id, ctx)
      return episodesResponse.data.map(ep => normalizeEpisode(ep, parent.uri))
    }
  }
}
