import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, fromAggregatedUri, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { resolveEpisodeToSeriesId, crunchyrollId } from '../crunchyroll/extractor'

export const icon = 'https://www.justwatch.com/appasset/img/favicon/favicon-32x32.png'
export const originUrl = 'https://www.justwatch.com'
export const categories = ['ANIME'] as const
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

// Map JustWatch package shortNames to our origin IDs
const PACKAGE_ORIGIN_MAP: Record<string, string> = {
  cru: 'cr',
  nfx: 'nf',
  dnp: 'disney',
  amp: 'amazon',
  atp: 'appletv',
  hlu: 'hulu',
  hbm: 'hbo',
  pcp: 'peacock',
  pmp: 'paramount',
  fuv: 'fubo'
}

// Extract real URL from JustWatch affiliate links
// e.g. "https://crunchyroll.pxf.io/xk92Nv?u=https%3A%2F%2Fwww.crunchyroll.com%2Fwatch%2F..." → "https://www.crunchyroll.com/watch/..."
const extractRealUrl = (affiliateUrl: string): string | undefined => {
  try {
    const url = new URL(affiliateUrl)
    const realUrl = url.searchParams.get('u') ?? url.searchParams.get('r')
    if (realUrl) return realUrl
  } catch {}
  return undefined
}

// Extract a content-specific ID from a streaming service URL
// Without this, we'd use packageId (e.g. nf:8 for ALL Netflix content) which creates false groupings
const extractContentId = (url: string): string | undefined => {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace('www.', '')
    const pathParts = pathname.split('/').filter(Boolean)

    // netflix.com/title/81684733
    if (host === 'netflix.com') return pathParts[1]
    // crunchyroll.com/series/GG5H5XQX4/... — only extract from /series/ URLs, not /watch/ (episode) URLs
    if (host === 'crunchyroll.com' && pathParts[0] === 'series') return pathParts[1]
    // amazon.com/gp/video/detail/ID or /dp/ID
    if (host.startsWith('amazon.')) return pathParts.at(-1)
    // hulu.com/series/slug-{uuid} or /watch/id
    if (host === 'hulu.com') {
      const last = pathParts.at(-1)
      const uuidMatch = last?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
      return uuidMatch?.[1] ?? last
    }
    // disneyplus.com/series/name/id
    if (host === 'disneyplus.com') return pathParts[2]
    // tv.apple.com/show/name/id
    if (host === 'tv.apple.com') return pathParts[2]
    // peacocktv.com/watch-online/.../id
    if (host === 'peacocktv.com') return pathParts.at(-1)
    // paramountplus.com/shows/slug/
    if (host === 'paramountplus.com') return pathParts[1]
  } catch {}
  return undefined
}

// Extract episode ID from a Crunchyroll /watch/ URL
const extractCrunchyrollEpisodeId = (url: string): string | undefined => {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace('www.', '')
    if (host !== 'crunchyroll.com') return undefined
    const pathParts = pathname.split('/').filter(Boolean)
    if (pathParts[0] === 'watch') return pathParts[1]
  } catch {}
  return undefined
}

// Build media handles from JustWatch offers
const buildOffersAsHandles = async (offers: JWOffer[], { shortDescription, title, posterUrl, seasonNumber }: { shortDescription?: string | null, title?: string, posterUrl?: string, seasonNumber?: number }, ctx: ExtractorServerContext): Promise<GQLMedia[]> => {
  // Deduplicate by package shortName (pick first, which is typically best quality)
  const seen = new Set<string>()
  const handles: GQLMedia[] = []

  for (const offer of offers) {
    if (offer.monetizationType !== 'FLATRATE' && offer.monetizationType !== 'FLATRATE_AND_BUY' && offer.monetizationType !== 'FREE' && offer.monetizationType !== 'ADS') continue

    const shortName = offer.package.shortName
    if (seen.has(shortName)) continue
    seen.add(shortName)

    const mappedOrigin = PACKAGE_ORIGIN_MAP[shortName]
    if (!mappedOrigin) continue

    const realUrl = offer.standardWebURL ? extractRealUrl(offer.standardWebURL) : undefined
    const url = realUrl ?? offer.standardWebURL ?? undefined

    // Extract content-specific ID from the URL — skip if we can only get a package ID
    // Package IDs (e.g. nf:8) are shared across ALL content on that platform
    let contentId: string | undefined
    const rawContentId = url ? extractContentId(url) : undefined

    if (!rawContentId && mappedOrigin === 'cr' && url) {
      // CR watch URLs have episode IDs — resolve to series ID via CR API
      const episodeId = extractCrunchyrollEpisodeId(url)
      if (episodeId) {
        const resolved = await resolveEpisodeToSeriesId(episodeId, ctx)
        if (resolved) {
          contentId = crunchyrollId(resolved.seriesId, resolved.seasonId)
        }
      }
    } else if (rawContentId) {
      contentId = (mappedOrigin === 'nf' && seasonNumber != null)
        ? `${rawContentId}-${seasonNumber}`
        : rawContentId
    }

    if (!contentId) continue

    handles.push({
      _id: crypto.randomUUID(),
      uri: toUri({ origin: mappedOrigin, id: contentId }),
      origin: mappedOrigin,
      id: contentId,
      url,
      handles: [],
      titles: [
        ...title ? [{ language: 'en', title }] : [],
        { language: 'en', title: offer.package.clearName }
      ],
      descriptions: shortDescription ? [{ language: 'en', description: shortDescription }] : [],
      shortDescriptions: shortDescription ? [{ language: 'en', shortDescription }] : [],
      covers: posterUrl ? [{ url: posterUrl }] : [],
      banners: [],
      episodes: [],
      trailers: []
    } satisfies GQLMedia)
  }

  return handles
}

