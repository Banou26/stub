import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode, MediaCategory } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// Simkl (simkl.com) — keyful (BYOK) cross-id aggregator. The user's key is an app client_id,
// passed as the 'simkl-api-key' header. Without a key the source no-ops. Simkl's value is its
// strong id bridging — it emits imdb/tmdb/mal/anilist/kitsu handles so results merge with stub.

const SCORE = 0.3
const API = 'https://api.simkl.com'
const IMG = 'https://simkl.in'

export const icon = 'https://simkl.com/favicon.ico'
export const originUrl = 'https://simkl.com'
export const categories = ['ANIME', 'TV'] as const
export const name = 'Simkl'
export const origin = 'simkl'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['simkl']
export const color = '#0b0f10'

type SimklType = 'tv' | 'anime' | 'movies'

interface SimklIds {
  simkl?: number
  simkl_id?: number
  slug?: string
  imdb?: string
  tmdb?: string
  mal?: string
  anilist?: string
  kitsu?: string
}
interface SimklRatings {
  simkl?: { rating?: number }
  imdb?: { rating?: number }
  mal?: { rating?: number }
}
interface SimklSearchEntry {
  title?: string
  year?: number
  poster?: string
  endpoint_type?: string
  ids?: SimklIds
  ratings?: SimklRatings
}
interface SimklDetail {
  title?: string
  en_title?: string | null
  year?: number
  ids?: SimklIds
  poster?: string
  fanart?: string
  overview?: string
  first_aired?: string
  ratings?: SimklRatings
}
interface SimklEpisode {
  title?: string
  description?: string | null
  season?: number
  episode?: number
  type?: string
  img?: string
  date?: string
}

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  const key = ctx.key(origin)
  if (!key) return Promise.resolve(undefined)
  return ctx.fetch(`${API}${path}`, { headers: { 'simkl-api-key': key } }).then(r => r.json() as Promise<T>).catch(() => undefined)
}

const poster = (path?: string): string | undefined => (path ? `${IMG}/posters/${path}_m.jpg` : undefined)
const fanart = (path?: string): string | undefined => (path ? `${IMG}/fanart/${path}_w.jpg` : undefined)
const still = (path?: string): string | undefined => (path ? `${IMG}/episodes/${path}_w.jpg` : undefined)

const detailPath = (type: SimklType): string => (type === 'tv' ? '/tv' : type === 'anime' ? '/anime' : '/movies')
const episodesPath = (type: SimklType): string => (type === 'tv' ? '/tv/episodes' : '/anime/episodes')
const normalizeType = (endpoint?: string): SimklType => (endpoint === 'anime' ? 'anime' : endpoint === 'movies' ? 'movies' : 'tv')
const categoriesForType = (type: SimklType): MediaCategory[] => (type === 'movies' ? ['MOVIE'] : type === 'anime' ? ['ANIME', 'SERIES'] : ['SERIES'])

const buildHandles = (ids?: SimklIds): GQLMedia[] => {
  if (!ids) return []
  const handles: GQLMedia[] = []
  if (ids.imdb) handles.push(makeMedia({ origin: 'imdb', id: ids.imdb, url: `https://www.imdb.com/title/${ids.imdb}` }))
  if (ids.tmdb) handles.push(makeMedia({ origin: 'tmdb', id: ids.tmdb, url: `https://www.themoviedb.org/tv/${ids.tmdb}` }))
  if (ids.mal) handles.push(makeMedia({ origin: 'mal', id: ids.mal, url: `https://myanimelist.net/anime/${ids.mal}` }))
  if (ids.anilist) handles.push(makeMedia({ origin: 'anilist', id: ids.anilist, url: `https://anilist.co/anime/${ids.anilist}` }))
  if (ids.kitsu) handles.push(makeMedia({ origin: 'kitsu', id: ids.kitsu, url: `https://kitsu.io/anime/${ids.kitsu}` }))
  return handles
}

const rating = (ratings?: SimklRatings): number | undefined =>
  ratings?.simkl?.rating ?? ratings?.imdb?.rating ?? ratings?.mal?.rating

