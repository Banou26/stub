import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode, MediaScope } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img } from '../utils'

const SCORE = 0.3

export const icon = 'https://www.omdbapi.com/favicon.ico'
export const originUrl = 'https://www.omdbapi.com'
export const categories = ['SERIES', 'MOVIE'] as const
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

// The row is keyed by an IMDb id and IMDb models no seasons, so a series row names the whole show
// and is CONTAINER, as is the imdb handle minted beside it. A movie's id names the film: RUN.
const normalizeMedia = (result: OmdbResult & { Plot?: string, imdbRating?: string, Type?: string }): GQLMedia | undefined => {
  const id = result.imdbID
  if (!id) return undefined
  const rating = na(result.imdbRating)
  const year = na(result.Year)?.match(/\d{4}/)?.[0]
  const scope: MediaScope = result.Type === 'movie' ? 'RUN' : 'CONTAINER'
  return makeMedia({
    origin,
    id,
    url: `https://www.imdb.com/title/${id}`,
    scope,
    handles: [makeMedia({ origin: 'imdb', id, url: `https://www.imdb.com/title/${id}`, scope })],
    categories: result.Type === 'movie' ? ['MOVIE'] : ['SERIES'],
    score: SCORE,
    titles: result.Title ? [{ language: 'en', title: result.Title, score: SCORE }] : [],
    ...desc(na(result.Plot), SCORE),
    covers: img(na(result.Poster), SCORE),
    averageScore: rating ? Number(rating) : undefined,
    startDate: year ? `${year}-01-01` : undefined,
  })
}

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
  const media = normalizeMedia(detail)
  if (!media) return undefined
  // A SHOW with more than one season has no honest episode list here, and this media is show level by
  // construction: its id is an IMDb id, which is the one origin `worker/store/db.ts` exempts outright
  // because IMDb models no seasons at all. Every media in this store is one run, so `episodeNumber` is
  // within-season, and flattening N seasons into one list collides them. `db.ts` hangs a HAS_EPISODE
  // edge off this uri for every one, and `Media.episodes` groups the union by episodeNumber ALONE, so
  // the row count becomes the LONGEST season and whatever else the cluster holds shares rows with a
  // season nobody asked for. That is what put 24 rows on a 14 episode season page, measured live
  // 2026-08-31, and `crunchyroll/extractor.ts` carries the same guard for the same reason.
  //
  // The media itself stays: `mediaPage` mints exactly these ids for SEARCH and dropping it would take
  // the search hit with it. A single-season series is unaffected, its one list being honest.
  const totalSeasons = na(detail.totalSeasons)
  if (totalSeasons && Number(totalSeasons) === 1) {
    media.episodes = await fetchEpisodes(id, 1, media.uri, ctx)
    media.episodeCount = media.episodes.length
  } else if (totalSeasons) {
    media.episodeCount = undefined
  } else if (isMovie(media)) {
    media.episodes = [makeMovieEpisode(media)]
    media.episodeCount = 1
  }
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ Search?: OmdbResult[] }>(`s=${encodeURIComponent(query)}`, ctx)
  return (res?.Search ?? [])
    .map(normalizeMedia)
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
      if (isMovie(parent)) return [makeMovieEpisode(parent)]
      const detail = await api<OmdbDetail>(`i=${parent.id}&plot=short`, ctx)
      const totalSeasons = na(detail?.totalSeasons)
      return totalSeasons ? fetchEpisodes(parent.id, Number(totalSeasons), parent.uri, ctx) : []
    }
  }
}
