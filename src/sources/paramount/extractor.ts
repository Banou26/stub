import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, img } from '../utils'

// Paramount+ native episode list — anonymous XHR, but US-geo (route through the FKN proxy with US egress).
// No native search: title search/metadata come from TMDB; the show {slug} comes from the JustWatch
// `paramountplus.com/shows/{slug}` deep link (extractContentId returns parts[1]). See docs/streaming-platform-apis.md.
// ⚠️ Response field names below are from yt-dlp's extractor and untested live — verify when the proxy is up.

const SCORE = 0.2

export const icon = 'https://www.paramountplus.com/favicon.ico'
export const originUrl = 'https://www.paramountplus.com'
export const categories = ['ANIME'] as const
export const name = 'Paramount+'
export const origin = 'paramount'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['paramount']
export const color = '#0064ff'

const BASE = 'https://www.paramountplus.com'

interface ParamountEpisode {
  content_id: string
  url?: string
  title?: string
  episode_num?: number | string
  season_num?: number | string
  thumbnail?: string
}

const fetchEpisodes = async (slug: string, mediaUri: string, ctx: ExtractorServerContext): Promise<GQLEpisode[]> => {
  const res = await ctx
    .fetch(`${BASE}/shows/${slug}/xhr/episodes/page/0/size/100000/xs/0/season/0/`)
    .then(r => r.json() as Promise<{ result?: { data?: ParamountEpisode[] } }>)
    .catch(() => undefined)
  return (res?.result?.data ?? []).map(episode =>
    makeEpisode({
      origin,
      id: episode.content_id,
      mediaUri,
      url: episode.url ? `${BASE}${episode.url}` : undefined,
      score: SCORE,
      titles: episode.title ? [{ language: 'en', title: episode.title, score: SCORE }] : [],
      thumbnails: img(episode.thumbnail, SCORE),
      seasonNumber: episode.season_num != null ? Number(episode.season_num) : undefined,
      episodeNumber: episode.episode_num != null ? Number(episode.episode_num) : undefined,
    })
  )
}

const getMedia = async (slug: string, ctx: ExtractorServerContext): Promise<GQLMedia> => {
  const media = makeMedia({ origin, id: slug, url: `${BASE}/shows/${slug}`, score: SCORE })
  media.episodes = await fetchEpisodes(slug, media.uri, ctx)
  media.episodeCount = media.episodes.length
  return media
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const slug = extractAggregatedUriOrigin(uri, origin)?.id
        yield { media: slug ? await getMedia(slug, ctx) : null }
      }
    },
    // No native search — TMDB/JustWatch handle discovery.
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
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
