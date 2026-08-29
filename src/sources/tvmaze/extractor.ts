import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img, getFirstTitle, waitForMedia } from '../utils'
import { parseSeasonNumber, pickSeasonByEpisodeCount, seasonScopedId, splitSeasonScopedId } from '../season'

const SCORE = 0.3
const API = 'https://api.tvmaze.com'

export const icon = 'https://www.tvmaze.com/favicon.ico'
export const originUrl = 'https://www.tvmaze.com'
export const categories = ['SERIES'] as const
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
  airdate?: string | null
  summary?: string | null
  image?: TvmazeImage | null
}

const buildHandles = (show: TvmazeShow): GQLMedia[] => {
  const imdb = show.externals?.imdb
  return imdb ? [makeMedia({ origin: 'imdb', id: imdb, url: `https://www.imdb.com/title/${imdb}` })] : []
}

// TVmaze describes a SHOW while a stub media is one season, so a season-scoped media cannot carry the
// bare show id: every season would hand back the same one and clustering union-finds them into a
// single media. Same defect TMDB and JustWatch had, same '-s<n>' fix. A show-level id is still minted
// for SEARCH, where there is no cluster to corrupt and TVmaze genuinely is describing the show.
const normalizeMedia = (
  show: TvmazeShow,
  seasonNumber?: number,
  handles: GQLMedia[] = [],
  seasonPremiere?: string
): GQLMedia =>
  makeMedia({
    origin,
    id: seasonNumber == null ? String(show.id) : seasonScopedId(show.id, seasonNumber),
    url: show.url ?? `https://www.tvmaze.com/shows/${show.id}`,
    handles,
    categories: ['SERIES'],
    score: SCORE,
    titles: show.name ? [{ language: 'en', title: show.name, score: SCORE }] : [],
    ...desc(text(show.summary), SCORE),
    covers: img(show.image?.original ?? show.image?.medium, SCORE),
    // A SEASON-scoped media may never carry the SHOW's premiere, which is season 1's date.
    //
    // It is not merely inaccurate, it welds seasons together, and by a route that looks nothing like a
    // title problem: profileCluster derives its `years` set from every member's startDate, so a season 3
    // cluster holding this media carries BOTH 2019 and season 1's 2016, and fuzzyMergeMediaClusters
    // buckets by year, so it lands in season 1's bucket where a shared title is enough. Reproduced
    // against the store on Bungou Stray Dogs: with the show date the two seasons come back as one
    // component, with the season's own date they stay apart.
    //
    // The season's premiere is the earliest airdate among ITS episodes, taken by date rather than by
    // episode number because a recap or special routinely carries episode 0 or an out-of-order number.
    // Nothing is asserted when it is unknown: an absent date costs this source a year bucket, a wrong
    // one costs a permanent weld, and graph.link has no inverse.
    startDate: (seasonNumber == null ? show.premiered : seasonPremiere) || undefined,
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

/** The earliest airdate among one season's episodes, off the embedded list, no extra request. */
const seasonPremiere = (episodes: TvmazeEpisode[], seasonNumber?: number): string | undefined => {
  if (seasonNumber == null) return undefined
  let earliest: string | undefined
  for (const episode of episodes) {
    if (episode.season !== seasonNumber || !episode.airdate) continue
    if (!earliest || episode.airdate < earliest) earliest = episode.airdate
  }
  return earliest
}

/** Season sizes, straight off the embedded episode list - no extra request to count them. */
const seasonsOf = (episodes: TvmazeEpisode[]) => {
  const counts = new Map<number, number>()
  for (const episode of episodes) {
    if (episode.season == null) continue
    counts.set(episode.season, (counts.get(episode.season) ?? 0) + 1)
  }
  return [...counts].map(([seasonNumber, episodeCount]) => ({ seasonNumber, episodeCount }))
}

const getMedia = async (uri: string, id: string, pinned: number | undefined, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const show = await api<TvmazeShow>(`/shows/${id}?embed=episodes`, ctx)
  if (!show) return undefined
  const all = show._embedded?.episodes ?? []
  const seasons = seasonsOf(all)

  // The probe stays SYNCHRONOUS: waitForMedia keeps the first result it finds truthy, and a promise
  // is always truthy, so an async one would succeed instantly with a value that resolves to nothing.
  const seasonNumber = pinned ?? (seasons.length === 1 ? seasons[0]!.seasonNumber : await waitForMedia(uri, ctx, (media: any) => {
    const title = getFirstTitle(media)
    const parsed = title ? parseSeasonNumber(title) : undefined
    if (parsed != null) return parsed
    const count = media?.episodeCount ?? media?.episodes?.length
    return count ? pickSeasonByEpisodeCount(seasons, count) : undefined
  }))

  // a series whose season cannot be determined has no identity here: see normalizeMedia
  if (seasonNumber == null && seasons.length > 1) return undefined

  const media = normalizeMedia(show, seasonNumber, buildHandles(show), seasonPremiere(all, seasonNumber))
  const episodes = seasonNumber == null ? all : all.filter(episode => episode.season === seasonNumber)
  media.episodes = episodes.map(episode => normalizeEpisode(episode, media.uri))
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const res = await api<{ show: TvmazeShow }[]>(`/search/shows?q=${encodeURIComponent(query)}`, ctx)
  return (res ?? []).map(result => normalizeMedia(result.show, undefined, buildHandles(result.show)))
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const tvmazeUri = extractAggregatedUriOrigin(uri, origin)
        if (!tvmazeUri) return yield { media: null }
        // the uri may already pin the season, since that is now part of the id
        const { showId, seasonNumber } = splitSeasonScopedId(tvmazeUri.id)
        yield { media: (await getMedia(uri, showId, seasonNumber, ctx)) ?? null }
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
      // parent.id is '<show>-s<season>' now, so the show has to be split back out of it
      const { showId, seasonNumber } = splitSeasonScopedId(parent.id)
      const episodes = await api<TvmazeEpisode[]>(`/shows/${showId}/episodes`, ctx)
      const kept = seasonNumber == null ? (episodes ?? []) : (episodes ?? []).filter(episode => episode.season === seasonNumber)
      return kept.map(episode => normalizeEpisode(episode, parent.uri))
    }
  }
}
