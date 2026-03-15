import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

export const icon = 'https://static.crunchyroll.com/cxweb/assets/img/favicons/favicon-96x96.png'
export const originUrl = 'https://www.crunchyroll.com'
export const categories = ['ANIME'] as const
export const name = 'Crunchyroll'
export const origin = 'cr'
export const official = true
export const metadataOnly = false
export const isApiOnly = false
export const supportedUris = ['cr']

// Auth

type Token = { timestamp: number, access_token: string, expires_in: number }
let _token: Token | undefined
let _tokenPromise: Promise<Token> | undefined

const getToken = async (ctx: ExtractorServerContext): Promise<Token> => {
  if (_token && Date.now() - _token.timestamp < _token.expires_in * 1000) return _token
  if (_tokenPromise) return _tokenPromise
  _tokenPromise = (async () => {
    const res = await ctx.fetch('https://www.crunchyroll.com/auth/v1/token', {
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Basic ${btoa('cr_web:')}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_id',
      method: 'POST',
      mode: 'cors',
      credentials: 'include'
    }).then(r => r.json())
    if (!res.access_token) throw new Error(`Crunchyroll token fetch failed: ${JSON.stringify(res)}`)
    return (_token = { timestamp: Date.now(), access_token: res.access_token, expires_in: res.expires_in })
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
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token.access_token}`
      },
      mode: 'cors',
      credentials: 'include'
    }).then(r => r.json() as T)
  )
  _inflight.set(url, promise)
  promise.finally(() => _inflight.delete(url))
  return promise
}

interface CrSeries {
  id: string
  title: string
  slug_title: string
  description: string
  images: { poster_tall?: { source: string }[][], poster_wide?: { source: string }[][] }
  series_metadata?: { episode_count: number }
}

interface CrSeason {
  id: string
  title: string
  description: string
  audio_locale: string
  versions?: { audio_locale: string, guid: string, original: boolean }[]
}

interface CrEpisode {
  id: string
  title: string
  description: string
  episode_number: number
  season_number: number
  season_id: string
  series_id: string
  sequence_number: number
  episode_air_date: string
  images?: { thumbnail?: { source: string }[][] }
}

const CMS = 'https://www.crunchyroll.com/content/v2/cms'

const fetchSeries = (id: string, ctx: ExtractorServerContext) =>
  api<{ data: CrSeries[] }>(`${CMS}/series/${id}?preferred_audio_language=ja-JP&locale=en-US`, ctx)

const fetchSeasons = (id: string, ctx: ExtractorServerContext) =>
  api<{ data: CrSeason[] }>(`${CMS}/series/${id}/seasons?force_locale=&preferred_audio_language=ja-JP&locale=en-US`, ctx)

const fetchEpisodes = (seasonId: string, ctx: ExtractorServerContext) =>
  api<{ data: CrEpisode[] }>(`${CMS}/seasons/${seasonId}/episodes?preferred_audio_language=ja-JP&locale=en-US`, ctx)

const searchSeries = (query: string, ctx: ExtractorServerContext) =>
  api<{ data: { type: string, items: CrSeries[] }[] }>(
    `https://www.crunchyroll.com/content/v2/discover/search?q=${encodeURIComponent(query)}&n=50&type=series&locale=en-US`,
    ctx
  )

export const resolveEpisodeToSeriesId = async (
  episodeId: string,
  ctx: ExtractorServerContext
) => {
  const res = await api<{ data: { episode_metadata?: { series_id: string, season_id: string } }[] }>(
    `${CMS}/objects/${episodeId}?ratings=true&locale=en-US`, ctx
  )
  const meta = res.data?.[0]?.episode_metadata
  return meta?.series_id ? { seriesId: meta.series_id, seasonId: meta.season_id } : undefined
}

// ID utils

const stripLocale = (id: string) => id.replace(/JAJP$/, '')

const resolveSeasonId = (season: CrSeason): string =>
  season.versions?.find(v => v.audio_locale === 'ja-JP')?.guid
  ?? season.versions?.find(v => v.original)?.guid
  ?? stripLocale(season.id)

export const crunchyrollId = (seriesId: string, seasonId?: string, episodeId?: string) =>
  [seriesId, seasonId && stripLocale(seasonId), episodeId].filter(Boolean).join('-')

// Normalization

const bestImage = (images?: { source: string }[][]) => images?.at(-1)?.at(-1)?.source

const normalizeMedia = (id: string, title: string, description: string, series: CrSeries, episodeCount?: number): GQLMedia =>
  makeMedia({
    origin,
    id,
    url: `https://www.crunchyroll.com/series/${series.id}/${series.slug_title}`,
    titles: [{ language: 'en', title }],
    ...desc(description),
    covers: img(bestImage(series.images?.poster_tall)),
    banners: img(bestImage(series.images?.poster_wide)),
    episodeCount
  })

const normalizeEpisode = (ep: CrEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: crunchyrollId(ep.series_id, ep.season_id, ep.id),
    mediaUri,
    url: `https://www.crunchyroll.com/watch/${ep.id}`,
    titles: [{ language: 'en', title: ep.title }],
    ...desc(ep.description),
    thumbnails: img(bestImage(ep.images?.thumbnail)),
    seasonNumber: ep.season_number,
    episodeNumber: ep.episode_number,
    absoluteEpisodeNumber: ep.sequence_number,
    releaseDate: ep.episode_air_date ? new Date(ep.episode_air_date).toISOString() : undefined
  })

