import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { resolveEpisodeToSeriesId, crunchyrollId } from '../crunchyroll/extractor'
import { jwId, providerContentId, showRequiresSeason, splitJwId } from './id'
import { parseSeasonNumber, pickSeasonByEpisodeCount } from '../season'
import { makeMedia, makeEpisode, makeMovieEpisode, isMovie, desc, img, getFirstTitle, simplifyTitle, titleSimilarity, mergeHandles, waitForMedia } from '../utils'

const SCORE = 0.2

export const icon = 'https://www.justwatch.com/appasset/img/favicon/favicon-32x32.png'
export const originUrl = 'https://www.justwatch.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'JustWatch'
export const origin = 'jw'
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['jw']

const JW_API = 'https://apis.justwatch.com/graphql'
const JW_IMAGE_BASE = 'https://images.justwatch.com'
const COUNTRY = 'US'
const LANGUAGE = 'en'

const PACKAGE_ORIGIN_MAP: Record<string, string> = {
  cru: 'cr', nfx: 'nf', dnp: 'disney', amp: 'amazon', atp: 'appletv',
  hlu: 'hulu', hbm: 'hbo', pcp: 'peacock', pmp: 'paramount', fuv: 'fubo'
}

const extractRealUrl = (affiliateUrl: string): string | undefined => {
  try {
    const url = new URL(affiliateUrl)
    return url.searchParams.get('u') ?? url.searchParams.get('r') ?? undefined
  } catch {}
  return undefined
}

const extractContentId = (url: string): string | undefined => {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace('www.', '')
    const parts = pathname.split('/').filter(Boolean)
    if (host === 'netflix.com') return parts[1]
    if (host === 'crunchyroll.com' && parts[0] === 'series') return parts[1]
    if (host.startsWith('amazon.')) return parts.at(-1)
    if (host === 'hulu.com') {
      const last = parts.at(-1)
      return last?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] ?? last
    }
    if (host === 'disneyplus.com' || host === 'tv.apple.com') return parts[2]
    if (host === 'peacocktv.com') return parts.at(-1)
    if (host === 'paramountplus.com') return parts[1]
  } catch {}
  return undefined
}

const extractCrunchyrollEpisodeId = (url: string): string | undefined => {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname.replace('www.', '') !== 'crunchyroll.com') return undefined
    const parts = pathname.split('/').filter(Boolean)
    return parts[0] === 'watch' ? parts[1] : undefined
  } catch {}
  return undefined
}

const jwFetch = async <T>(query: string, variables: Record<string, unknown>, ctx: ExtractorServerContext): Promise<T> => {
  const res = await ctx.fetch(JW_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: '*/*'
    },
    body: JSON.stringify({ query, variables })
  })
  return res.json() as T
}

const SEARCH_QUERY = `
  query GetSearchTitles($searchTitlesFilter: TitleFilter!, $country: Country!, $language: Language!, $first: Int!) {
    popularTitles(country: $country, filter: $searchTitlesFilter, first: $first, sortBy: POPULAR, sortRandomSeed: 0) {
      edges {
        node {
          id
          objectId
          objectType
          content(country: $country, language: $language) {
            title
            fullPath
            originalReleaseYear
            shortDescription
            posterUrl(profile: S718, format: JPG)
            externalIds {
              imdbId
            }
            genres {
              shortName
            }
          }
          offers(country: $country, platform: WEB, filter: { bestOnly: true }) {
            monetizationType
            presentationType
            standardWebURL
            package {
              id
              packageId
              clearName
              technicalName
              shortName
              icon(profile: S100)
            }
          }
          ... on Show {
            seasons(sortDirection: ASC) {
              objectId
              totalEpisodeCount
              content(country: $country, language: $language) {
                seasonNumber
                isReleased
              }
            }
          }
        }
      }
    }
  }
`

