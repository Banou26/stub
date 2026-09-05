import type { ExtractorServerContext } from '../../worker/extractor'
import { airedDate } from '../aired-date'
import type { Resolvers, Media as GQLMedia, MediaPageInput, RequestContext } from '../../generated/schema/types.generated'
import { MediaStatus as GQLMediaStatus, MediaType as GQLMediaType } from '../../generated/graphql'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { Maybe, Media, MediaExternalLink, MediaStatus, MediaTag, Page } from './types'
import { makeMedia, normalizePage } from '../utils'
import { MEDIA_SEASONS, MediaSeasonName } from '../season'
import { createAnilistFrontendSession } from './frontend'

export const icon = 'https://anilist.co/img/icons/favicon-32x32.png'
export const originUrl = 'https://anilist.co'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'Anilist'
export const origin = 'anilist'
export const official = true
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['anilist']

const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    native
    english
  }
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  season
  seasonYear
  status
  format
  type
  genres
  tags {
    name
    isMediaSpoiler
    isGeneralSpoiler
  }
  synonyms
  duration
  popularity
  episodes
  source(version: 2)
  averageScore
  siteUrl
  description
  bannerImage
  coverImage {
    medium
    large
    extraLarge
    color
  }
  trailer {
    id
    site
    thumbnail
  }
  externalLinks {
    site
    siteId
    url
  }
  airingSchedule {
    edges {
      node {
        airingAt
        episode
        id
        media {
          id
          idMal
        }
        mediaId
        timeUntilAiring
      }
    }
  }
`

/**
 * The one browse, covering search and every filter a `mediaPage` input can name.
 *
 * Every argument is optional, so an unnamed filter is an absent variable rather than a second query.
 *
 * `type: ANIME` is fixed rather than a variable: the season query this replaces omitted it, and a
 * Page with no type argument answers manga formats too.
 */
const BROWSE_QUERY = `
  query (
    $search: String
    $season: MediaSeason
    $seasonYear: Int
    $format_in: [MediaFormat]
    $status: MediaStatus
    $genre_in: [String]
    $tag_in: [String]
    $sort: [MediaSort]
    $page: Int
  ) {
    Page(page: $page) {
      pageInfo {
        lastPage
        hasNextPage
        total
      }
      media(
        type: ANIME
        search: $search
        season: $season
        seasonYear: $seasonYear
        format_in: $format_in
        status: $status
        genre_in: $genre_in
        tag_in: $tag_in
        sort: $sort
      ) {
        ${MEDIA_FIELDS.split('\n').join('\n      ')}
      }
    }
  }
`

const GET_MEDIA = `
  query GetMedia ($id: Int, $idMal: Int, $type: MediaType) {
    Media(idMal: $idMal, id: $id, type: $type) {
      ${MEDIA_FIELDS.split('\n').join('\n    ')}
    }
  }
