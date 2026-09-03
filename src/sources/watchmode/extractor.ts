import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode, MediaHandle as GQLMediaHandle } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img } from '../utils'
// the same job over the same provider urls, shape tested per host and measured against a 3168 offer corpus
import { extractContentId, providerContentId } from '../justwatch/id'
import { partOf } from '../utils'

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

/**
 * The provider id a Watchmode source row names, or undefined when it names none.
 *
 * READ BY `justwatch/id.ts`'s `extractContentId`, which is the same job over the same provider urls,
 * shape tested per host and measured against a 3168 offer corpus on 2026-09-01. This used to be
 * `new URL(webUrl).pathname.split('/').filter(Boolean).at(-1)`, a positional read with no shape test,
 * and the last segment is the id for almost none of these hosts:
 *
 *   watch.amazon.com/detail?gti=<id>          pathname is '/detail', so EVERY Amazon title minted
 *                                             the literal handle `amazon:detail`
 *   crunchyroll.com/series/<id>/<slug>        the last segment is the SLUG, shared by every run
 *   hulu.com/series/<uuid>                    a container uuid, shared by every season
 *
 * `providerContentId` then applies the refusals that go with those ids. Watchmode has no season
 * concept anywhere in this file, so it passes no season number, which is what makes the crunchyroll
 * refusal fire: a bare `/series/` id names the show and, on Crunchyroll, its films too.
 *
 * EVERY ID THAT SURVIVES IS STILL SHOW LEVEL, which is why this source was unplugged on 2026-09-04 and
 * why it is back: they are minted PART_OF now. A watchmode record IS the show, so `nf:80987039` off one
 * names the Netflix title and not this run. As SAME_AS that welded every run of the show; as PART_OF it
 * is just the link, which is the only thing this source was ever for.
 *
 * THE FALLBACK IS GONE, and that is deliberate. It used to mint the WATCHMODE title id under the
 * provider's origin whenever the url would not parse, which asserts an id from one space inside
 * another: Netflix ids are integers too, so `nf:<watchmodeId>` can name a real and unrelated title.
 * No readable id now means no handle.
 */
const streamContentId = (webUrl: string, mappedOrigin: string): string | undefined => {
  const rawContentId = extractContentId(webUrl)
  return rawContentId ? providerContentId(mappedOrigin, rawContentId) : undefined
}

const sourceToHandle = (source: WatchmodeSource): GQLMediaHandle | undefined => {
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
  const id = streamContentId(webUrl, mappedOrigin)
  if (!id) return undefined
  return partOf(makeMedia({ origin: mappedOrigin, id, url: webUrl }))
}

/**
 * The catalogue ids a Watchmode record publishes that are worth minting.
 *
 * `tmdb` is not one of them, and it fails in both of its two forms, exactly as simkl's does. A tv id
 * names the SHOW and this file has no season concept to scope it with. A MOVIE id is worse than
 * unscoped: TMDB numbers movies and tv shows in separate sequences that both start at 1, measured
 * 2026-09-04, so `themoviedb.org/movie/550` is Fight Club and `/tv/550` is Till Death Us Do Part.
 * Stub's uri is `tmdb:550` for both, and `tmdb_type` decided the URL here while the ID stayed bare, so
 * a film could weld to whatever unrelated series holds its number. `tmdb/extractor.ts` is
 * `categories = ['SERIES']` and reads `/tv/` pages only, so it could not resolve a movie id anyway.
 *
 * `imdb` stays, as PART_OF: a `tt` id names the show and there is no season-level equivalent, which is
 * the whole reason `SHOW_LEVEL_ORIGINS` exists. Saying so here rather than relying on that Set to
 * demote it means the claim is honest at the point it is made.
 */
const idHandles = (idSource: { imdb_id?: string | null, tmdb_id?: number | null, tmdb_type?: string | null }): GQLMediaHandle[] => {
  const handles: GQLMediaHandle[] = []
  const imdbId = idSource.imdb_id
  if (imdbId) handles.push(partOf(makeMedia({ origin: 'imdb', id: imdbId, url: `https://www.imdb.com/title/${imdbId}` })))
  // A TMDB TV id names the show, so PART_OF is honest for it. A MOVIE id is refused outright and
  // PART_OF cannot rescue it: TMDB numbers films and shows in separate sequences that both start at 1,
  // so `tmdb:550` is Fight Club as a movie and Till Death Us Do Part as a series. A PART_OF pointing at
  // the wrong ROW is not a weaker claim, it is a wrong one.
  const tmdbId = idSource.tmdb_id
  if (tmdbId != null && idSource.tmdb_type !== 'movie') {
    handles.push(partOf(makeMedia({ origin: 'tmdb', id: String(tmdbId), url: `https://www.themoviedb.org/tv/${tmdbId}` })))
  }
  return handles
}

const dedupeHandles = (handles: GQLMediaHandle[]): GQLMediaHandle[] => {
  const seen = new Set<string>()
  const out: GQLMediaHandle[] = []
  for (const handle of handles) {
    if (seen.has(handle.node.uri)) continue
    seen.add(handle.node.uri)
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
    .map(source => sourceToHandle(source))
    .filter((handle): handle is GQLMediaHandle => !!handle)
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
  const media = normalizeDetail(detail, Array.isArray(sources) ? sources : [])
  if (media && isMovie(media)) {
    media.episodes = [makeMovieEpisode(media)]
    media.episodeCount = 1
  }
  return media
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
    episodes: async (parent, _, _ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      return isMovie(parent) ? [makeMovieEpisode(parent)] : []
    }
  }
}
