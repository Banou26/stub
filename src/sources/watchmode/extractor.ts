import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// Watchmode (watchmode.com) — streaming-availability + metadata. Keyful (BYOK): reads the
// user's key via ctx.key('watchmode'); without a key the source no-ops. Emits imdb/tmdb
// handles plus a handle per streaming source so results merge with stub's other sources.

const SCORE = 0.25

export const icon = 'https://api.watchmode.com/favicon.ico'
export const originUrl = 'https://www.watchmode.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Watchmode'
export const origin = 'watchmode'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['watchmode']
export const color = '#1fb6ff'

const API_BASE = 'https://api.watchmode.com/v1'

interface WatchmodeSearchResult {
  id?: number
  name?: string
  type?: string
  year?: number
  imdb_id?: string | null
  tmdb_id?: number | null
  tmdb_type?: string | null
}

interface WatchmodeDetail {
  id?: number
  title?: string
  type?: string
  plot_overview?: string | null
  year?: number
  imdb_id?: string | null
  tmdb_id?: number | null
  tmdb_type?: string | null
  poster?: string | null
  user_rating?: number | null
}

interface WatchmodeSource {
  source_id?: number
  name?: string
  type?: string
  region?: string
  web_url?: string | null
  format?: string
}

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  const key = ctx.key(origin)
  if (!key) return Promise.resolve(undefined)
  const sep = path.includes('?') ? '&' : '?'
  return ctx.fetch(`${API_BASE}${path}${sep}apiKey=${key}`).then(r => r.json() as Promise<T>).catch(() => undefined)
}

const STREAM_HOST_ORIGIN_MAP: { match: (host: string) => boolean, origin: string }[] = [
  { match: host => host.endsWith('crunchyroll.com'), origin: 'cr' },
  { match: host => host.endsWith('netflix.com'), origin: 'nf' },
  { match: host => host.endsWith('hulu.com'), origin: 'hulu' },
  { match: host => host.endsWith('disneyplus.com'), origin: 'disney' },
  { match: host => host.endsWith('primevideo.com') || host.includes('amazon.'), origin: 'amazon' },
  { match: host => host.endsWith('max.com') || host.endsWith('hbomax.com'), origin: 'hbo' },
]

const streamOriginForHost = (host: string): string | undefined =>
  STREAM_HOST_ORIGIN_MAP.find(entry => entry.match(host))?.origin

const streamContentId = (webUrl: string, fallbackId: string): string => {
  try {
    const parts = new URL(webUrl).pathname.split('/').filter(Boolean)
    return parts.at(-1) ?? fallbackId
  } catch {
    return fallbackId
  }
}

const sourceToHandle = (source: WatchmodeSource, fallbackId: string): GQLMedia | undefined => {
  const webUrl = source.web_url
  if (!webUrl) return undefined
  let host: string
  try {
    host = new URL(webUrl).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
  const mappedOrigin = streamOriginForHost(host)
  if (!mappedOrigin) return undefined
  return makeMedia({ origin: mappedOrigin, id: streamContentId(webUrl, fallbackId), url: webUrl })
}

const idHandles = (idSource: { imdb_id?: string | null, tmdb_id?: number | null, tmdb_type?: string | null }): GQLMedia[] => {
  const handles: GQLMedia[] = []
  const imdbId = idSource.imdb_id
  if (imdbId) handles.push(makeMedia({ origin: 'imdb', id: imdbId, url: `https://www.imdb.com/title/${imdbId}` }))
  const tmdbId = idSource.tmdb_id
  if (tmdbId != null) {
    const tmdbType = idSource.tmdb_type === 'movie' ? 'movie' : 'tv'
    handles.push(makeMedia({ origin: 'tmdb', id: String(tmdbId), url: `https://www.themoviedb.org/${tmdbType}/${tmdbId}` }))
  }
  return handles
}

const dedupeHandles = (handles: GQLMedia[]): GQLMedia[] => {
  const seen = new Set<string>()
  const out: GQLMedia[] = []
  for (const handle of handles) {
    if (seen.has(handle.uri)) continue
    seen.add(handle.uri)
    out.push(handle)
  }
  return out
}

const categoriesForType = (type: string | undefined): ('MOVIE' | 'SERIES')[] =>
  type && (type.includes('movie') || type.includes('short_film')) ? ['MOVIE'] : ['SERIES']

const normalizeSearchResult = (result: WatchmodeSearchResult): GQLMedia | undefined => {
  const wmId = result.id
  if (wmId == null) return undefined
  const id = String(wmId)
  return makeMedia({
    origin,
    id,
    url: `https://www.watchmode.com/title/${id}/`,
    handles: idHandles(result),
    score: SCORE,
    categories: categoriesForType(result.type),
    titles: result.name ? [{ language: 'en', title: result.name, score: SCORE }] : [],
  })
}

const normalizeDetail = (detail: WatchmodeDetail, sources: WatchmodeSource[]): GQLMedia | undefined => {
  const wmId = detail.id
  if (wmId == null) return undefined
  const id = String(wmId)
  const rating = detail.user_rating
  const sourceHandles = sources
    .map(source => sourceToHandle(source, id))
    .filter((handle): handle is GQLMedia => !!handle)
  return makeMedia({
    origin,
    id,
    url: `https://www.watchmode.com/title/${id}/`,
    handles: dedupeHandles([...idHandles(detail), ...sourceHandles]),
    score: SCORE,
    categories: categoriesForType(detail.type),
    titles: detail.title ? [{ language: 'en', title: detail.title, score: SCORE }] : [],
    ...desc(detail.plot_overview ?? undefined, SCORE),
    covers: img(detail.poster ?? undefined, SCORE),
    averageScore: rating != null ? Math.round(rating * 10) : undefined,
  })
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const [detail, sources] = await Promise.all([
    api<WatchmodeDetail>(`/title/${encodeURIComponent(id)}/details/`, ctx),
    api<WatchmodeSource[]>(`/title/${encodeURIComponent(id)}/sources/`, ctx),
  ])
  if (!detail) return undefined
  return normalizeDetail(detail, Array.isArray(sources) ? sources : [])
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ title_results?: WatchmodeSearchResult[] }>(
    `/search/?search_field=name&search_value=${encodeURIComponent(query)}`,
    ctx
  )
  return (res?.title_results ?? [])
    .map(normalizeSearchResult)
    .filter((media): media is GQLMedia => !!media)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const watchmodeUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: watchmodeUri ? (await getMedia(watchmodeUri.id, ctx)) ?? null : null }
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
    episodes: async (parent, _, _ctx: ExtractorServerContext): Promise<GQLEpisode[]> =>
      parent.origin !== origin ? parent.episodes ?? [] : parent.episodes ?? []
  }
}
