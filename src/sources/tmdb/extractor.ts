import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, desc, img } from '../utils'

// TMDB (themoviedb.org) - shared metadata/episode backbone. The public API needs a
// licensed key, so instead we read TMDB's own server-rendered frontend pages through
// the proxy (curl-impersonate bypasses their WAF), same approach as the CR/NF sources.

const SCORE = 0.3
const BASE = 'https://www.themoviedb.org'

export const icon = 'https://www.themoviedb.org/favicon.ico'
export const originUrl = 'https://www.themoviedb.org'
export const categories = ['SERIES'] as const
export const name = 'TMDB'
export const origin = 'tmdb'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['tmdb']
export const color = '#01b4e4'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }
const decode = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)

const fetchHtml = (path: string, ctx: ExtractorServerContext): Promise<string | undefined> =>
  ctx.fetch(`${BASE}${path}`).then(r => r.text()).catch(() => undefined)

const meta = (html: string, property: string): string | undefined =>
  html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1]

type TmdbMedia = { id: string, title: string, overview?: string, poster?: string, banner?: string, score?: number, year?: number }
type TmdbEpisode = { number: number, title?: string, overview?: string, still?: string }

// The card's title anchor is followed by a release_date span; the date text is
// locale-dependent so only the year is extracted
const parseSearchYear = (html: string, id: string): number | undefined => {
  const span = html.match(new RegExp(`href="/tv/${id}(?![0-9])[^"]*"><h2[\\s\\S]{0,400}?class="release_date[^"]*">([^<]*)<`))?.[1]
  const year = span?.match(/\b(?:19|20)\d{2}\b/)?.[0]
  return year ? Number(year) : undefined
}

const parseSearch = (html: string): TmdbMedia[] => {
  const out: TmdbMedia[] = []
  const seen = new Set<string>()
  const re = /data-media-type="tv"[\s\S]{0,200}?href="\/tv\/(\d+)[^"]*"[\s\S]{0,400}?<img\s+alt="([^"]*)"(?:[\s\S]{0,300}?(?:src|data-src)="(https:\/\/[^"]+)")?/g
  for (const m of html.matchAll(re)) {
    const id = m[1]
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, title: decode(m[2] ?? ''), poster: m[3], year: parseSearchYear(html, id) })
  }
  return out
}

const parseShow = (html: string, id: string): TmdbMedia & { seasons: number[] } => {
  const backdrop = html.match(/\/t\/p\/w1920[^"']+\.(?:jpg|png)/)?.[0]
  const percent = html.match(/class="user_score_chart"[^>]*data-percent="([\d.]+)"/)?.[1]
  const seasons = [...new Set([...html.matchAll(new RegExp(`/tv/${id}/season/(\\d+)`, 'g'))].map(m => Number(m[1])))]
    .filter(n => n > 0)
    .sort((a, b) => a - b)
  return {
    id,
    title: decode(meta(html, 'og:title') ?? ''),
    overview: decode(meta(html, 'og:description') ?? '') || undefined,
    poster: meta(html, 'og:image'),
    banner: backdrop ? `https://media.themoviedb.org${backdrop}` : undefined,
    score: percent ? Math.round(Number(percent)) / 10 : undefined,
    seasons,
  }
}

const parseSeason = (html: string): TmdbEpisode[] => {
  const out: TmdbEpisode[] = []
  for (const card of html.split('<div class="card')) {
    const num = card.match(/data-episode-number="(\d+)"/)?.[1]
    if (!num) continue
    const title = card.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1] ?? card.match(/<img[^>]*\balt="([^"]*)"/)?.[1]
    const overview = card.match(/class="overview"[^>]*>\s*<p>([\s\S]*?)<\/p>/)?.[1]
    out.push({
      number: Number(num),
      title: title ? decode(title) : undefined,
      overview: overview ? decode(overview.replace(/<[^>]+>/g, '')).trim() : undefined,
      still: card.match(/src="(https:\/\/media\.themoviedb\.org\/t\/p\/[^"]+)"/)?.[1],
    })
  }
  return out
}

const normalizeMedia = (m: TmdbMedia): GQLMedia =>
  makeMedia({
    origin,
    id: m.id,
    url: `${BASE}/tv/${m.id}`,
    categories: ['SERIES'],
    score: SCORE,
    titles: [{ language: 'en', title: m.title, score: SCORE }],
    ...desc(m.overview, SCORE),
    covers: img(m.poster, SCORE),
    banners: img(m.banner, SCORE),
    averageScore: m.score,
    startDate: m.year ? `${m.year}-01-01` : undefined,
  })

const normalizeEpisode = (episode: TmdbEpisode, season: number, tvId: string, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: `${tvId}-s${season}e${episode.number}`,
    mediaUri,
    score: SCORE,
    titles: episode.title ? [{ language: 'en', title: episode.title, score: SCORE }] : [],
    ...desc(episode.overview, SCORE),
    thumbnails: img(episode.still, SCORE),
    seasonNumber: season,
    episodeNumber: episode.number,
  })

const fetchEpisodes = async (id: string, seasons: number[], mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const perSeason = await Promise.all(
    seasons.map(n =>
      fetchHtml(`/tv/${id}/season/${n}?language=en-US`, ctx)
        .then(html => html ? parseSeason(html).map(episode => normalizeEpisode(episode, n, id, mediaUri)) : [])
    )
  )
  return perSeason.flat()
}

const getMedia = async (id: string, ctx: ExtractorServerContext): Promise<GQLMedia | undefined> => {
  const html = await fetchHtml(`/tv/${id}?language=en-US`, ctx)
  if (!html) return undefined
  const show = parseShow(html, id)
  if (!show.title) return undefined
  const media = normalizeMedia(show)
  media.episodes = await fetchEpisodes(id, show.seasons, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

const searchApi = async (query: string, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  const html = await fetchHtml(`/search/tv?query=${encodeURIComponent(query)}&language=en-US`, ctx)
  return html ? parseSearch(html).map(normalizeMedia) : []
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
      const html = await fetchHtml(`/tv/${parent.id}?language=en-US`, ctx)
      if (!html) return []
      return fetchEpisodes(parent.id, parseShow(html, parent.id).seasons, parent.uri, ctx)
    }
  }
}