const buildTitles = (title?: string, enTitle?: string | null) => {
  const titles: { language: string, title: string, score: number }[] = []
  const seen = new Set<string>()
  for (const t of [title, enTitle ?? undefined]) {
    if (t && !seen.has(t)) { seen.add(t); titles.push({ language: 'en', title: t, score: SCORE }) }
  }
  return titles
}

const normalizeSearch = (entry: SimklSearchEntry): GQLMedia | undefined => {
  const id = entry.ids?.simkl ?? entry.ids?.simkl_id
  if (id === undefined) return undefined
  const type = normalizeType(entry.endpoint_type)
  return makeMedia({
    origin,
    id: String(id),
    url: `https://simkl.com/${type}/${id}`,
    handles: buildHandles(entry.ids),
    categories: categoriesForType(type),
    score: SCORE,
    titles: buildTitles(entry.title),
    covers: img(poster(entry.poster), SCORE),
    averageScore: rating(entry.ratings),
  })
}

const normalizeDetail = (detail: SimklDetail, id: string, type: SimklType): GQLMedia | undefined => {
  if (!detail.title) return undefined
  return makeMedia({
    origin,
    id,
    url: `https://simkl.com/${type}/${id}`,
    handles: buildHandles(detail.ids),
    categories: categoriesForType(type),
    score: SCORE,
    titles: buildTitles(detail.title, detail.en_title),
    ...desc(detail.overview, SCORE),
    covers: img(poster(detail.poster), SCORE),
    banners: img(fanart(detail.fanart), SCORE),
    startDate: detail.first_aired || undefined,
    averageScore: rating(detail.ratings),
  })
}

const normalizeEpisode = (episode: SimklEpisode, mediaId: string, mediaUri: string, index: number): GQLEpisode => {
  const season = episode.season ?? 1
  const number = episode.episode
  return makeEpisode({
    origin,
    id: number !== undefined ? `${mediaId}-s${season}e${number}` : `${mediaId}-i${index}`,
    mediaUri,
    score: SCORE,
    titles: episode.title ? [{ language: 'en', title: episode.title, score: SCORE }] : [],
    ...desc(episode.description ?? undefined, SCORE),
    thumbnails: img(still(episode.img), SCORE),
    seasonNumber: episode.season ?? undefined,
    episodeNumber: number ?? undefined,
  })
}

const fetchEpisodes = async (id: string, type: SimklType, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  if (type === 'movies') return []
  const list = await api<SimklEpisode[]>(`${episodesPath(type)}/${id}?extended=full`, ctx)
  return (Array.isArray(list) ? list : [])
    .filter(episode => episode.type !== 'special' || episode.episode !== undefined || !!episode.title)
    .map((episode, index) => normalizeEpisode(episode, id, mediaUri, index))
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  for (const type of ['tv', 'anime', 'movies'] as const) {
    const detail = await api<SimklDetail>(`${detailPath(type)}/${id}?extended=full`, ctx)
    const media = detail ? normalizeDetail(detail, id, type) : undefined
    if (!media) continue
    media.episodes = await fetchEpisodes(id, type, media.uri, ctx)
    media.episodeCount = media.episodes.length
    return media
  }
  return undefined
}

const searchSegment = (type: SimklType): string => (type === 'movies' ? 'movie' : type)

const searchType = async (query: string, type: SimklType, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<SimklSearchEntry[]>(`/search/${searchSegment(type)}?q=${encodeURIComponent(query)}&extended=full&limit=10`, ctx)
  return (Array.isArray(res) ? res : [])
    .map(normalizeSearch)
    .filter((media): media is GQLMedia => !!media)
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const perType = await Promise.all((['tv', 'anime', 'movies'] as const).map(type => searchType(query, type, ctx)))
  const out: GQLMedia[] = []
  const seen = new Set<string>()
  for (const media of perType.flat()) {
    if (seen.has(media.id)) continue
    seen.add(media.id)
    out.push(media)
  }
  return out
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const simklUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: simklUri ? (await getMedia(simklUri.id, ctx)) ?? null : null }
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
      const media = await getMedia(parent.id, ctx)
      return media?.episodes ?? []
    }
  }
}
