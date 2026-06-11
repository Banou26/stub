import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// Trakt (api.trakt.tv) - community TV/movie metadata. Keyful (BYOK): the user's key is the
// app Client ID, sent as the trakt-api-key header; without a key the source no-ops. Trakt
// exposes no images, so covers/thumbnails are absent. Bridges imdb/tmdb handles.

const SCORE = 0.3
const BASE = 'https://api.trakt.tv'

export const icon = 'https://walter.trakt.tv/hotlink-ok/public/favicon.ico'
export const originUrl = 'https://trakt.tv'
export const categories = ['SERIES'] as const
export const name = 'Trakt'
export const origin = 'trakt'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['trakt']
export const color = '#ed1c24'

type TraktIds = {
  trakt?: number
  slug?: string
  imdb?: string
  tmdb?: number
  tvdb?: number
}

type TraktShow = {
  title?: string
  year?: number
  overview?: string
  rating?: number
  first_aired?: string
  ids?: TraktIds
}

type TraktSearchResult = {
  type?: string
  score?: number
  show?: TraktShow
}

type TraktEpisode = {
  season?: number
  number?: number
  title?: string
  overview?: string
  rating?: number
  first_aired?: string
  ids?: TraktIds
}

type TraktSeason = {
  number?: number
  episodes?: TraktEpisode[]
}

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  const key = ctx.key(origin)
  if (!key) return Promise.resolve(undefined)
  return ctx
    .fetch(`${BASE}${path}`, {
      headers: {
        'trakt-api-key': key,
        'trakt-api-version': '2',
        'Content-Type': 'application/json',
      },
    })
    .then(r => r.json() as Promise<T>)
    .catch(() => undefined)
}

const mediaId = (ids?: TraktIds): string | undefined => ids?.slug ?? (ids?.trakt !== undefined ? String(ids.trakt) : undefined)

const buildHandles = (ids?: TraktIds): GQLMedia[] => {
  const handles: GQLMedia[] = []
  if (ids?.imdb) handles.push(makeMedia({ origin: 'imdb', id: ids.imdb, url: `https://www.imdb.com/title/${ids.imdb}` }))
  if (ids?.tmdb !== undefined) handles.push(makeMedia({ origin: 'tmdb', id: String(ids.tmdb), url: `https://www.themoviedb.org/tv/${ids.tmdb}` }))
  return handles
}

const normalizeMedia = (show: TraktShow): GQLMedia | undefined => {
  const id = mediaId(show.ids)
  if (!id) return undefined
  const rating = show.rating
  return makeMedia({
    origin,
    id,
    url: `https://trakt.tv/shows/${id}`,
    handles: buildHandles(show.ids),
    categories: ['SERIES'],
    score: SCORE,
    titles: show.title ? [{ language: 'en', title: show.title, score: SCORE }] : [],
    ...desc(show.overview, SCORE),
    startDate: show.first_aired ? new Date(show.first_aired).toISOString() : undefined,
    averageScore: rating !== undefined ? Math.round(rating * 10) : undefined,
  })
}

const normalizeEpisode = (episode: TraktEpisode, season: number, mediaId: string, mediaUri: string): GQLEpisode => {
  const number = episode.number
  return makeEpisode({
    origin,
    id: episode.ids?.trakt !== undefined ? String(episode.ids.trakt) : `${mediaId}-s${season}e${number ?? 0}`,
    mediaUri,
    score: SCORE,
    titles: episode.title ? [{ language: 'en', title: episode.title, score: SCORE }] : [],
    ...desc(episode.overview, SCORE),
    seasonNumber: season,
    episodeNumber: number,
  })
}

const fetchEpisodes = async (id: string, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const seasons = await api<TraktSeason[]>(`/shows/${encodeURIComponent(id)}/seasons?extended=episodes,full`, ctx)
  if (!seasons) return []
  return seasons
    .filter(season => (season.number ?? 0) > 0)
    .flatMap(season => (season.episodes ?? []).map(episode => normalizeEpisode(episode, season.number ?? 0, id, mediaUri)))
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const show = await api<TraktShow>(`/shows/${encodeURIComponent(id)}?extended=full`, ctx)
  if (!show) return undefined
  const media = normalizeMedia(show)
  if (!media) return undefined
  media.episodes = await fetchEpisodes(id, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const results = await api<TraktSearchResult[]>(`/search/show?query=${encodeURIComponent(query)}`, ctx)
  return (results ?? [])
    .map(result => (result.show ? normalizeMedia(result.show) : undefined))
    .filter((media): media is GQLMedia => !!media)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const traktUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: traktUri ? (await getMedia(traktUri.id, ctx)) ?? null : null }
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
