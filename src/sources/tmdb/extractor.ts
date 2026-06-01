import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// TMDB (themoviedb.org) — the shared metadata/episode backbone for the streaming platforms.
// Free, documented, legal (attribution + non-commercial). Set VITE_TMDB_API_KEY (v3 key) in .env;
// without it this source no-ops. Search + season/episode lists + watch-provider availability.

const SCORE = 0.3

export const icon = 'https://www.themoviedb.org/favicon.ico'
export const originUrl = 'https://www.themoviedb.org'
export const categories = ['ANIME'] as const
export const name = 'TMDB'
export const origin = 'tmdb'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['tmdb']
export const color = '#01b4e4'

const KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined
const TMDB = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  if (!KEY) return Promise.resolve(undefined)
  const sep = path.includes('?') ? '&' : '?'
  return ctx.fetch(`${TMDB}${path}${sep}api_key=${KEY}`).then(r => r.json() as Promise<T>).catch(() => undefined)
}

// TMDB watch-provider id -> stub origin
const PROVIDER_ORIGIN: Record<number, string> = {
  8: 'nf', 283: 'cr', 337: 'disney', 9: 'amazon', 119: 'amazon', 2: 'appletv',
  15: 'hulu', 1899: 'hbo', 384: 'hbo', 386: 'peacock', 387: 'peacock', 531: 'paramount', 257: 'fubo',
}

interface TmdbTv {
  id: number
  name?: string
  title?: string
  media_type?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  first_air_date?: string
  vote_average?: number
  number_of_seasons?: number
  seasons?: { season_number: number }[]
  external_ids?: { imdb_id?: string | null }
  'watch/providers'?: { results?: Record<string, { link?: string, flatrate?: { provider_id: number }[] }> }
}
interface TmdbEpisode {
  id: number
  episode_number?: number
  season_number?: number
  name?: string
  overview?: string
  still_path?: string | null
  air_date?: string
}

const buildHandles = (tv: TmdbTv): GQLMedia[] => {
  const handles: GQLMedia[] = []
  const imdbId = tv.external_ids?.imdb_id
  if (imdbId) handles.push(makeMedia({ origin: 'imdb', id: imdbId, url: `https://www.imdb.com/title/${imdbId}` }))

  const us = tv['watch/providers']?.results?.US
  const link = us?.link
  for (const provider of us?.flatrate ?? []) {
    const handleOrigin = PROVIDER_ORIGIN[provider.provider_id]
    if (handleOrigin) handles.push(makeMedia({ origin: handleOrigin, id: String(tv.id), url: link }))
  }
  return handles
}

const normalizeMedia = (tv: TmdbTv, handles: GQLMedia[] = []): GQLMedia =>
  makeMedia({
    origin,
    id: String(tv.id),
    url: `https://www.themoviedb.org/tv/${tv.id}`,
    handles,
    score: SCORE,
    titles: [{ language: 'en', title: tv.name ?? tv.title ?? '', score: SCORE }],
    ...desc(tv.overview, SCORE),
    covers: img(tv.poster_path ? `${IMG}/w500${tv.poster_path}` : undefined, SCORE),
    banners: img(tv.backdrop_path ? `${IMG}/w1280${tv.backdrop_path}` : undefined, SCORE),
    startDate: tv.first_air_date || undefined,
    averageScore: tv.vote_average,
  })

const normalizeEpisode = (episode: TmdbEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: String(episode.id),
    mediaUri,
    score: SCORE,
    titles: episode.name ? [{ language: 'en', title: episode.name, score: SCORE }] : [],
    ...desc(episode.overview, SCORE),
    thumbnails: img(episode.still_path ? `${IMG}/w300${episode.still_path}` : undefined, SCORE),
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
  })

const fetchEpisodes = async (id: string, seasons: { season_number: number }[] | undefined, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const numbers = (seasons ?? []).map(season => season.season_number).filter(n => n > 0)
  const perSeason = await Promise.all(
    numbers.map(n =>
      api<{ episodes?: TmdbEpisode[] }>(`/tv/${id}/season/${n}`, ctx).then(res => res?.episodes ?? [])
    )
  )
  return perSeason.flat().map(episode => normalizeEpisode(episode, mediaUri))
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const tv = await api<TmdbTv>(`/tv/${id}?append_to_response=external_ids,watch/providers`, ctx)
  if (!tv) return undefined
  const media = normalizeMedia(tv, buildHandles(tv))
  media.episodes = await fetchEpisodes(id, tv.seasons, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ results?: TmdbTv[] }>(`/search/tv?query=${encodeURIComponent(query)}`, ctx)
  return (res?.results ?? []).map(tv => normalizeMedia(tv))
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const tmdbUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: tmdbUri ? (await getMedia(tmdbUri.id, ctx)) ?? null : null }
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
      const tv = await api<TmdbTv>(`/tv/${parent.id}`, ctx)
      return fetchEpisodes(parent.id, tv?.seasons, parent.uri, ctx)
    }
  }
}
