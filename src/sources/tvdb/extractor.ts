import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// TheTVDB v4 (api4.thetvdb.com) — keyful (BYOK). Login flow: POST /login { apikey, pin? }
// returns a ~1-month bearer token, cached module-level and refreshed on a 401.

const SCORE = 0.3
const BASE = 'https://api4.thetvdb.com/v4'
const ARTWORKS = 'https://artworks.thetvdb.com'

export const icon = 'https://www.thetvdb.com/images/icon.png'
export const originUrl = 'https://www.thetvdb.com'
export const categories = ['SERIES'] as const
export const name = 'TheTVDB'
export const origin = 'tvdb'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['tvdb']
export const color = '#6cd591'

const resolveImage = (path?: string): string | undefined =>
  !path ? undefined : path.startsWith('http') ? path : `${ARTWORKS}${path.startsWith('/') ? '' : '/'}${path}`

const HANDLE_ORIGINS: Record<string, string> = { imdb: 'imdb', themoviedb: 'tmdb', tmdb: 'tmdb' }

const handleUrl = (handleOrigin: string, id: string): string | undefined =>
  handleOrigin === 'imdb' ? `https://www.imdb.com/title/${id}`
  : handleOrigin === 'tmdb' ? `https://www.themoviedb.org/tv/${id}`
  : undefined

const buildHandles = (remoteIds?: { id?: string, sourceName?: string }[]): GQLMedia[] => {
  const handles: GQLMedia[] = []
  for (const remote of remoteIds ?? []) {
    const id = remote.id
    const handleOrigin = remote.sourceName ? HANDLE_ORIGINS[remote.sourceName.toLowerCase()] : undefined
    const url = id && handleOrigin ? handleUrl(handleOrigin, id) : undefined
    if (id && handleOrigin && url) handles.push(makeMedia({ origin: handleOrigin, id, url }))
  }
  return handles
}

interface LoginResponse { data?: { token?: string } }
interface RemoteId { id?: string, type?: number, sourceName?: string }
interface SearchResult { tvdb_id?: string, name?: string, overview?: string, image_url?: string, year?: string, remote_ids?: RemoteId[] }
interface SeriesExtended { id?: number, name?: string, overview?: string, image?: string, firstAired?: string, score?: number, remoteIds?: RemoteId[] }
interface EpisodeRecord { id?: number, name?: string, overview?: string, image?: string, seasonNumber?: number, number?: number, aired?: string }
interface EpisodesResponse { data?: { episodes?: EpisodeRecord[] }, links?: { next?: string } }

let token: string | undefined

const login = async (ctx: ExtractorServerContext): Promise<string | undefined> => {
  const key = ctx.key(origin)
  if (!key) return undefined
  const sep = key.indexOf(':')
  const apikey = sep === -1 ? key : key.slice(0, sep)
  const pin = sep === -1 ? undefined : key.slice(sep + 1)
  const body = JSON.stringify(pin ? { apikey, pin } : { apikey })
  const res = await ctx
    .fetch(`${BASE}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then(r => r.json() as Promise<LoginResponse>)
    .catch(() => undefined)
  return res?.data?.token
}

const ensureToken = async (ctx: ExtractorServerContext): Promise<string | undefined> => {
  if (!token) token = await login(ctx)
  return token
}

const api = async <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  if (!ctx.key(origin)) return undefined
  const auth = await ensureToken(ctx)
  if (!auth) return undefined
  const call = (bearer: string) => ctx.fetch(`${BASE}${path}`, { headers: { 'Authorization': `Bearer ${bearer}` } })
  let res = await call(auth).catch(() => undefined)
  if (res?.status === 401) {
    token = await login(ctx)
    if (!token) return undefined
    res = await call(token).catch(() => undefined)
  }
  if (!res || !res.ok) return undefined
  return res.json().then(json => json as T).catch(() => undefined)
}

const normalizeSearch = (result: SearchResult): GQLMedia | undefined => {
  const id = result.tvdb_id
  if (!id) return undefined
  return makeMedia({
    origin,
    id,
    url: `https://www.thetvdb.com/series/${id}`,
    handles: buildHandles(result.remote_ids),
    categories: ['SERIES'],
    score: SCORE,
    titles: result.name ? [{ language: 'en', title: result.name, score: SCORE }] : [],
    ...desc(result.overview, SCORE),
    covers: img(resolveImage(result.image_url), SCORE),
    startDate: result.year ? `${result.year}-01-01` : undefined,
  })
}

const normalizeSeries = (series: SeriesExtended): GQLMedia | undefined => {
  const id = series.id != null ? String(series.id) : undefined
  if (!id) return undefined
  return makeMedia({
    origin,
    id,
    url: `https://www.thetvdb.com/series/${id}`,
    handles: buildHandles(series.remoteIds),
    categories: ['SERIES'],
    score: SCORE,
    titles: series.name ? [{ language: 'en', title: series.name, score: SCORE }] : [],
    ...desc(series.overview, SCORE),
    covers: img(resolveImage(series.image), SCORE),
    startDate: series.firstAired || undefined,
    averageScore: series.score != null ? series.score : undefined,
  })
}

const normalizeEpisode = (episode: EpisodeRecord, seriesId: string, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: episode.id != null ? String(episode.id) : `${seriesId}-s${episode.seasonNumber ?? 0}e${episode.number ?? 0}`,
    mediaUri,
    score: SCORE,
    titles: episode.name ? [{ language: 'en', title: episode.name, score: SCORE }] : [],
    ...desc(episode.overview, SCORE),
    thumbnails: img(resolveImage(episode.image), SCORE),
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.number,
  })

const fetchEpisodes = async (id: string, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const episodes: GQLEpisode[] = []
  let page = 0
  while (page < 50) {
    const res = await api<EpisodesResponse>(`/series/${id}/episodes/default?page=${page}`, ctx)
    const batch = res?.data?.episodes ?? []
    for (const episode of batch) episodes.push(normalizeEpisode(episode, id, mediaUri))
    if (!res?.links?.next || batch.length === 0) break
    page += 1
  }
  return episodes
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const res = await api<{ data?: SeriesExtended }>(`/series/${id}/extended`, ctx)
  if (!res?.data) return undefined
  const media = normalizeSeries(res.data)
  if (!media) return undefined
  media.episodes = await fetchEpisodes(id, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ data?: SearchResult[] }>(`/search?query=${encodeURIComponent(query)}&type=series`, ctx)
  return (res?.data ?? [])
    .map(normalizeSearch)
    .filter((media): media is GQLMedia => !!media)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const tvdbUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: tvdbUri ? (await getMedia(tvdbUri.id, ctx)) ?? null : null }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) return yield { mediaPage: { nodes: [] } }
        yield { mediaPage: { nodes: await searchApi(search, ctx) } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      return fetchEpisodes(parent.id, parent.uri, ctx)
    }
  }
}