const NODE_QUERY = `
  query GetTitleNode($nodeId: ID!, $language: Language!, $country: Country!) {
    node(id: $nodeId) {
      ... on MovieOrShow {
        id
        objectId
        objectType
        content(country: $country, language: $language) {
          title
          fullPath
          originalReleaseYear
          shortDescription
          posterUrl(profile: S718, format: JPG)
          externalIds {
            imdbId
          }
          genres {
            shortName
          }
        }
        offers(country: $country, platform: WEB, filter: { bestOnly: true }) {
          monetizationType
          presentationType
          standardWebURL
          package {
            id
            packageId
            clearName
            technicalName
            shortName
            icon(profile: S100)
          }
        }
        ... on Show {
          totalSeasonCount
          seasons(sortDirection: ASC) {
            id
            objectId
            totalEpisodeCount
            content(country: $country, language: $language) {
              title
              seasonNumber
              fullPath
              posterUrl
              originalReleaseYear
              isReleased
            }
            episodes(limit: 50) {
              id
              objectId
              content(country: $country, language: $language) {
                title
                episodeNumber
                seasonNumber
                isReleased
                shortDescription
                runtime
              }
              flatrate: offers(
                country: $country, platform: WEB,
                filter: { monetizationTypes: [FLATRATE_AND_BUY, FLATRATE, ADS, FREE], bestOnly: true }
              ) {
                package {
                  clearName
                  packageId
                  shortName
                }
              }
            }
          }
        }
      }
    }
  }
`

const _inflight = new Map<string, Promise<unknown>>()

const deduplicatedFetch = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const existing = _inflight.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn()
  _inflight.set(key, promise)
  promise.finally(() => _inflight.delete(key))
  return promise
}

const searchTitles = (query: string, ctx: ExtractorServerContext) =>
  deduplicatedFetch(`search:${query}`, () =>
    jwFetch<JWSearchResponse>(SEARCH_QUERY, {
      first: 10, searchTitlesFilter: { searchQuery: query }, language: LANGUAGE, country: COUNTRY
    }, ctx)
  )

const getNodeDetails = (nodeId: string, ctx: ExtractorServerContext) =>
  deduplicatedFetch(`node:${nodeId}`, () =>
    jwFetch<JWNodeResponse>(NODE_QUERY, { nodeId, language: LANGUAGE, country: COUNTRY }, ctx)
  )

interface JWOffer {
  monetizationType: string
  standardWebURL: string | null
  package: { clearName: string, shortName: string }
}

interface JWSearchNode {
  id: string
  objectId: number
  objectType?: string
  content: { title: string, fullPath: string, posterUrl: string | null, shortDescription: string | null, originalReleaseYear?: number | null }
  offers: JWOffer[]
  /** present on a Show; the search query asks for it so a result can be expanded per season */
  seasons?: JWSeason[]
}

interface JWSeason {
  /** JustWatch's own id for the season, which is what a media uri is scoped by */
  objectId: number
  totalEpisodeCount: number
  content: { seasonNumber: number, isReleased: boolean }
  episodes: JWEpisode[]
}

interface JWEpisode {
  objectId: number
  content: { title: string, episodeNumber: number, seasonNumber: number, isReleased: boolean, shortDescription: string | null, runtime: number | null }
}

interface JWShowNode extends JWSearchNode { seasons: JWSeason[] }
interface JWSearchResponse { data: { popularTitles: { edges: { node: JWSearchNode }[] } } }
interface JWNodeResponse { data: { node: JWShowNode } }

const resolveImageUrl = (url: string | null | undefined) =>
  url ? (url.startsWith('http') ? url : `${JW_IMAGE_BASE}${url}`) : undefined

// shared with tmdb, which has the same show-vs-season problem: see ../season.ts
const findMatchingSeason = (seasons: JWSeason[], targetCount: number): number | undefined =>
  pickSeasonByEpisodeCount(
    seasons.map(season => ({ seasonNumber: season.content.seasonNumber, episodeCount: season.totalEpisodeCount })),
    targetCount
  )