`

/**
 * One score for every field, deliberately BELOW jikan and anizip, which both sit at 0.9.
 *
 * Owner's call, 2026-08-18. Know what it does, because `byScore` in `store/aggregate.ts` sorts
 * descending and the top source takes the field outright: wherever all three describe the same
 * media, jikan and anizip now win the title, the cover, the description and every media-level
 * field (`status`, `startDate`, `episodeCount`, `type`, `averageScore`). AniList still supplies
 * anything neither of them has, because the aggregate falls through with `??`.
 *
 * That reverses an earlier deliberate change, and the reasoning it replaces is worth keeping:
 * four constants used to disagree, with title, description and cover at 0.7 while a declared
 * `THUMBNAIL_SCORE` of 0.9 was never referenced, so covers went out at 0.7 and lost to MyAnimeList
 * and AniZip. The note then was that AniList has the best art of the three. If the art regressing
 * is not wanted, the fix is not to raise this back to 0.9 but to score the cover separately.
 */
const SCORE = 0.8

/** What this source knows about the run it is describing, handed to the origin it asks. */
type RunEvidence = { startDate?: string, titles: string[], episodeCount?: number }

// The show id comes off AniList's own externalLinks, a first-party mapping and not a fuzzy union, so
// WHICH SHOW is settled here and the answering source settles which season. Until 2026-09-05 this
// called crunchyroll's `closestSeason` directly and took the nearest season inside 45 days; Rule 1 of
// `pickSimilarSeason` refuses when two seasons sit inside the window (two cours released together), so
// this path loses that hit and gains the fold and year vetoes it never had.
const siteMappings = [
  {
    siteId: 5,
    mapper: async (
      externalLink: MediaExternalLink,
      evidence: RunEvidence,
      requestContext: RequestContext | null | undefined,
      context: ExtractorServerContext
    ): Promise<GQLMedia | undefined> => {
      const match = externalLink.url?.match(/https:\/\/www\.crunchyroll\.com\/series\/(\w+)/)
      const crunchyrollSeriesId = match?.[1]
      if (!crunchyrollSeriesId) return undefined
      const answer = await context.similarMedia('cr', {
        showId: crunchyrollSeriesId,
        startDate: evidence.startDate,
        titles: evidence.titles,
        episodeCount: evidence.episodeCount,
        context: requestContext ?? undefined
      })
      // attached by IDENTITY alone. The funnel's answer is the selection in worker/similar-document.ts,
      // a partial view of crunchyroll's row, and a handle node is written to the store as a row: its
      // titles, one field each, replaced crunchyroll's own of equal length, language and score gone
      // (2026-09-05). Crunchyroll's insertion is the row; this handle only names it.
      return answer && makeMedia({ origin: answer.origin, id: answer.id, url: answer.url, scope: answer.scope })
    }
  }
]

type AnilistResponse<T> = {
  data?: T | null
  errors?: { message?: string, status?: number }[]
}

/**
 * How long the public API stays skipped after it has failed.
 *
 * It is either up or switched off wholesale rather than flaky per request, so once it has answered
 * 403 there is no point paying for a round trip on every call. The expiry is the half that matters:
 * it is what lets this source return to the public API on its own when AniList turns it back on,
 * with no deploy and nothing to remember.
 */
const PUBLIC_API_RETRY_MS = 5 * 60 * 1000
let publicApiDownUntil = 0

/**
 * One frontend session for the module, so the CSRF pair is acquired once rather than per query.
 *
 * The fetch is read at call time rather than captured, because the session outlives any single
 * request context. In practice every context shares the one bridge in ../../worker/fetch.ts, so
 * this only ever guards against that stopping being true.
 */
let latestFetch: ExtractorServerContext['fetch'] | undefined
const frontend = createAnilistFrontendSession((input, init) => {
  if (!latestFetch) throw new Error('AniList frontend: queried before any request context bound a fetch')
  return latestFetch(input, init)
})

// AniList reports failures with an HTTP 200 and a `{ data: null, errors: [...] }` body, rate limits above all
const fetchPublicAnilist = async <T>({ query, variables }: { query: string, variables: any }, context: ExtractorServerContext): Promise<T | undefined> => {
  const response = await context.fetch('https://graphql.anilist.co/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables
    })
  })
  const body = await response.json().catch(() => undefined) as AnilistResponse<T> | undefined
  if (body?.errors?.length) {
    const reason = body.errors.map(error => error.message).filter(Boolean).join('; ')
    console.error(`AniList request failed (HTTP ${response.status}): ${reason || 'no message'}`)
  }
  if (body?.data == null) {
    if (!body?.errors?.length) console.error(`AniList returned no data (HTTP ${response.status})`)
    return undefined
  }
  return body.data
}

/**
 * The public API, falling back to AniList's own frontend endpoint when it is not answering.
 *
 * Measured 2026-08-16: graphql.anilist.co returned 403 "The AniList API has been temporarily
 * disabled due to severe stability issues" to everyone, while anilist.co/graphql served this exact
 * query with every field populated. See ./frontend.ts for what the fallback has to satisfy.
 */
const fetchAnilist = async <T>(request: { query: string, variables: any }, context: ExtractorServerContext): Promise<T | undefined> => {
  latestFetch = context.fetch
  if (Date.now() >= publicApiDownUntil) {
    const data = await fetchPublicAnilist<T>(request, context).catch(() => undefined)
    if (data != null) return data
    publicApiDownUntil = Date.now() + PUBLIC_API_RETRY_MS
  }
  return frontend.query<T>(request)
}

const fetchMedia = async (
  { id, idMal }: { id?: number, idMal?: number },
  context: ExtractorServerContext,
  requestContext?: RequestContext | null
): Promise<GQLMedia | undefined> => {
  const data = await fetchAnilist<{ Media: Media }>({ query: GET_MEDIA, variables: { id, idMal, type: 'ANIME' } }, context)
  if (!data?.Media) return undefined

  // The same date `normalizeMedia` publishes, rather than a second one built here. A date hand-rolled
  // here fabricated a day (`day ?? 1` invents the 1st for the 2355 of 29722 entries whose day AniList
  // does not know, while `airedDate` finds the airing schedule's episode 1 timestamp in exactly that
  // case) and built it in local time (`new Date(y, m, d)` rolls day 4 back to `Fri, 03 Jul 2026
  // 15:00:00 GMT` under JST; `airedDate` uses Date.UTC throughout).
  const evidence: RunEvidence = {
    startDate: airedDate(data.Media.startDate, data.Media.airingSchedule, 'first'),
    titles: [data.Media.title?.english, data.Media.title?.romaji, data.Media.title?.native].filter((title): title is string => Boolean(title)),
    episodeCount: data.Media.episodes ?? undefined
  }

  const externalLinks = data.Media.externalLinks
    ?.filter((link): link is NonNullable<typeof link> => Boolean(link))
    .filter(externalLink => externalLinkHasSiteId(externalLink))
    ?? []

  const handles = (await Promise.all(
    externalLinks.map(async (externalLink) => {
      const mapper = siteMappings.find(m => m.siteId === externalLink.siteId)
      if (!mapper) return undefined
      try {
        return await mapper.mapper(externalLink, evidence, requestContext, context)
      } catch (error) {
        console.error(`anilist mapper for siteId ${externalLink.siteId} failed:`, error)
        return undefined
      }
    })
  )).filter((handle): handle is GQLMedia => Boolean(handle))

  return normalizeMedia(data.Media, handles)
}

