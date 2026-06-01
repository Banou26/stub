import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// OMDb (omdbapi.com) — IMDb-sourced movie/TV metadata. Keyful (BYOK): reads the user's key
// via ctx.key('omdb'); without a key the source no-ops. Emits an imdb handle for bridging.

const SCORE = 0.3

export const icon = 'https://www.omdbapi.com/favicon.ico'
export const originUrl = 'https://www.omdbapi.com'
export const categories = ['ANIME', 'TV'] as const
export const name = 'OMDb'
export const origin = 'omdb'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['omdb']
export const color = '#f5c518'

const na = (value?: string): string | undefined => (value && value !== 'N/A' ? value : undefined)

const api = <T>(params: string, ctx: ExtractorServerContext): Promise<T | undefined> => {
  const key = ctx.key(origin)
  if (!key) return Promise.resolve(undefined)
  return ctx.fetch(`https://www.omdbapi.com/?apikey=${key}&${params}`).then(r => r.json() as Promise<T>).catch(() => undefined)
}

interface OmdbResult { Title?: string, Year?: string, imdbID?: string, Poster?: string }
interface OmdbDetail extends OmdbResult {
  Plot?: string
  imdbRating?: string
  totalSeasons?: string
  Type?: string
  Response?: string
}
interface OmdbEpisodeEntry { Title?: string, Episode?: string, imdbID?: string }
interface OmdbSeason { Episodes?: OmdbEpisodeEntry[] }

const normalizeMedia = (result: OmdbResult & { Plot?: string, imdbRating?: string, Type?: string }, handles: GQLMedia[] = []): GQLMedia | undefined => {
  const id = result.imdbID
  if (!id) return undefined
  const rating = na(result.imdbRating)
  return makeMedia({
    origin,
    id,
    url: `https://www.imdb.com/title/${id}`,
    handles,
    categories: result.Type === 'movie' ? ['MOVIE'] : ['SERIES'],
    score: SCORE,
    titles: result.Title ? [{ language: 'en', title: result.Title, score: SCORE }] : [],
    ...desc(na(result.Plot), SCORE),
    covers: img(na(result.Poster), SCORE),
    averageScore: rating ? Number(rating) : undefined,
  })
}

const buildHandles = (id: string): GQLMedia[] => [makeMedia({ origin: 'imdb', id, url: `https://www.imdb.com/title/${id}` })]

const normalizeEpisode = (episode: OmdbEpisodeEntry, season: number, mediaId: string, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: episode.imdbID ?? `${mediaId}-s${season}e${episode.Episode}`,
    mediaUri,
    score: SCORE,
    titles: na(episode.Title) ? [{ language: 'en', title: episode.Title as string, score: SCORE }] : [],
    seasonNumber: season,
    episodeNumber: episode.Episode ? Number(episode.Episode) : undefined,
  })

const fetchEpisodes = async (id: string, totalSeasons: number, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const seasons = Array.from({ length: totalSeasons }, (_, i) => i + 1)
  const perSeason = await Promise.all(
    seasons.map(season =>
      api<OmdbSeason>(`i=${id}&Season=${season}`, ctx).then(res => (res?.Episodes ?? []).map(episode => normalizeEpisode(episode, season, id, mediaUri)))
    )
  )
  return perSeason.flat()
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const detail = await api<OmdbDetail>(`i=${id}&plot=full`, ctx)
  if (!detail || detail.Response === 'False') return undefined
  const media = normalizeMedia(detail, buildHandles(id))
  if (!media) return undefined
  const totalSeasons = na(detail.totalSeasons)
  if (totalSeasons) {
    media.episodes = await fetchEpisodes(id, Number(totalSeasons), media.uri, ctx)
    media.episodeCount = media.episodes.length
  }
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ Search?: OmdbResult[] }>(`s=${encodeURIComponent(query)}`, ctx)
  return (res?.Search ?? [])
    .map(result => result.imdbID ? normalizeMedia(result, buildHandles(result.imdbID)) : undefined)
    .filter((media): media is GQLMedia => !!media)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const omdbUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: omdbUri ? (await getMedia(omdbUri.id, ctx)) ?? null : null }
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
      const detail = await api<OmdbDetail>(`i=${parent.id}&plot=short`, ctx)
      const totalSeasons = na(detail?.totalSeasons)
      return totalSeasons ? fetchEpisodes(parent.id, Number(totalSeasons), parent.uri, ctx) : []
    }
  }
}
