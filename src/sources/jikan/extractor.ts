import type { ExtractorServerContext } from '../../worker/extractor'
import type { Media, MediaTrailer, Resolvers } from '../../generated/schema/types.generated'
import { MediaStatus, MediaType } from '../../generated/graphql'
import { fromUri, isUri } from '../../utils/uri'
import { makeMedia, normalizePage, sameAs } from '../utils'
import { MAL_TYPE, isContinuing, parseMalSeason, type MalSeasonEntry } from './season-scrape'

export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['mal']

const SCORE = 0.9
const DESCRIPTION_SCORE = 0.9

const youtubeEmbedRegex = /\/embed\/([a-zA-Z0-9_-]{11})/

/**
 * The AniDB id a MyAnimeList external link carries, or undefined when it carries none.
 *
 * MyAnimeList publishes two url shapes and only one of them puts the id in the path:
 *
 *   https://anidb.net/perl-bin/animedb.pl?show=anime&aid=23   the common one, id in `aid`
 *   https://anidb.net/anime/23                                the modern one, id in the path
 *
 * Both halves have to be SHAPE TESTED, and neither was. Reading `pathname.split('/')[2]` as a fallback
 * takes index 2 of `/perl-bin/animedb.pl`, which is the literal string `animedb.pl`, so any record on
 * the common shape whose `aid` went missing minted `anidb:animedb.pl` rather than nothing. An id that
 * is not an id in the provider's own space clusters with nothing at best; here it is worse, because
 * every record that produced it produced the SAME one and `upsertMedia` welds them all into one media.
 *
 * The numeric test is the same rule from the other end: an AniDB id is a number, so `?aid=` carrying
 * anything else is a link we cannot read, not a link to something called that.
 */