const fetchBrowsePage = (variables: BrowseVariables, page: number, context: ExtractorServerContext) =>
  fetchAnilist<{ Page: Page }>({ query: BROWSE_QUERY, variables: { ...variables, page } }, context)

/**
 * One browse, paged.
 *
 * THE PAGE COUNT IS A BUDGET, not a style choice: AniList answers 30 requests a minute on a shared
 * relay ip (measured in scripts/measure-start-date-window.mjs), and a single listing that spent more
 * of it would starve every other call in the same minute. So a filtered browse takes 3 pages, which
 * `sort` makes the 150 most popular rather than an arbitrary slice, and a search takes 1, since its
 * own ranking already puts the answer on the first page.
 */
const browse = async (variables: BrowseVariables, context: ExtractorServerContext) => {
  const data = await fetchBrowsePage(variables, 1, context)
  const lastPage = data?.Page?.pageInfo?.lastPage

  return normalizePage(
    [
      ...data?.Page?.media ?? [],
      ...!variables.search && lastPage
        ? (await Promise.all(
          new Array(Math.min(2, lastPage - 1))
            .fill(undefined)
            .map((_, i) => fetchBrowsePage(variables, i + 2, context).then(data => data?.Page?.media ?? []))
        )).flat()
        : []
    ],
    media => normalizeMedia(media as Media),
    'AniList browse'
  )
}

const externalLinkHasSiteId =
  (externalLink: Maybe<MediaExternalLink>): externalLink is MediaExternalLink & { siteId: number } =>
    Boolean(externalLink?.siteId)

// A tag names a theme, and AniList flags the ones that name a twist instead. Those are dropped: the
// tags reach a listing, where a row is read before the show is watched.
const isPublicTag = (tag: Maybe<MediaTag>): tag is MediaTag =>
  Boolean(tag?.name) && !tag?.isMediaSpoiler && !tag?.isGeneralSpoiler

// AniList spells the four seasons exactly as the schema does, so this is a guard rather than a
// mapping: an upstream value the schema has no member for is dropped instead of reaching the store.
const knownSeason = (season: Maybe<string> | undefined): MediaSeasonName | undefined =>
  MEDIA_SEASONS.find(name => name === season)

const normalizeMedia = (media: Media, extraHandles: GQLMedia[] = []) => {
  const malHandle =
    media.idMal
      ? makeMedia({
        _id: crypto.randomUUID(),
        uri: `mal:${media.idMal}`,
        origin: 'mal',
        id: media.idMal.toString(),
        url: `https://myanimelist.net/anime/${media.idMal}`
      })
      : undefined

  const startDate = airedDate(media.startDate, media.airingSchedule, 'first')
  const endDate = airedDate(media.endDate, media.airingSchedule, 'last')

  return makeMedia({
    _id: crypto.randomUUID(),
    uri: `${origin}:${media.id}`,
    origin,
    id: media.id.toString(),
    url: media.siteUrl,
    categories: media.format === 'MOVIE' ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    genres: (media.genres ?? []).filter((genre): genre is string => Boolean(genre)),
    tags: (media.tags ?? []).filter(isPublicTag).map(tag => tag.name),
    season: knownSeason(media.season),
    seasonYear: media.seasonYear,
    type:
      media.format === 'TV' ? GQLMediaType.Tv
      : media.format === 'TV_SHORT' ? GQLMediaType.TvShort
      : media.format === 'MOVIE' ? GQLMediaType.Movie
      : media.format === 'SPECIAL' ? GQLMediaType.Special
      : media.format === 'OVA' ? GQLMediaType.Ova
      : media.format === 'ONA' ? GQLMediaType.Ona
      : undefined,
    handles: [
      ...extraHandles,
      ...malHandle ? [malHandle] : []
    ],
    score: SCORE,
    averageScore: media.averageScore,
    descriptions:
      media.description
        ? [{ language: 'en', description: media.description, score: SCORE }]
        : [],
    shortDescriptions:
      media.description
        ? [{ language: 'en', shortDescription: media.description, score: SCORE }]
        : [],
    titles: [
      ...media.title?.english ? [{ language: 'en', title: media.title.english, score: SCORE }] : [],
      ...media.title?.romaji ? [{ language: 'jp-en', title: media.title.romaji, score: SCORE }] : [],
      ...media.title?.native ? [{ language: 'jp', title: media.title.native, score: SCORE }] : []
    ],
    covers: [
      ...media.coverImage?.extraLarge ? [{ language: 'jp', url: media.coverImage.extraLarge, score: SCORE }] : []
    ],
    episodeCount: media.episodes,
    popularity: media.popularity,
    status:
      media.status === MediaStatus.NotYetReleased ? GQLMediaStatus.NotYetReleased
      : media.status === MediaStatus.Releasing ? GQLMediaStatus.Releasing
      : media.status === MediaStatus.Finished ? GQLMediaStatus.Finished
      : media.status === MediaStatus.Cancelled ? GQLMediaStatus.Cancelled
      : media.status === MediaStatus.Hiatus ? GQLMediaStatus.Hiatus
      : undefined,
    startDate,
    endDate,
    trailers:
      media.trailer?.site === 'youtube' && media.trailer.id
        ? [{
          uri: `yt:${media.trailer.id}`,
          language: 'en',
          origin: 'yt',
          id: media.trailer.id.toString(),
          url: `https://www.youtube.com/watch?v=${media.trailer.id}`,
          thumbnail: media.trailer.thumbnail
        }]
        : [],
  })
}

