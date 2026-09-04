import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia, makeEpisode, img } from '../utils'

// Paramount+ native episode list - anonymous XHR, but US-geo (route through the FKN proxy with US egress). No native search: the show {slug} comes from the JustWatch deep link.

const SCORE = 0.2

export const icon = 'https://www.paramountplus.com/favicon.ico'
export const originUrl = 'https://www.paramountplus.com'
export const categories = ['SERIES'] as const
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
  const media = makeMedia({ origin, id: slug, url: `${BASE}/shows/${slug}`, score: SCORE, scope: 'CONTAINER', categories: ['SERIES'] })
  // This media is SHOW level by construction, which is what the CONTAINER scope says: its id is the
  // show's slug, so no run may claim sameness with it. The fetch above asks for
  // `season/0` at `size/100000`, which is every episode of every season. Every media in this store is
  // one run, so `episodeNumber` is within-season, and flattening several seasons into one list collides
  // them: `store/db.ts` hangs a HAS_EPISODE edge off this uri for each, and `Media.episodes` groups the
  // union by episodeNumber ALONE, so the row count becomes the LONGEST season and whatever else the
  // cluster holds shares rows with a season nobody asked for. Measured live 2026-08-31 through the same
  // mechanism: 24 rows on a 14 episode season page. `crunchyroll/extractor.ts` carries this guard too.
  //
  // The media itself stays, because search mints exactly these ids. A show whose episodes are all one
  // season is unaffected, its list being honest.
  const episodes = await fetchEpisodes(slug, media.uri, ctx)
  const seasons = new Set(episodes.map(episode => episode.seasonNumber ?? 0))
  if (seasons.size <= 1) {
    media.episodes = episodes
    media.episodeCount = episodes.length
  }
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