export const anidbIdFromUrl = (url: string | undefined | null): string | undefined => {
  if (!url) return undefined
  try {
    const { searchParams, pathname } = new URL(url)
    const id = searchParams.get('aid') ?? /^\/anime\/([^/?#]+)/.exec(pathname)?.[1]
    return id && /^\d+$/.test(id) ? id : undefined
  } catch {
    // a malformed url used to throw out of normalizeMedia, taking the whole record with it
    return undefined
  }
}

const normalizeMedia = async <T extends SearchAnimeData & Partial<Pick<AnimeData, 'external'> | AnimeData>>(data: T, context: ExtractorServerContext) => {
  const aniDBSource = data.external?.find(site => site.name === 'AniDB')
  // BOTH handles gate on the ID, never on the presence of the link. The anizip one used to gate on
  // `aniDBSource` while interpolating `aniDBId`, so a link we could not read minted the literal uri
  // `anizip:undefined` on every record that carried one, welding them.
  const aniDBId = anidbIdFromUrl(aniDBSource?.url)

  const anidbHandle =
    aniDBId
      ? {
        _id: crypto.randomUUID(),
        uri: `anidb:${aniDBId}`,
        origin: 'anidb',
        id: aniDBId,
        url: aniDBSource?.url
      } as Media
      : undefined

  const anizipHandle =
    aniDBId
      ? {
        _id: crypto.randomUUID(),
        uri: `anizip:${aniDBId}`,
        origin: 'anizip',
        id: aniDBId,
        url: `https://api.ani.zip/mappings?anidb_id=${aniDBId}`
      } as Media
      : undefined

  const embeddedYoutubeUrl =
    data.trailer?.embed_url
      ? data.trailer.embed_url.match(youtubeEmbedRegex)?.[1]
      : undefined
  
  const trailers: MediaTrailer[] =
      data.trailer?.youtube_id ? [{
      uri: `yt:${data.trailer.youtube_id}`,
      origin: 'yt',
      id: data.trailer.youtube_id,
      url: `https://www.youtube.com/watch?v=${data.trailer.youtube_id}`,
      language: 'en',
      thumbnail: data.trailer.images.image_url
    }]
    : data.trailer?.embed_url && embeddedYoutubeUrl ? [{
      uri: `yt:${embeddedYoutubeUrl}`,
      origin: 'yt',
      id: embeddedYoutubeUrl,
      url: `https://www.youtube.com/watch?v=${embeddedYoutubeUrl}`,
      language: 'en',
      thumbnail: data.trailer.images.image_url
    }]
    : []
  
  return {
    _id: crypto.randomUUID(),
    uri: `${origin}:${data.mal_id}`,
    origin,
    categories: data.type === 'Movie' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    type:
      data.type === 'TV' ? MediaType.Tv
      : data.type === 'Movie' ? MediaType.Movie
      : data.type === 'Special' ? MediaType.Special
      : data.type === 'OVA' ? MediaType.Ova
      : data.type === 'ONA' ? MediaType.Ona
      : undefined,
    id: data.mal_id.toString(),
    url: data.url,
    // both are SAME_AS: AniDB models one entry per RUN for anime, and anizip is keyed on the anidb id,
    // so neither names a container
    handles: [
      ...anidbHandle ? [sameAs(anidbHandle)] : [],
      ...anizipHandle ? [sameAs(anizipHandle)] : []
    ],
    score: SCORE,
    averageScore: data.score,
    descriptions:
      data.synopsis
        ? [{ language: 'en', description: data.synopsis, score: DESCRIPTION_SCORE }]
        : [],
    shortDescriptions:
      data.synopsis
        ? [{ language: 'en', shortDescription: data.synopsis, score: DESCRIPTION_SCORE }]
        : [],
    titles: [
      ... data.title_english ? [{ language: 'en', title: data.title_english, score: SCORE }] : [],
      ... data.title ? [{ language: 'jp-en', title: data.title, score: SCORE }] : [],
      ... data.title_japanese ? [{ language: 'jp', title: data.title_japanese, score: SCORE }] : []
    ],
    covers: [{
      language: 'en',
      url: data.images.webp.large_image_url,
      score: SCORE
    }],
    banners: [],
    episodes: [],
    episodeCount: data.episodes,
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? MediaStatus.Releasing
      : data.status === 'Finished Airing' ? MediaStatus.Finished
      : undefined,
    startDate: data.aired?.from ?? null,
    endDate: data.aired?.to ?? null,
    trailers
  } satisfies Media
}

const fetchSearchAnime = ({ search }: { search: string }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime?q=${search}`)
    .then(response => response.json() as Promise<AnimeSearchResponse>)
    .catch(error => {
      console.error('Jikan search failed', error)
      return {} as AnimeSearchResponse
    })
    .then(json =>
      json.data
        ? normalizePage(json.data, media => normalizeMedia(media, context), 'Jikan search')
        : undefined
    )

const fetchMedia = ({ id }: { id: number }, context: ExtractorServerContext) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    .then(response => response.json() as Promise<AnimeResponse>)
    .then(json =>
      json.data
        ? normalizeMedia(json.data, context)
        : undefined
    )

// A rate limited page answers with an HTML body rather than JSON, so the parse itself can reject.
const getSeasonNow = (page = 1, context: ExtractorServerContext): Promise<AnimeSearchResponse> =>
  context
    .fetch(`https://api.jikan.moe/v4/seasons/now?page=${page}&sfw=true`)
    .then(response => response.json() as Promise<AnimeSearchResponse>)
    .catch(error => {
      console.error(`Jikan season page ${page} failed`, error)
      return {} as AnimeSearchResponse
    })

const normalizeScrapedMedia = (entry: MalSeasonEntry): Media => {
  const kind = MAL_TYPE[entry.typeId as keyof typeof MAL_TYPE]
  return makeMedia({
    origin,
    id: entry.id,
    uri: `${origin}:${entry.id}`,
    url: `https://myanimelist.net/anime/${entry.id}`,
    categories: kind === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    type:
      kind === 'TV' ? MediaType.Tv
      : kind === 'MOVIE' ? MediaType.Movie
      : kind === 'SPECIAL' ? MediaType.Special
      : kind === 'OVA' ? MediaType.Ova
      : kind === 'ONA' ? MediaType.Ona
      : undefined,
    score: SCORE,
    titles: [
      ...entry.englishTitle ? [{ language: 'en', title: entry.englishTitle, score: SCORE }] : [],
      { language: 'jp-en', title: entry.title, score: SCORE },
    ],
    covers: entry.cover ? [{ language: 'en', url: entry.cover, score: SCORE }] : [],
    descriptions: entry.synopsis ? [{ language: 'en', description: entry.synopsis, score: DESCRIPTION_SCORE }] : [],
    shortDescriptions: entry.synopsis ? [{ language: 'en', shortDescription: entry.synopsis, score: DESCRIPTION_SCORE }] : [],
    episodeCount: entry.episodes,
    // members, the same figure the API returns as `members`, so both paths sort the same way
    popularity: entry.members,
    averageScore: entry.score,
    startDate: entry.startDate,
  })
}

/**
 * The seasonal grid off myanimelist.net itself, for when the API cannot be reached.
 *
 * Jikan is unreachable from the FKN proxy's egress: measured 2026-08-16, every Jikan endpoint
 * answered 504 "Jikan failed to connect to MyAnimeList" from both Prague and Hong Kong, repeatedly
 * and cache-busted, while myanimelist.net answered the same egress with the full 1 MB page. So the
 * API being down does not mean this source is down.
 *
 * Measured against that page: 209 entries with 100% covers, synopses, scores, members and start
 * dates, which is more of the season than the API's own first three pages carry. What it does not
 * have is a trailer or a banner, so this degrades the hero rather than the season row.
 */
const scrapeSeasonNow = async (context: ExtractorServerContext): Promise<Media[]> => {
  try {
    const response = await context.fetch('https://myanimelist.net/anime/season')
    const html = await response.text()
    const entries = parseMalSeason(html)
    if (!entries.length) {
      console.error(`MyAnimeList season scrape parsed no entries from ${html.length} bytes`)
      return []
    }
    // MAL's page carries a "TV (Continuing)" block of long-runners that no other seasonal source
    // returns, and the row sorts on members, so One Piece and Meitantei Conan took the first two
    // slots. See MAL_CONTINUING_SECTION for the measurements.
    const seasonal = entries.filter(entry => !isContinuing(entry))
    if (!entries.some(entry => entry.section)) {
      console.error('MyAnimeList season scrape found no section headings, so carried-over shows cannot be told apart')
    }
    return seasonal.map(normalizeScrapedMedia)
  } catch (error) {
    console.error('MyAnimeList season scrape failed', error)
    return []
  }
}

const getFullSeasonNow = async (context: ExtractorServerContext) => {
  const { data, pagination } = await getSeasonNow(1, context)
  // The API answers a 504 with a JSON error envelope, so `.json()` resolves and only the missing
  // `data` says anything went wrong. Falling through here is what keeps the season on the page.
  if (!data?.length) return scrapeSeasonNow(context)
  const extraPages = await Promise.all(
    new Array(Math.max(0, Math.min(2, (pagination?.last_visible_page ?? 1) - 1)))
      .fill(undefined)
      .map((_, i) => getSeasonNow(i + 2, context).then(({ data }) => data ?? []))
  )
  return normalizePage(
    [...data, ...extraPages.flat()],
    mediaData => normalizeMedia(mediaData, context),
    'Jikan season'
  )
}

export const resolvers: Resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri } }, ctx: ExtractorServerContext) {
        if (!uri || !isUri(uri)) return yield { media: null }
        const uriValues = fromUri(uri)
        if (uriValues.origin !== origin) return yield { media: null }
        yield {
          media: await fetchMedia({ id: Number(uriValues.id) }, ctx)
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input: { search, status } }, ctx: ExtractorServerContext) {
        if (status === 'RELEASING') {
          return yield {
            mediaPage: {
              nodes: await getFullSeasonNow(ctx)
            }
          }
        }
        if (search) {
          const results = await fetchSearchAnime({ search }, ctx)
          return yield {
            mediaPage: {
              nodes: results ?? []
            }
          }
        }
        yield { mediaPage: { nodes: [] } }
      }
    },
  }
}


