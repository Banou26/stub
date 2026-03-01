import type { ExtractorServerContext } from '../extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { fromAggregatedUri, isAggregatedUri } from '../../utils/uri'

export const originUrl = 'https://api.ani.zip/' as const
export const origin = 'anizip' as const
export const categories = ['ANIME'] as const
export const name = 'AniZip' as const
export const official = false as const
export const metadataOnly = true as const
export const isApiOnly = true
export const supportedUris = ['anidb', 'mal']

const normalizeMedia = (media: AnimeSeries, context: ExtractorServerContext) => {
  const uri = `${origin}:${media.mappings.anidb_id}`
  return {
    _id: crypto.randomUUID() as string,
    uri,
    origin,
    id: media.mappings.anidb_id.toString(),
    url: `https://api.ani.zip/mappings?anidb_id=${media.mappings.anidb_id}`,
    handles: [
      {
        _id: crypto.randomUUID(),
        uri: `mal:${media.mappings.mal_id}`,
        origin: 'mal',
        id: media.mappings.mal_id.toString(),
        url: `https://myanimelist.net/anime/${media.mappings.mal_id}`,
        titles: [],
        descriptions: [],
        shortDescriptions: [],
        covers: [],
        banners: [],
        episodes: [],
        handles: [],
        trailers: [],
      } satisfies GQLMedia
    ],
    titles: [
      ...media.titles.en ? [{ language: 'en', title: media.titles.en }] : [],
      ...media.titles.ja ? [{ language: 'ja', title: media.titles.ja }] : [],
    ],
    descriptions: [],
    shortDescriptions: [],
    trailers: [],
    covers:
      media
        .images
        ?.filter(image => image.coverType === 'Poster')
        .map(image => ({ url: image.url }))
      ?? [],
    banners:
      media
        .images
        ?.filter(image => image.coverType === 'Banner')
        .map(image => ({ url: image.url }))
      ?? [],
    episodeCount: media.episodeCount,
    episodes:
      Object
        .entries(media.episodes)
        .map(([episodeId, episode]) => {
          const id = `${media.mappings.anidb_id}-${episodeId}`

          return {
            _id: crypto.randomUUID() as string,
            uri: `${origin}:${id}`,
            origin,
            id: id.toString(),
            url: `https://api.ani.zip/mappings?anidb_id=${media.mappings.anidb_id}`,
            handles: [],
            mediaUri: uri,
            titles: [
              ...episode.title.en ? [{ language: 'en', title: episode.title.en }] : [],
              ...episode.title.ja ? [{ language: 'ja', title: episode.title.ja }] : [],
            ],
            descriptions:
              episode.overview
                ? [{ language: 'en', description: episode.overview }]
                : [],
            shortDescriptions:
              episode.summary ? [{ language: 'en', shortDescription: episode.summary }]
              : episode.overview ? [{ language: 'en', shortDescription: episode.overview }]
              : [],
            thumbnails: episode.image ? [{ url: episode.image }] : [],
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
          } satisfies GQLEpisode
        })
      ?? []
  } satisfies GQLMedia
}

const fetchAnizipJsonMappings = (providerId: 'anilist' | 'mal' | 'anidb', id: string, context: ExtractorServerContext) =>
  context.fetch(`https://api.ani.zip/mappings?${providerId}_id=${id}&specials=1`)
    .then(res => res.json() as Promise<AnimeSeries>)

const fetchAnizipMappings = (providerId: 'anilist' | 'mal' | 'anidb', id: string, context: ExtractorServerContext) =>
  fetchAnizipJsonMappings(providerId, id, context)
    .then(animeData => normalizeMedia(animeData, context))

const fetchMALMappings = (id: string, context: ExtractorServerContext) => fetchAnizipMappings('mal', id, context)
const fetchAnidbMappings = (id: string, context: ExtractorServerContext) => fetchAnizipMappings('anidb', id, context)
const fetchAnilistMappings = (id: string, context: ExtractorServerContext) => fetchAnizipMappings('anilist', id, context)

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      resolve: (parent: GQLMedia) => parent,
      subscribe: async function*(_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !isAggregatedUri(uri)) return
        const uris = fromAggregatedUri(uri)
        const malId = uris?.handleUrisValues.find(uri => uri.origin === 'mal')
        if (malId) {
          yield await fetchMALMappings(malId.id, ctx)
        }
      }
    }
  }
}

// Language-specific title type
interface Title {
  'x-jat'?: string;
  ru?: string;
  ko?: string;
  cs?: string;
  'zh-Hans'?: string;
  en?: string;
  ja?: string;
  fr?: string;
  pl?: string;
  [key: string]: string | undefined; // Allow additional language codes
}

// Episode-specific title (subset of main title languages)
interface EpisodeTitle {
  ja?: string;
  en?: string;
  fr?: string;
  'x-jat'?: string;
}

// Individual episode information
interface Episode {
  tvdbShowId: number;
  tvdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber: number;
  title: EpisodeTitle;
  airDate: string; // Format: "YYYY-MM-DD"
  airDateUtc: string; // ISO 8601 datetime
  runtime: number;
  overview?: string;
  image?: string; // URL
  episode: string;
  anidbEid: number;
  length: number;
  airdate: string; // Format: "YYYY-MM-DD"
  rating: string; // Numeric string
  summary?: string;
  finaleType?: 'season' | 'series'; // Optional, only on finale episodes
}

// Episodes collection
interface Episodes {
  [episodeNumber: string]: Episode;
}

// Image/artwork information
interface Image {
  coverType: 'Banner' | 'Poster' | 'Fanart' | 'Clearlogo';
  url: string;
}

// External service mappings/IDs
interface Mappings {
  animeplanet_id: string;
  kitsu_id: number;
  mal_id: number;
  type: 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
  anilist_id: number;
  anisearch_id: number;
  anidb_id: number;
  notifymoe_id: string;
  livechart_id: number;
  thetvdb_id: number;
  imdb_id: string;
  themoviedb_id: string;
}

// Main anime series type
interface AnimeSeries {
  titles: Title;
  episodes: Episodes;
  episodeCount: number;
  specialCount: number;
  images?: Image[];
  mappings: Mappings;
}
