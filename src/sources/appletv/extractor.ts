import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img, getFirstTitle, simplifyTitle, titleSimilarity, buildHandlesFromUri, waitForMedia } from '../utils'

// Apple TV+ via the anonymous UTS web API (uts-api.itunes.apple.com). No token/login.
// ⚠️ Endpoints are verified (HTTP 200) but the response field names below are best-effort
// and untested against a live response — verify when the proxy is up. See docs/streaming-platform-apis.md.

const SCORE = 0.2

export const icon = 'https://tv.apple.com/favicon.ico'
export const originUrl = 'https://tv.apple.com'
export const categories = ['ANIME'] as const
export const name = 'Apple TV+'
export const origin = 'appletv'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['appletv']
export const color = '#e8e8ed'

const ATV = 'https://uts-api.itunes.apple.com/uts/v3'
const PARAMS = 'caller=web&sf=143441&v=58&pfm=web&locale=en-US&utsk=0'

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<T> =>
  ctx
    .fetch(`${ATV}${path}${path.includes('?') ? '&' : '?'}${PARAMS}`)
    .then(r => r.json() as Promise<T>)

// mzstatic image urls are templates: `.../{w}x{h}{c}.{f}`
const image = (img: AppleImage | undefined, w: number, h: number): string | undefined =>
  img?.url
    ?.replace('{w}', String(w))
    .replace('{h}', String(h))
    .replace('{c}', '')
    .replace('{f}', 'jpg')

interface AppleImage { url: string }
interface AppleImages {
  coverArt?: AppleImage
  coverArt16X9?: AppleImage
  previewFrame?: AppleImage
}
interface AppleItem {
  id: string
  type?: string
  title: string
  url?: string
  description?: string
  releaseDate?: number
  images?: AppleImages
}
interface AppleSeason { id: string, seasonNumber?: number }
interface AppleEpisode {
  id: string
  title: string
  description?: string
  seasonNumber?: number
  episodeNumber?: number
  url?: string
  releaseDate?: number
  images?: AppleImages
}

interface AppleSearchResponse { data?: { canvas?: { shelves?: { items?: AppleItem[] }[] } } }
interface AppleShowResponse { data?: { content?: AppleItem, seasons?: Record<string, AppleSeason> } }
interface AppleEpisodesResponse { data?: { episodes?: AppleEpisode[] } }

const normalizeTitle = (content: AppleItem): GQLMedia => {
  const cover = image(content.images?.coverArt, 600, 900)
  const banner = image(content.images?.coverArt16X9, 1920, 1080)
  return makeMedia({
    origin,
    id: content.id,
    url: content.url,
    score: SCORE,
    titles: [{ language: 'en', title: content.title, score: SCORE }],
    ...desc(content.description, SCORE),
    covers: img(cover, SCORE),
    banners: img(banner, SCORE),
    startDate: content.releaseDate ? new Date(content.releaseDate).toISOString() : undefined,
  })
}

const normalizeEpisode = (episode: AppleEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: episode.id,
    mediaUri,
    url: episode.url,
    score: SCORE,
    titles: [{ language: 'en', title: episode.title, score: SCORE }],
    ...desc(episode.description, SCORE),
    thumbnails: img(image(episode.images?.previewFrame ?? episode.images?.coverArt16X9, 1280, 720), SCORE),
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  })

const fetchEpisodes = async (id: string, seasons: Record<string, AppleSeason> | undefined, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const seasonIds = Object.values(seasons ?? {}).map(season => season.id).filter(Boolean)
  if (!seasonIds.length) return []
  // ⚠️ UTS caps episodes per request (~6) and rejects nextToken; per-season is the workaround,
  // but very long seasons may still be truncated — revisit pagination when verifying live.
  const perSeason = await Promise.all(
    seasonIds.map(seasonId =>
      api<AppleEpisodesResponse>(`/shows/${id}/episodes?selectedSeasonId=${seasonId}`, ctx)
        .then(res => res.data?.episodes ?? [])
        .catch(() => [])
    )
  )
  return perSeason.flat().map(episode => normalizeEpisode(episode, mediaUri))
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const res = await api<AppleShowResponse>(`/shows/${id}`, ctx)
  const content = res.data?.content
  if (!content) return undefined
  const media = normalizeTitle(content)
  media.episodes = await fetchEpisodes(id, res.data?.seasons, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<AppleItem[]> => {
  const res = await api<AppleSearchResponse>(`/search?searchTerm=${encodeURIComponent(query)}`, ctx)
  return (res.data?.canvas?.shelves ?? [])
    .flatMap(shelf => shelf.items ?? [])
    .filter(item => item.type === 'Show' || item.type === 'Movie')
}

const searchAndLinkMedia = async (title: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const results = await searchApi(query, ctx)
    for (const result of results) {
      if (await titleSimilarity(title, result.title) < 0.5) continue
      const media = await getMedia(result.id, ctx)
      if (!media) continue
      media.handles = buildHandlesFromUri(aggregatedUri, origin)
      return media
    }
  }
  return null
}

const resolveMedia = async (uri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const atvUri = extractAggregatedUriOrigin(uri, origin)
  if (atvUri) {
    const media = await getMedia(atvUri.id, ctx)
    if (!media) return null
    if (isAggregatedUri(uri)) media.handles = buildHandlesFromUri(uri, origin)
    return media
  }
  if (!isAggregatedUri(uri)) return null
  const title = await waitForMedia(uri, ctx, media => getFirstTitle(media), 30_000)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        yield { media: await resolveMedia(uri, ctx) }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) return yield { mediaPage: { nodes: [] } }
        const results = await searchApi(search, ctx)
        yield { mediaPage: { nodes: results.map(normalizeTitle) } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      const res = await api<AppleShowResponse>(`/shows/${parent.id}`, ctx)
      return fetchEpisodes(parent.id, res.data?.seasons, parent.uri, ctx)
    }
  }
}
