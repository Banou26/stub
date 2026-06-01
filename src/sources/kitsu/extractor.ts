import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// Kitsu (kitsu.io) — keyless JSON:API anime source. Adds anilist + myanimelist id handles
// (so results merge with stub's anime spine) plus Crunchyroll/Netflix streaming deep-links.

const SCORE = 0.3
const API = 'https://kitsu.io/api/edge'

export const icon = 'https://kitsu.io/favicon.ico'
export const originUrl = 'https://kitsu.io'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'Kitsu'
export const origin = 'kitsu'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['kitsu']
export const color = '#f75239'

interface KitsuImage { medium?: string, large?: string, original?: string }
interface KitsuAnime {
  synopsis?: string | null
  titles?: Record<string, string>
  canonicalTitle?: string | null
  averageRating?: string | null
  startDate?: string | null
  subtype?: string | null
  posterImage?: KitsuImage | null
  coverImage?: KitsuImage | null
}
interface KitsuEpisodeAttr {
  canonicalTitle?: string | null
  synopsis?: string | null
  seasonNumber?: number | null
  number?: number | null
  thumbnail?: KitsuImage | null
}
interface KitsuMapping { externalSite?: string, externalId?: string }
interface KitsuStream { url?: string }

interface KitsuResource<T> {
  id: string
  attributes: T
  relationships?: { mappings?: { data?: { id: string }[] } }
}
interface KitsuResponse<T> {
  data?: KitsuResource<T> | KitsuResource<T>[]
  included?: KitsuResource<KitsuMapping>[]
}

const api = <T>(path: string, ctx: ExtractorServerContext): Promise<KitsuResponse<T> | undefined> =>
  ctx.fetch(`${API}${path}`).then(r => r.json() as Promise<KitsuResponse<T>>).catch(() => undefined)

const STREAM_ORIGIN: [RegExp, string][] = [
  [/crunchyroll\.com/, 'cr'],
  [/netflix\.com/, 'nf'],
  [/hulu\.com/, 'hulu'],
  [/disneyplus\.com/, 'disney'],
  [/(primevideo|amazon)\./, 'amazon'],
  [/(hbomax|max)\.com/, 'hbo'],
]

const mappingHandles = (mappings: KitsuMapping[]): GQLMedia[] => {
  const handles: GQLMedia[] = []
  for (const m of mappings) {
    const id = m.externalId
    if (!id) continue
    if (m.externalSite === 'anilist/anime') handles.push(makeMedia({ origin: 'anilist', id, url: `https://anilist.co/anime/${id}` }))
    else if (m.externalSite === 'myanimelist/anime') handles.push(makeMedia({ origin: 'mal', id, url: `https://myanimelist.net/anime/${id}` }))
  }
  return handles
}

const streamHandles = (streams: KitsuStream[]): GQLMedia[] => {
  const handles: GQLMedia[] = []
  for (const stream of streams) {
    const url = stream.url
    if (!url) continue
    const match = STREAM_ORIGIN.find(([re]) => re.test(url))
    if (match) handles.push(makeMedia({ origin: match[1], id: url.match(/\/(?:series|title|watch|shows?)\/([^/?#]+)/)?.[1] ?? url, url }))
  }
  return handles
}

const includedMappings = (response: KitsuResponse<unknown>): Map<string, KitsuMapping> =>
  new Map((response.included ?? []).map(inc => [inc.id, inc.attributes]))

const resourceMappings = (resource: KitsuResource<unknown>, map: Map<string, KitsuMapping>): KitsuMapping[] =>
  (resource.relationships?.mappings?.data ?? []).map(ref => map.get(ref.id)).filter((m): m is KitsuMapping => !!m)

const buildTitles = (attr: KitsuAnime) => {
  const t = attr.titles ?? {}
  const entries: [string | undefined, string][] = [[t.en, 'en'], [attr.canonicalTitle ?? undefined, 'en'], [t.ja_jp, 'ja']]
  const titles: { language: string, title: string, score: number }[] = []
  const seen = new Set<string>()
  for (const [title, language] of entries) {
    if (title && !seen.has(title)) { seen.add(title); titles.push({ language, title, score: SCORE }) }
  }
  return titles
}

const normalizeMedia = (resource: KitsuResource<KitsuAnime>, handles: GQLMedia[] = []): GQLMedia => {
  const attr = resource.attributes
  return makeMedia({
    origin,
    id: resource.id,
    url: `https://kitsu.io/anime/${resource.id}`,
    handles,
    score: SCORE,
    categories: attr.subtype === 'movie' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    titles: buildTitles(attr),
    ...desc(attr.synopsis ?? undefined, SCORE),
    covers: img(attr.posterImage?.original ?? attr.posterImage?.large ?? attr.posterImage?.medium, SCORE),
    banners: img(attr.coverImage?.original ?? attr.coverImage?.large, SCORE),
    startDate: attr.startDate || undefined,
    averageScore: attr.averageRating ? Number(attr.averageRating) : undefined,
  })
}

const normalizeEpisode = (resource: KitsuResource<KitsuEpisodeAttr>, mediaUri: string): GQLEpisode => {
  const attr = resource.attributes
  return makeEpisode({
    origin,
    id: resource.id,
    mediaUri,
    score: SCORE,
    titles: attr.canonicalTitle ? [{ language: 'en', title: attr.canonicalTitle, score: SCORE }] : [],
    ...desc(attr.synopsis ?? undefined, SCORE),
    thumbnails: img(attr.thumbnail?.original ?? attr.thumbnail?.large ?? attr.thumbnail?.medium, SCORE),
    seasonNumber: attr.seasonNumber ?? undefined,
    episodeNumber: attr.number ?? undefined,
  })
}

const fetchEpisodes = async (id: string, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const all: GQLEpisode[] = []
  for (let offset = 0; offset < 2_000; offset += 20) {
    const page = await api<KitsuEpisodeAttr>(`/anime/${id}/episodes?page%5Blimit%5D=20&page%5Boffset%5D=${offset}&sort=number`, ctx)
    const data = Array.isArray(page?.data) ? page.data : []
    all.push(...data.map(episode => normalizeEpisode(episode, mediaUri)))
    if (data.length < 20) break
  }
  return all
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const [show, streams] = await Promise.all([
    api<KitsuAnime>(`/anime/${id}?include=mappings`, ctx),
    api<KitsuStream>(`/anime/${id}/streaming-links`, ctx),
  ])
  const data = show?.data
  const resource = Array.isArray(data) ? data[0] : data
  if (!resource) return undefined
  const streamList = Array.isArray(streams?.data) ? streams.data : []
  const handles = [
    ...mappingHandles(resourceMappings(resource, includedMappings(show ?? {}))),
    ...streamHandles(streamList.map(stream => stream.attributes)),
  ]
  const media = normalizeMedia(resource, handles)
  media.episodes = await fetchEpisodes(id, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<KitsuAnime>(`/anime?filter%5Btext%5D=${encodeURIComponent(query)}&include=mappings&page%5Blimit%5D=10`, ctx)
  const list = Array.isArray(res?.data) ? res.data : []
  const map = includedMappings(res ?? {})
  return list.map(resource => normalizeMedia(resource, mappingHandles(resourceMappings(resource, map))))
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const kitsuUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: kitsuUri ? (await getMedia(kitsuUri.id, ctx)) ?? null : null }
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