// stub's MediaType is AniList's MediaFormat plus two members it has no format for: ANIME names a
// category and LIVE_ACTION names a catalogue this one does not carry. Sending either is an invalid
// enum value, which fails the WHOLE document, so they are dropped rather than passed on.
const ANILIST_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA'] as const
type AnilistFormat = (typeof ANILIST_FORMATS)[number]

/** The arguments BROWSE_QUERY declares, spelled as AniList spells them. */
type BrowseVariables = {
  search?: string
  season?: MediaSeasonName
  seasonYear?: number
  format_in?: AnilistFormat[]
  status?: string
  genre_in?: string[]
  tag_in?: string[]
  sort?: string[]
}

/**
 * The browse a `mediaPage` input asks for, or nothing when it names none this source can answer.
 *
 * Answering nothing is the honest reply to an unfiltered page: AniList is asked for a listing, never
 * for the catalogue.
 */
const browseVariables = (
  input: Pick<MediaPageInput, 'search' | 'status' | 'season' | 'seasonYear' | 'formats' | 'genres' | 'tags'>
): BrowseVariables | undefined => {
  const search = input.search || undefined
  const namesABrowse =
    Boolean(input.status)
    || Boolean(search)
    || Boolean(input.season)
    || Boolean(input.seasonYear)
    || Boolean(input.formats?.length)
    || Boolean(input.genres?.length)
    || Boolean(input.tags?.length)
  if (!namesABrowse) return undefined

  // A RELEASING page used to mean "the current season" here, because the home page said RELEASING and
  // meant exactly that, so this substituted the clock's season and dropped the status. The home page
  // now names its season (router/home/index.tsx), which leaves nothing that wants the substitution and
  // one caller that is ruined by it: picking Airing on the search page asked AniList which shows are
  // in this season rather than which are releasing, so no long-running show could ever match, and the
  // page came back byte for byte identical to an unfiltered season.
  const formats = (input.formats ?? []).filter((format): format is AnilistFormat => (ANILIST_FORMATS as readonly string[]).includes(format))

  return {
    search,
    season: input.season ?? undefined,
    seasonYear: input.seasonYear ?? undefined,
    // an empty list is not a filter: every format the caller named is one AniList has no name for
    format_in: formats.length ? formats : undefined,
    status: input.status ?? undefined,
    genre_in: input.genres?.length ? input.genres : undefined,
    tag_in: input.tags?.length ? input.tags : undefined,
    // A season browse must say POPULARITY_DESC: AniList orders by id otherwise, which makes the three
    // page window an arbitrary slice of a ~400 title season rather than its most popular 150.
    // SEARCH_MATCH is carried across because the old search query held it as a literal, not because a
    // search is broken without it: measured on anilist.co/graphql, an unsorted search still answers
    // sensibly. Saying it keeps the ranking a property of this file rather than of a server default.
    sort: search ? ['SEARCH_MATCH'] : ['POPULARITY_DESC']
  }
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri: _uri, context } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (!uri) return yield { media: null }
        const media = await fetchMedia({ id: Number(uri.id) }, ctx, context)
        yield {
          media
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input }, ctx: ExtractorServerContext) {
        const variables = browseVariables(input)
        if (!variables) return
        yield {
          mediaPage: {
            nodes: await browse(variables, ctx)
          }
        }
      }
    }
  }
}