// Types
interface JWSearchNode {
  id: string
  objectId: number
  objectType: string
  content: {
    title: string
    fullPath: string
    originalReleaseYear: number
    posterUrl: string | null
    shortDescription: string | null
    externalIds: {
      imdbId: string | null
    }
    genres: { shortName: string }[]
  }
  offers: JWOffer[]
}

interface JWOffer {
  id: string
  monetizationType: string
  presentationType: string
  standardWebURL: string | null
  package: {
    id: string
    packageId: number
    clearName: string
    technicalName: string
    shortName: string
    icon: string | null
  }
}

interface JWSeason {
  id: string
  objectId: number
  objectType: string
  totalEpisodeCount: number
  content: {
    title: string
    seasonNumber: number
    fullPath: string
    posterUrl: string | null
    originalReleaseYear: number
    isReleased: boolean
  }
  episodes: JWEpisode[]
}

interface JWEpisode {
  id: string
  objectId: number
  content: {
    title: string
    episodeNumber: number
    seasonNumber: number
    isReleased: boolean
    shortDescription: string | null
    runtime: number | null
  }
  flatrate: { package: { clearName: string, packageId: number, shortName: string } }[]
}

interface JWShowNode extends JWSearchNode {
  totalSeasonCount: number
  seasons: JWSeason[]
}

interface JWSearchResponse {
  data: {
    popularTitles: {
      edges: { node: JWSearchNode }[]
    }
  }
}

interface JWNodeResponse {
  data: {
    node: JWShowNode
  }
}

