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

const fetchWithAuth = async <T>(url: string, context: ExtractorServerContext): Promise<T> => {
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

const getAllEpisodes = async (
  series: CrunchyrollSeries,
  seasons: CrunchyrollSeason[],
  mediaUri: string,
  context: ExtractorServerContext
): Promise<GQLEpisode[]> => {
  console.log('cr getAllEpisodes called with', seasons.length, 'seasons:', seasons.map(s => `${s.id}(${s.title})`))
  const episodeResponses = await Promise.all(
    seasons.map(season => fetchEpisodes(season.id, context))
  )
  const episodes = episodeResponses.flatMap(res => res.data.map(ep => normalizeEpisode(ep, mediaUri)))
  console.log('cr getAllEpisodes result:', episodes.length, 'episodes')
  return episodes
}

const getMedia = async (id: string, context: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const { seriesId, seasonId } = parseMediaId(id)
  console.log('cr getMedia', { id, seriesId, seasonId, hasFetch: typeof context.fetch })
  if (!seriesId) return undefined

  const [seriesResponse, seasonsResponse] = await Promise.all([
    fetchSeries(seriesId, context),
    fetchSeasons(seriesId, context)
  ])

  const series = seriesResponse.data[0]
  console.log('cr getMedia series:', series?.id, series?.title, 'seasons:', seasonsResponse?.data?.length, 'raw seasons data:', JSON.stringify(seasonsResponse)?.slice(0, 300))
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

// Resolvers
export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        console.log('cr Subscription.media called with uri:', _uri)
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        console.log('cr extracted uri:', uri)
        if (!uri) return yield { media: null }
        const media = await getMedia(uri.id, ctx) ?? null
        console.log('cr media result:', media)
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
      console.log('cr Media.episodes resolver called for', parent.origin, parent.id, 'existing episodes:', parent.episodes?.length ?? 0)
      if (parent.origin !== origin) return parent.episodes ?? []
      // If episodes were already populated (e.g. from Subscription.media), return them
      if (parent.episodes?.length) return parent.episodes

      const { seriesId, seasonId } = parseMediaId(parent.id)
      if (!seriesId) return []

      const seasonsResponse = await fetchSeasons(seriesId, ctx)
      const seasons = seasonsResponse.data

      // Specific season requested
      if (seasonId) {
        const season = seasons.find(s => s.id === seasonId)
        if (!season) return []
        const episodesResponse = await fetchEpisodes(season.id, ctx)
        return episodesResponse.data.map(ep => normalizeEpisode(ep, parent.uri))
      }

      // Single season — use it directly
      if (seasons.length === 1 && seasons[0]) {
        const episodesResponse = await fetchEpisodes(seasons[0].id, ctx)
        return episodesResponse.data.map(ep => normalizeEpisode(ep, parent.uri))
      }

      // Multi-season — fetch all episodes from all seasons
      const seriesResponse = await fetchSeries(seriesId, ctx)
      const series = seriesResponse.data[0]
      if (!series) return []
      return getAllEpisodes(series, seasons, parent.uri, ctx)
    }
  }
}