interface MalEntity {
  mal_id: number
  type: string
  name: string
  url: string
}

interface ImageUrls {
  image_url: string
  small_image_url: string
  medium_image_url: string
  large_image_url: string
  maximum_image_url: string
}

interface Images {
  jpg: Omit<ImageUrls, 'medium_image_url' | 'maximum_image_url'>
  webp: Omit<ImageUrls, 'medium_image_url' | 'maximum_image_url'>
}

interface Trailer {
  youtube_id: string
  url: string
  embed_url: string
  images: ImageUrls
}

interface Title {
  type: string
  title: string
}

interface DateProp {
  day: number
  month: number
  year: number
}

interface AiredDates {
  from: string
  to: string
  prop: {
    from: DateProp
    to: DateProp
    string: string
  }
}

interface Broadcast {
  day: string
  time: string
  timezone: string
  string: string
}

interface Relation {
  relation: string
  entry: MalEntity[]
}

interface Theme {
  openings: string[]
  endings: string[]
}

interface ExternalLink {
  name: string
  url: string
}

type AnimeType = 'TV' | 'Movie' | 'OVA' | 'Special' | 'ONA' | 'Music'

type AiringStatus =
  | 'Finished Airing'
  | 'Currently Airing'
  | 'Not yet aired'

type Rating =
  | 'G - All Ages'
  | 'PG - Children'
  | 'PG-13 - Teens 13 or older'
  | 'R - 17+ (violence & profanity)'
  | 'R+ - Mild Nudity'
  | 'Rx - Hentai'

type Season = 'spring' | 'summer' | 'fall' | 'winter'

interface AnimeData {
  mal_id: number
  url: string
  images: Images
  trailer: Trailer
  approved: boolean
  titles: Title[]
  title: string
  title_english: string
  title_japanese: string
  title_synonyms: string[]
  type: AnimeType
  source: string
  episodes: number
  status: AiringStatus
  airing: boolean
  aired: AiredDates
  duration: string
  rating: Rating
  score: number
  scored_by: number
  rank: number
  popularity: number
  members: number
  favorites: number
  synopsis: string
  background: string
  season: Season
  year: number
  broadcast: Broadcast
  producers: MalEntity[]
  licensors: MalEntity[]
  studios: MalEntity[]
  genres: MalEntity[]
  explicit_genres: MalEntity[]
  themes: MalEntity[]
  demographics: MalEntity[]
  relations: Relation[]
  theme: Theme
  external: ExternalLink[]
  streaming: ExternalLink[]
}

interface AnimeResponse {
  data: AnimeData
}

type SearchAnimeData = Omit<AnimeData, 'relations'| 'theme'| 'external'| 'streaming'>

interface PaginationItems {
  count: number;
  total: number;
  per_page: number;
}

interface Pagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: PaginationItems;
}

interface AnimeSearchResponse {
  data: SearchAnimeData[];
  pagination: Pagination;
}