// API helpers
const jwFetch = async <T>(query: string, variables: Record<string, unknown>, ctx: ExtractorServerContext): Promise<T> => {
  const response = await ctx.fetch(JW_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': '*/*'
    },
    body: JSON.stringify({ query, variables })
  })
  return await response.json() as T
}

const SEARCH_QUERY = `
  query GetSearchTitles(
    $searchTitlesFilter: TitleFilter!
    $country: Country!
    $language: Language!
    $first: Int!
  ) {
    popularTitles(
      country: $country
      filter: $searchTitlesFilter
      first: $first
      sortBy: POPULAR
      sortRandomSeed: 0
    ) {
      edges {
        node {
          id
          objectId
          objectType
          content(country: $country, language: $language) {
            title
            fullPath
            originalReleaseYear
            posterUrl(profile: S718, format: JPG)
            shortDescription
            externalIds {
              imdbId
            }
            genres {
              shortName
            }
          }
          offers(country: $country, platform: WEB, filter: { bestOnly: true }) {
            id
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
        }
      }
    }
  }
`

const NODE_QUERY = `
  query GetTitleNode(
    $nodeId: ID!
    $language: Language!
    $country: Country!
  ) {
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
          id
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
            objectType
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
                country: $country
                platform: WEB
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

// Deduplicate concurrent requests
const _inflightRequests = new Map<string, Promise<unknown>>()

const deduplicatedFetch = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const existing = _inflightRequests.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn()
  _inflightRequests.set(key, promise)
  promise.finally(() => _inflightRequests.delete(key))
  return promise
}

// API functions
const searchTitles = (query: string, ctx: ExtractorServerContext) =>
  deduplicatedFetch(`search:${query}`, () =>
    jwFetch<JWSearchResponse>(SEARCH_QUERY, {
      first: 10,
      searchTitlesFilter: { searchQuery: query },
      language: LANGUAGE,
      country: COUNTRY
    }, ctx)
  )

const getNodeDetails = (nodeId: string, ctx: ExtractorServerContext) =>
  deduplicatedFetch(`node:${nodeId}`, () =>
    jwFetch<JWNodeResponse>(NODE_QUERY, {
      nodeId,
      language: LANGUAGE,
      country: COUNTRY
    }, ctx)
  )

// Image URL helpers
const resolveImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined
  if (url.startsWith('http')) return url
  return `${JW_IMAGE_BASE}${url}`
}

// Normalization
const normalizeSearchResult = async (node: JWSearchNode, ctx: ExtractorServerContext): Promise<GQLMedia> => {
  const id = String(node.objectId)
  const uri = toUri({ origin, id })
  const posterUrl = resolveImageUrl(node.content.posterUrl)

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id,
    url: `https://www.justwatch.com${node.content.fullPath}`,
    handles: await buildOffersAsHandles(node.offers ?? [], {
      shortDescription: node.content.shortDescription,
      title: node.content.title,
      posterUrl: resolveImageUrl(node.content.posterUrl)
    }, ctx),
    titles: [{ language: 'en', title: node.content.title }],
    descriptions: node.content.shortDescription
      ? [{ language: 'en', description: node.content.shortDescription }]
      : [],
    shortDescriptions: node.content.shortDescription
      ? [{ language: 'en', shortDescription: node.content.shortDescription }]
      : [],
    covers: posterUrl ? [{ url: posterUrl }] : [],
    banners: [],
    episodes: [],
    trailers: []
  } satisfies GQLMedia
}

const normalizeShowNode = async (node: JWShowNode, seasonNumber: number | undefined, ctx: ExtractorServerContext): Promise<GQLMedia> => {
  const id = String(node.objectId)
  const uri = toUri({ origin, id })
  const posterUrl = resolveImageUrl(node.content.posterUrl)
  const title = seasonNumber != null && !node.content.title.match(/season\s+\d+/i)
    ? `${node.content.title} Season ${seasonNumber}`
    : node.content.title

  const filteredSeasons = seasonNumber != null
    ? node.seasons?.filter(s => s.content.seasonNumber === seasonNumber) ?? []
    : node.seasons ?? []

  const episodes: GQLEpisode[] = filteredSeasons.flatMap(season =>
    (season.episodes ?? [])
      .filter(ep => ep.content.isReleased)
      .map(ep => normalizeEpisode(ep, uri))
  )

  return {
    _id: crypto.randomUUID(),
    uri,
    origin,
    id,
    url: `https://www.justwatch.com${node.content.fullPath}`,
    handles: await buildOffersAsHandles(node.offers ?? [], {
        shortDescription: node.content.shortDescription,
        title,
        posterUrl: resolveImageUrl(node.content.posterUrl),
        seasonNumber
      }, ctx),
    titles: [{ language: 'en', title }],
    descriptions: node.content.shortDescription
      ? [{ language: 'en', description: node.content.shortDescription }]
      : [],
    shortDescriptions: node.content.shortDescription
      ? [{ language: 'en', shortDescription: node.content.shortDescription }]
      : [],
    covers: posterUrl ? [{ url: posterUrl }] : [],
    banners: [],
    episodes,
    episodeCount: episodes.length,
    trailers: []
  } satisfies GQLMedia
}

const normalizeEpisode = (ep: JWEpisode, mediaUri: string): GQLEpisode => {
  const id = String(ep.objectId)
  return {
    _id: crypto.randomUUID(),
    uri: toUri({ origin, id }),
    origin,
    id,
    url: undefined,
    mediaUri,
    handles: [],
    titles: [{ language: 'en', title: ep.content.title }],
    descriptions: ep.content.shortDescription
      ? [{ language: 'en', description: ep.content.shortDescription }]
      : [],
    shortDescriptions: ep.content.shortDescription
      ? [{ language: 'en', shortDescription: ep.content.shortDescription }]
      : [],
    thumbnails: [],
    seasonNumber: ep.content.seasonNumber,
    episodeNumber: ep.content.episodeNumber,
    runtime: ep.content.runtime ?? undefined
  } satisfies GQLEpisode
}

// Build handles from aggregated URI so JustWatch result links to existing group
const buildHandlesFromAggregatedUri = (aggregatedUri: string): GQLMedia[] => {
  const parsed = fromAggregatedUri(aggregatedUri as Parameters<typeof fromAggregatedUri>[0])
  if (!parsed) return []
  return parsed.handleUrisValues
    .filter(({ origin: handleOrigin }) => handleOrigin !== origin)
    .map(({ origin: handleOrigin, id }) => ({
      _id: crypto.randomUUID(),
      uri: toUri({ origin: handleOrigin, id }),
      origin: handleOrigin,
      id,
      url: undefined,
      handles: [],
      titles: [],
      descriptions: [],
      shortDescriptions: [],
      covers: [],
      banners: [],
      episodes: [],
      trailers: []
    } satisfies GQLMedia))
}

// Find best matching season based on episode count
const findMatchingSeason = (
  seasons: JWSeason[],
  targetEpisodeCount: number
): number | undefined => {
  if (seasons.length <= 1) return undefined
  let bestMatch: JWSeason | undefined
  let bestDiff = Infinity
  for (const season of seasons) {
    const diff = Math.abs(season.totalEpisodeCount - targetEpisodeCount)
    if (diff < bestDiff) {
      bestDiff = diff
      bestMatch = season
    }
  }
  return bestMatch?.content.seasonNumber
}

// Parse season number from a title like "Frieren: Beyond Journey's End Season 2" → 2
const parseSeasonNumber = (title: string): number | undefined => {
  const match = title.match(/\b(?:Season|Part|Cour)\s+(\d+)\b/i)
  return match ? Number(match[1]) : undefined
}

// Title simplification for search
const simplifyTitle = (title: string): string[] => {
  const queries: string[] = []
  const stripped = title.replace(/\s+(Season|Part|Cour)\s+\d+$/i, '').trim()
  if (stripped !== title) queries.push(stripped)
  const colonIdx = title.indexOf(':')
  if (colonIdx > 2) queries.push(title.slice(0, colonIdx).trim())
  return queries
}

// Wait for other extractors to populate episode data
const waitForEpisodeCount = async (
  aggregatedUri: string,
  ctx: ExtractorServerContext
): Promise<number | undefined> => {
  const existing = await ctx.findAggregatedMedia(aggregatedUri)
  const count = existing?.episodeCount ?? existing?.episodes?.length
  if (count) return count

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 15_000)
  const changes = ctx.listenForMediaChanges({ abort: abortController.signal })
  try {
    for await (const _ of changes) {
      const updated = await ctx.findAggregatedMedia(aggregatedUri)
      const epCount = updated?.episodeCount ?? updated?.episodes?.length
      if (epCount) return epCount
    }
  } finally {
    clearTimeout(timeout)
    abortController.abort()
  }
  return undefined
}

const getFirstTitle = (media: { titles?: { title: string }[] } | undefined): string | undefined =>
  media?.titles?.[0]?.title

// Try to determine season number from aggregated media data (title or episode count)
const tryResolveSeasonFromMedia = (
  existing: { titles?: { title: string }[], episodeCount?: number | null, episodes?: unknown[] } | undefined,
  seasons: JWSeason[]
): number | undefined => {
  const title = getFirstTitle(existing)
  if (title) {
    const fromTitle = parseSeasonNumber(title)
    if (fromTitle) return fromTitle
  }
  const targetEpCount = existing?.episodeCount ?? existing?.episodes?.length
  if (targetEpCount) return findMatchingSeason(seasons, targetEpCount)
  return undefined
}

// Determine the season number from existing aggregated media context,
// waiting for other extractors to populate data if needed
const resolveSeasonNumber = async (
  aggregatedUri: string,
  node: JWShowNode,
  ctx: ExtractorServerContext
): Promise<number | undefined> => {
  if (!node.seasons || node.seasons.length <= 1) return undefined

  // Try immediately
  const existing = await ctx.findAggregatedMedia(aggregatedUri)
  const immediate = tryResolveSeasonFromMedia(existing, node.seasons)
  if (immediate) return immediate

  // Wait for other extractors to populate title or episode count
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 15_000)
  const changes = ctx.listenForMediaChanges({ abort: abortController.signal })
  try {
    for await (const _ of changes) {
      const updated = await ctx.findAggregatedMedia(aggregatedUri)
      const result = tryResolveSeasonFromMedia(updated, node.seasons)
      if (result) return result
    }
  } finally {
    clearTimeout(timeout)
    abortController.abort()
  }
  return undefined
}

const searchAndLinkMedia = async (
  title: string,
  aggregatedUri: string,
  ctx: ExtractorServerContext
): Promise<GQLMedia | null> => {
  const queries = [title, ...simplifyTitle(title)]
  for (const query of queries) {
    const searchRes = await searchTitles(query, ctx)
    const results = searchRes.data?.popularTitles?.edges ?? []
    if (!results.length) continue

    const firstResult = results[0]!.node
    // Get full details with seasons/episodes
    const detailRes = await getNodeDetails(firstResult.id, ctx)
    const node = detailRes.data?.node
    if (!node) continue

    // Determine matching season — try title first, then episode count
    let seasonNumber: number | undefined
    if (node.seasons?.length > 1) {
      seasonNumber = parseSeasonNumber(title)
      if (!seasonNumber) {
        const targetEpCount = await waitForEpisodeCount(aggregatedUri, ctx)
        if (targetEpCount) {
          seasonNumber = findMatchingSeason(node.seasons, targetEpCount)
        }
      }
    }

    const media = await normalizeShowNode(node, seasonNumber, ctx)
    const aggregatedHandles = buildHandlesFromAggregatedUri(aggregatedUri)
    const existingOrigins = new Set(media.handles.map(h => h.origin))
    media.handles = [...media.handles, ...aggregatedHandles.filter(h => !existingOrigins.has(h.origin))]
    return media
  }
  return null
}

// Resolvers
export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri: _uri } }, ctx: ExtractorServerContext) {
        if (!_uri || !(isUri(_uri) || isAggregatedUri(_uri))) return yield { media: null }

        // Direct jw: URI — fetch by JustWatch node ID
        const uri = extractAggregatedUriOrigin(_uri, origin)
        if (uri) {
          // JustWatch IDs are objectId numbers, node IDs are like "ts364792"
          const nodeId = `ts${uri.id}`
          const detailRes = await getNodeDetails(nodeId, ctx)
          const node = detailRes.data?.node
          if (!node) {
            yield { media: null }
            return
          }
          // Determine season from aggregated media context (title or episode count)
          const seasonNumber = isAggregatedUri(_uri)
            ? await resolveSeasonNumber(_uri, node, ctx)
            : undefined
          const media = await normalizeShowNode(node, seasonNumber, ctx)
          if (isAggregatedUri(_uri)) {
            const aggregatedHandles = buildHandlesFromAggregatedUri(_uri)
            const existingOrigins = new Set(media.handles.map(h => h.origin))
            media.handles = [...media.handles, ...aggregatedHandles.filter(h => !existingOrigins.has(h.origin))]
          }
          yield { media }
          return
        }

        // Aggregated URI without jw: origin — search by title
        if (!isAggregatedUri(_uri)) return yield { media: null }

        const existing = await ctx.findAggregatedMedia(_uri)
        const existingTitle = getFirstTitle(existing)

        if (existingTitle) {
          const result = await searchAndLinkMedia(existingTitle, _uri, ctx)
          yield { media: result }
          return
        }

        // Wait for other extractors to populate the title
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 30_000)
        const changes = ctx.listenForMediaChanges({ abort: abortController.signal })
        try {
          for await (const _ of changes) {
            const updated = await ctx.findAggregatedMedia(_uri)
            const title = getFirstTitle(updated)
            if (!title) continue
            const result = await searchAndLinkMedia(title, _uri, ctx)
            yield { media: result }
            return
          }
        } finally {
          clearTimeout(timeout)
          abortController.abort()
        }

        yield { media: null }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { search } }, ctx: ExtractorServerContext) {
        if (!search) {
          yield { mediaPage: { nodes: [] } }
          return
        }
        const searchRes = await searchTitles(search, ctx)
        const nodes = await Promise.all((searchRes.data?.popularTitles?.edges ?? []).map(e => normalizeSearchResult(e.node, ctx)))
        yield { mediaPage: { nodes } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes

      const nodeId = `ts${parent.id}`
      const detailRes = await getNodeDetails(nodeId, ctx)
      const node = detailRes.data?.node
      if (!node?.seasons) return []

      // Determine season from existing episodes' seasonNumber, or from the aggregated media title
      const existingSeasonNumber = parent.episodes?.find(ep => ep.seasonNumber != null)?.seasonNumber
        ?? (parent.titles?.[0]?.title ? parseSeasonNumber(parent.titles[0].title) : undefined)
      const seasons = existingSeasonNumber != null
        ? node.seasons.filter(s => s.content.seasonNumber === existingSeasonNumber)
        : node.seasons

      return seasons.flatMap(season =>
        (season.episodes ?? [])
          .filter(ep => ep.content.isReleased)
          .map(ep => normalizeEpisode(ep, parent.uri))
      )
    }
  }
}