const buildOffersAsHandles = async (
  offers: JWOffer[],
  meta: { shortDescription?: string | null, title?: string, posterUrl?: string, seasonNumber?: number },
  ctx: ExtractorServerContext
): Promise<GQLMedia[]> => {
  const seen = new Set<string>()
  const handles: GQLMedia[] = []

  for (const offer of offers) {
    if (!['FLATRATE', 'FLATRATE_AND_BUY', 'FREE', 'ADS'].includes(offer.monetizationType)) continue
    const shortName = offer.package.shortName
    if (seen.has(shortName)) continue
    seen.add(shortName)

    const mappedOrigin = PACKAGE_ORIGIN_MAP[shortName]
    if (!mappedOrigin) continue

    const realUrl = offer.standardWebURL ? extractRealUrl(offer.standardWebURL) : undefined
    const url = realUrl ?? offer.standardWebURL ?? undefined

    let contentId: string | undefined
    const rawContentId = url ? extractContentId(url) : undefined

    if (!rawContentId && mappedOrigin === 'cr' && url) {
      const episodeId = extractCrunchyrollEpisodeId(url)
      if (episodeId) {
        const resolved = await resolveEpisodeToSeriesId(episodeId, ctx)
        if (resolved) contentId = crunchyrollId(resolved.seriesId, resolved.seasonId)
      }
    } else if (rawContentId) {
      // a provider's series url names the SHOW, so without the season that id spans every season and clustering unions them
      contentId = providerContentId(mappedOrigin, rawContentId, meta.seasonNumber)
    }

    if (!contentId) continue

    handles.push(
      makeMedia({
        origin: mappedOrigin,
        id: contentId,
        url
      })
    )
  }

  return handles
}

const normalizeMedia = async (
  node: JWSearchNode,
  opts: { seasons?: JWSeason[], seasonNumber?: number },
  ctx: ExtractorServerContext
): Promise<GQLMedia | null> => {
  // refusing to build the media is the point: the bare node id is shared by every season of the show and merges them
  if (opts.seasonNumber == null && showRequiresSeason(node.objectType)) return null
  // the uri is scoped by the season's OWN id; the number is what the episode lists are keyed on
  const season = (opts.seasons ?? []).find(entry => entry.content.seasonNumber === opts.seasonNumber)
  if (opts.seasonNumber != null && season?.objectId == null) return null
  const id = opts.seasonNumber == null ? String(node.objectId) : jwId(node.objectId, season!.objectId)
  const { shortDescription } = node.content

  const title = opts.seasonNumber != null && !node.content.title.match(/season\s+\d+/i)
    ? `${node.content.title} Season ${opts.seasonNumber}`
    : node.content.title

  const filteredSeasons = opts.seasonNumber != null
    ? (opts.seasons ?? []).filter(s => s.content.seasonNumber === opts.seasonNumber)
    : opts.seasons ?? []

  const episodes: GQLEpisode[] = filteredSeasons.flatMap(season =>
    (season.episodes ?? [])
      .filter(ep => ep.content.isReleased)
      .map(ep => normalizeEpisode(ep, toUri({ origin, id })))
  )

  const media = makeMedia({
    origin,
    id,
    categories: [node.objectType === 'MOVIE' ? 'MOVIE' : 'SERIES'],
    url: `https://www.justwatch.com${node.content.fullPath}`,
    score: SCORE,
    handles:
      await buildOffersAsHandles(
        node.offers ?? [],
        {
          shortDescription,
          title,
          posterUrl: resolveImageUrl(node.content.posterUrl),
          seasonNumber: opts.seasonNumber
        },
        ctx
      ),
    episodes,
    // the search query carries totalEpisodeCount but not the episodes themselves, so an expanded
    // season still reports how long it is - which is also what season matching elsewhere keys on
    episodeCount: episodes.length || filteredSeasons.reduce((total, season) => total + (season.totalEpisodeCount ?? 0), 0) || undefined,
    startDate: node.content.originalReleaseYear ? `${node.content.originalReleaseYear}-01-01` : undefined
  })

  // JustWatch keeps title and description on the per provider offer handles, not on the media itself
  if (isMovie(media)) {
    media.episodes = [makeMovieEpisode(media, {
      score: SCORE,
      titles: [{ language: 'en', title, score: SCORE }],
      ...desc(shortDescription, SCORE)
    })]
    media.episodeCount = 1
  }

  return media
}

const normalizeEpisode = (ep: JWEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: String(ep.objectId),
    mediaUri,
    score: SCORE,
    titles: [{ language: 'en', title: ep.content.title, score: SCORE }],
    ...desc(ep.content.shortDescription, SCORE),
    seasonNumber: ep.content.seasonNumber,
    episodeNumber: ep.content.episodeNumber,
    runtime: ep.content.runtime ?? undefined
  })