/** Keep only the last episode per episode_number (regular episodes come after specials in CR's ordering) */
const deduplicateEpisodes = (episodes: GQLEpisode[]): GQLEpisode[] => {
  const lastByNumber = new Map<number, GQLEpisode>()
  for (const ep of episodes) {
    if (ep.episodeNumber != null) lastByNumber.set(ep.episodeNumber, ep)
  }
  return episodes.filter(ep => ep.episodeNumber == null || lastByNumber.get(ep.episodeNumber) === ep)
}

const fetchNormalizedEpisodes = async (seasonId: string, mediaUri: string, ctx: ExtractorServerContext) => {
  const { data } = await fetchEpisodes(seasonId, ctx)
  return deduplicateEpisodes(data.map(ep => normalizeEpisode(ep, mediaUri)))
}

// Core data fetching

const findSeason = (seasons: CrSeason[], seasonId: string) =>
  seasons.find(s => stripLocale(s.id) === seasonId || resolveSeasonId(s) === seasonId)

export const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const [seriesId, seasonId] = id.split('-')
  if (!seriesId) return undefined

  const [seriesRes, seasonsRes] = await Promise.all([fetchSeries(seriesId, ctx), fetchSeasons(seriesId, ctx)])
  const series = seriesRes.data[0]
  if (!series) return undefined

  const seasons = seasonsRes.data
  const targetSeason = seasonId
    ? findSeason(seasons, seasonId)
    : seasons.length === 1 ? seasons[0] : undefined

  if (seasonId && !targetSeason) return undefined

  const media = targetSeason
    ? normalizeMedia(crunchyrollId(seriesId, resolveSeasonId(targetSeason)), targetSeason.title, targetSeason.description, series)
    : normalizeMedia(series.id, series.title, series.description, series)

  media.episodes = targetSeason
    ? await fetchNormalizedEpisodes(resolveSeasonId(targetSeason), media.uri, ctx)
    : (await Promise.all(seasons.map(s => fetchNormalizedEpisodes(resolveSeasonId(s), media.uri, ctx)))).flat()
  media.episodeCount = media.episodes.length
  return media
}

export const matchSeasonByDate = async (
  seriesId: string, startDate: string, ctx: ExtractorServerContext
): Promise<string | undefined> => {
  const targetDate = new Date(startDate)
  if (isNaN(targetDate.getTime())) return undefined

  const { data: seasons } = await fetchSeasons(seriesId, ctx)
  if (!seasons.length) return undefined
  if (seasons.length === 1 && seasons[0]) return crunchyrollId(seriesId, resolveSeasonId(seasons[0]))

  const jaSeasons = seasons.filter(s => s.audio_locale === 'ja-JP')
  const candidates = jaSeasons.length > 0 ? jaSeasons : seasons

  const seasonDates = await Promise.all(
    candidates.map(async season => {
      const resolvedId = resolveSeasonId(season)
      const { data } = await fetchEpisodes(resolvedId, ctx)
      return { resolvedId, airDate: data[0]?.episode_air_date ? new Date(data[0].episode_air_date) : undefined }
    })
  )

  let best: { id: string, diff: number } | undefined
  for (const { resolvedId, airDate } of seasonDates) {
    if (!airDate) continue
    const diff = Math.abs(airDate.getTime() - targetDate.getTime())
    if (!best || diff < best.diff) best = { id: resolvedId, diff }
  }
  return best ? crunchyrollId(seriesId, best.id) : undefined
}

// Resolvers

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (!uri) return yield { media: null }
        yield { media: await getMedia(uri.id, ctx) ?? null }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) return yield { mediaPage: { nodes: [] } }
        const res = await searchSeries(search, ctx)
        const items = res.data.find(d => d.type === 'series')?.items ?? []
        yield { mediaPage: { nodes: items.map(s => normalizeMedia(s.id, s.title, s.description, s, s.series_metadata?.episode_count)) } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      return (await getMedia(parent.id, ctx))?.episodes ?? []
    }
  }
}
