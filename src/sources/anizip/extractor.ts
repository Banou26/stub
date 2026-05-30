import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { fromAggregatedUri, isAggregatedUri } from '../../utils/uri'
import { makeMedia, makeEpisode } from '../utils'

export const originUrl = 'https://api.ani.zip/' as const
export const origin = 'anizip' as const
export const categories = ['ANIME'] as const
export const name = 'AniZip' as const
export const official = false as const
export const metadataOnly = true as const
export const isApiOnly = true
export const supportedUris = ['anidb', 'mal']

const SCORE = 0.9

const normalizeMedia = (media: AnimeSeries, context: ExtractorServerContext) => {
  const id = media.mappings.anidb_id.toString()
  const uri = `${origin}:${id}`

  // Build handles for all known mappings
  const handles: GQLMedia[] = [
    media.mappings.mal_id ? makeMedia({
      origin: 'mal',
      id: String(media.mappings.mal_id),
      url: `https://myanimelist.net/anime/${media.mappings.mal_id}`,
    }) : undefined,
    media.mappings.anilist_id ? makeMedia({
      origin: 'anilist',
      id: String(media.mappings.anilist_id),
      url: `https://anilist.co/anime/${media.mappings.anilist_id}`,
    }) : undefined,
  ].filter((handle): handle is NonNullable<typeof handle> => Boolean(handle))

  return makeMedia({
    origin,
    id,
    url: `https://api.ani.zip/mappings?anidb_id=${id}`,
    handles,
    titles: [
      ...media.titles.en ? [{ language: 'en', title: media.titles.en, score: SCORE }] : [],
      ...media.titles.ja ? [{ language: 'ja', title: media.titles.ja, score: SCORE }] : [],
    ],
    covers: media.images
      ?.filter(image => image.coverType === 'Poster')
      .map(image => ({ url: image.url, score: SCORE }))
      ?? [],
    banners: media.images
      ?.filter(image => image.coverType === 'Banner')
      .map(image => ({ url: image.url, score: SCORE }))
      ?? [],
    episodeCount: media.episodeCount,
    episodes:
      Object
        .entries(media.episodes)
        .map(([episodeId, episode]) => {
          const epId = `${id}-${episodeId}`
          return makeEpisode({
            origin,
            id: epId,
            mediaUri: uri,
            url: `https://api.ani.zip/mappings?anidb_id=${id}`,
            score: SCORE,
            titles: [
              ...episode.title.en ? [{ language: 'en', title: episode.title.en, score: SCORE }] : [],
              ...episode.title.ja ? [{ language: 'ja', title: episode.title.ja, score: SCORE }] : [],
            ],
            descriptions: episode.overview
              ? [{ language: 'en', description: episode.overview, score: SCORE }]
              : [],
            shortDescriptions: episode.summary
              ? [{ language: 'en', shortDescription: episode.summary, score: SCORE }]
              : episode.overview
                ? [{ language: 'en', shortDescription: episode.overview, score: SCORE }]
                : [],
            thumbnails: episode.image ? [{ url: episode.image, score: SCORE }] : [],
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
            runtime: episode.runtime ?? episode.length,
            releaseDate: episode.airDateUtc ?? episode.airdate,
          })
        })
  })
}

const fetchAnizipJsonMappings = (providerId: 'anilist' | 'mal' | 'anidb', id: string, context: ExtractorServerContext) =>
  context.fetch(`https://api.ani.zip/mappings?${providerId}_id=${id}&specials=1`)
    .then(res => res.json() as Promise<AnimeSeries>)

const fetchAnizipMappings = (providerId: 'anilist' | 'mal' | 'anidb', id: string, context: ExtractorServerContext) =>
  fetchAnizipJsonMappings(providerId, id, context)
    // api.ani.zip answers unknown ids with a 200 "Not Found" string rather than
    // an AnimeSeries, so guard the shape before normalizing to avoid throwing.
    .then(animeData => animeData?.mappings?.anidb_id != null ? normalizeMedia(animeData, context) : null)

const fetchMALMappings = (id: string, context: ExtractorServerContext) => fetchAnizipMappings('mal', id, context)

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      // Always yield once (null when AniZip has nothing for this media). A
      // subscription generator that completes without yielding makes yoga
      // respond 204 No Content, which surfaces as a urql network error in the
      // extractor client ("Network error on …: Caused by: No Content").
      subscribe: async function*(_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !isAggregatedUri(uri)) return yield { media: null }
        const uris = fromAggregatedUri(uri)
        const malId = uris?.handleUrisValues.find(uri => uri.origin === 'mal')
        if (!malId) return yield { media: null }
        yield { media: await fetchMALMappings(malId.id, ctx) }
      }
    }
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface EpisodeTitle {
  ja?: string
  en?: string
  fr?: string
  'x-jat'?: string
}

interface Episode {
  tvdbShowId: number
  tvdbId: number
  seasonNumber: number
  episodeNumber: number
  absoluteEpisodeNumber: number
  title: EpisodeTitle
  airDate: string
  airDateUtc: string
  runtime: number
  overview?: string
  image?: string
  episode: string
  anidbEid: number
  length: number
  airdate: string
  rating: string
  summary?: string
  finaleType?: 'season' | 'series'
}

interface Image {
  coverType: 'Banner' | 'Poster' | 'Fanart' | 'Clearlogo'
  url: string
}

interface Mappings {
  animeplanet_id: string
  kitsu_id: number
  mal_id: number
  type: 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special'
  anilist_id: number
  anisearch_id: number
  anidb_id: number
  notifymoe_id: string
  livechart_id: number
  thetvdb_id: number
  imdb_id: string
  themoviedb_id: string
}

interface AnimeSeries {
  titles: { [key: string]: string | undefined; en?: string; ja?: string }
  episodes: { [episodeNumber: string]: Episode }
  episodeCount: number
  specialCount: number
  images?: Image[]
  mappings: Mappings
}