const resolveSeasonNumber = async (uri: string, node: JWShowNode, ctx: ExtractorServerContext) => {
  if (!node.seasons?.length) return undefined
  if (node.seasons.length === 1) return node.seasons[0]!.content.seasonNumber
  return waitForMedia(uri, ctx, m => {
    const title = getFirstTitle(m)
    if (title) { const n = parseSeasonNumber(title); if (n) return n }
    const epCount = m?.episodeCount ?? m?.episodes?.length
    return epCount ? findMatchingSeason(node.seasons, epCount) : undefined
  })
}

const TITLE_MATCH_THRESHOLD = 0.5

const searchAndLinkMedia = async (title: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const searchRes = await searchTitles(query, ctx)
    const results = searchRes.data?.popularTitles?.edges ?? []
    if (!results.length) continue

    const detailRes = await getNodeDetails(results[0]!.node.id, ctx)
    const node = detailRes.data?.node
    if (!node?.content?.title) continue

    const similarity = await titleSimilarity(title, node.content.title)
    if (similarity < TITLE_MATCH_THRESHOLD) continue

    let seasonNumber: number | undefined
    if (node.seasons?.length === 1) seasonNumber = node.seasons[0]!.content.seasonNumber
    else if (node.seasons?.length > 1) {
      seasonNumber = parseSeasonNumber(title)
      if (!seasonNumber) {
        const epCount = await waitForMedia(aggregatedUri, ctx, m => m?.episodeCount ?? m?.episodes?.length)
        if (epCount) seasonNumber = findMatchingSeason(node.seasons, epCount)
      }
    }

    const media = await normalizeMedia(node, { seasons: node.seasons, seasonNumber }, ctx)
    if (!media) continue
    mergeHandles(media, aggregatedUri)
    return media
  }
  return null
}

const resolveMedia = async (uri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const jwUri = extractAggregatedUriOrigin(uri, origin)
  if (jwUri) {
    const { objectId, seasonObjectId } = splitJwId(jwUri.id)
    const detailRes = await getNodeDetails(`ts${objectId}`, ctx)
    const node = detailRes.data?.node
    if (!node) return null
    // the uri pins a season by ITS id, so the number the episode lists use is looked up, not assumed
    const pinned = seasonObjectId != null
      ? node.seasons?.find(season => season.objectId === seasonObjectId)?.content.seasonNumber
      : undefined
    const seasonNumber = pinned ?? (isAggregatedUri(uri) ? await resolveSeasonNumber(uri, node, ctx) : undefined)
    const media = await normalizeMedia(node, { seasons: node.seasons, seasonNumber }, ctx)
    if (!media) return null
    if (isAggregatedUri(uri)) mergeHandles(media, uri)
    return media
  }
  if (!isAggregatedUri(uri)) return null
  const title = await waitForMedia(uri, ctx, m => getFirstTitle(m), 30_000)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx)
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }
        yield { media: await resolveMedia(_uri, ctx) }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) return yield { mediaPage: { nodes: [] } }
        const searchRes = await searchTitles(search, ctx)
        // the search query does not fetch seasons, so normalizeMedia declines every series result and only movies come through
        const nodes = await Promise.all(
          (searchRes.data?.popularTitles?.edges ?? []).map(e => normalizeMedia(e.node, {}, ctx))
        )
        yield { mediaPage: { nodes: nodes.filter((media): media is GQLMedia => media !== null) } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      if (isMovie(parent)) return [makeMovieEpisode(parent, { score: SCORE })]
      const { objectId, seasonObjectId } = splitJwId(parent.id)
      const detailRes = await getNodeDetails(`ts${objectId}`, ctx)
      const node = detailRes.data?.node
      if (!node?.seasons) return []
      const pinned = seasonObjectId != null
        ? node.seasons.find(season => season.objectId === seasonObjectId)?.content.seasonNumber
        : undefined
      const seasonNumber = pinned ?? (parent.titles?.[0]?.title ? parseSeasonNumber(parent.titles[0].title) : undefined)
      const seasons = seasonNumber != null
        ? node.seasons.filter(s => s.content.seasonNumber === seasonNumber)
        : node.seasons
      return seasons.flatMap(s =>
        (s.episodes ?? []).filter(ep => ep.content.isReleased).map(ep => normalizeEpisode(ep, parent.uri))
      )
    }
  }
}
