import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// TVmaze (tvmaze.com) — keyless JSON TV/anime metadata + episode backbone. No key or
// account, CORS-open. Exposes externals.imdb for cross-source bridging.

const SCORE = 0.3
const API = 'https://api.tvmaze.com'

export const icon = 'https://www.tvmaze.com/favicon.ico'
export const originUrl = 'https://www.tvmaze.com'
export const categories = ['ANIME', 'TV'] as const
export const name = 'TVmaze'
export const origin = 'tvmaze'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['tvmaze']
export const color = '#3c948b'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }
const text = (html: string | null | undefined): string | undefined => {
  if (!html) return undefined
  const out = html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim()
  return out || undefined
}

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T | undefined> =>
  ctx.fetch(`${API}${path}`).then(r => r.json() as Promise<T>).catch(() => undefined)

interface TvmazeImage { medium?: string, original?: string }
interface TvmazeShow {
  id: number
  url?: string
  name?: string
  premiered?: string | null
  rating?: { average?: number | null }
  externals?: { imdb?: string | null, thetvdb?: number | null }
  image?: TvmazeImage | null
  summary?: string | null
  _embedded?: { episodes?: TvmazeEpisode[] }
}
interface TvmazeEpisode {
  id: number
  name?: string
  season?: number
  number?: number
  summary?: string | null
  image?: TvmazeImage | null
}

const buildHandles = (show: TvmazeShow): GQLMedia[] => {
  const imdb = show.externals?.imdb
  return imdb ? [makeMedia({ origin: 'imdb', id: imdb, url: `https://www.imdb.com/title/${imdb}` })] : []
}

const normalizeMedia = (show: TvmazeShow, handles: GQLMedia[] = []): GQLMedia =>
  makeMedia({
    origin,
    id: String(show.id),
    url: show.url ?? `https://www.tvmaze.com/shows/${show.id}`,
    handles,
    score: SCORE,
    titles: show.name ? [{ language: 'en', title: show.name, score: SCORE }] : [],
    ...desc(text(show.summary), SCORE),
    covers: img(show.image?.original ?? show.image?.medium, SCORE),
    startDate: show.premiered || undefined,
    averageScore: show.rating?.average ?? undefined,
  })

const normalizeEpisode = (episode: TvmazeEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: String(episode.id),
    mediaUri,
    score: SCORE,
    titles: episode.name ? [{ language: 'en', title: episode.name, score: SCORE }] : [],
    ...desc(text(episode.summary), SCORE),
    thumbnails: img(episode.image?.original ?? episode.image?.medium, SCORE),
    seasonNumber: episode.season,
    episodeNumber: episode.number,
  })

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const show = await api<TvmazeShow>(`/shows/${id}?embed=episodes`, ctx)
  if (!show) return undefined
  const media = normalizeMedia(show, buildHandles(show))
  media.episodes = (show._embedded?.episodes ?? []).map(episode => normalizeEpisode(episode, media.uri))
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ show: TvmazeShow }[]>(`/search/shows?q=${encodeURIComponent(query)}`, ctx)
  return (res ?? []).map(result => normalizeMedia(result.show, buildHandles(result.show)))
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const tvmazeUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: tvmazeUri ? (await getMedia(tvmazeUri.id, ctx)) ?? null : null }
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
      const episodes = await api<TvmazeEpisode[]>(`/shows/${parent.id}/episodes`, ctx)
      return (episodes ?? []).map(episode => normalizeEpisode(episode, parent.uri))
    }
  }
}
