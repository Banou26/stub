import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia, Episode as GQLEpisode } from '../../generated/schema/types.generated'
import { extractAggregatedUriOrigin, isAggregatedUri, isUri, toUri } from '../../utils/uri'
import { resolveEpisodeToSeriesId, crunchyrollId } from '../crunchyroll/extractor'
import { makeMedia, makeEpisode, desc, img, getFirstTitle, simplifyTitle, mergeHandles, waitForMedia } from '../utils'

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

const PACKAGE_ORIGIN_MAP: Record<string, string> = {
  cru: 'cr', nfx: 'nf', dnp: 'disney', amp: 'amazon', atp: 'appletv',
  hlu: 'hulu', hbm: 'hbo', pcp: 'peacock', pmp: 'paramount', fuv: 'fubo'
}

// URL extraction

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

// API

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

// Types

interface JWOffer {
  monetizationType: string
  standardWebURL: string | null
  package: { clearName: string, shortName: string }
}

interface JWSearchNode {
  id: string
  objectId: number
  content: { title: string, fullPath: string, posterUrl: string | null, shortDescription: string | null }
  offers: JWOffer[]
}

interface JWSeason {
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

// Helpers

const resolveImageUrl = (url: string | null | undefined) =>
  url ? (url.startsWith('http') ? url : `${JW_IMAGE_BASE}${url}`) : undefined

const parseSeasonNumber = (title: string) => {
  const m = title.match(/\b(?:Season|Part|Cour)\s+(\d+)\b/i)
  return m ? Number(m[1]) : undefined
}

const findMatchingSeason = (seasons: JWSeason[], targetCount: number): number | undefined => {
  if (seasons.length <= 1) return undefined
  let best: { num: number, diff: number } | undefined
  for (const s of seasons) {
    const diff = Math.abs(s.totalEpisodeCount - targetCount)
    if (!best || diff < best.diff) best = { num: s.content.seasonNumber, diff }
  }
  return best?.num
}

// Handle building from offers

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
      contentId = (mappedOrigin === 'nf' && meta.seasonNumber != null)
        ? `${rawContentId}-${meta.seasonNumber}`
        : rawContentId
    }

    if (!contentId) continue

    handles.push(makeMedia({
      origin: mappedOrigin,
      id: contentId,
      url,
      titles: [
        ...meta.title ? [{ language: 'en', title: meta.title }] : [],
        { language: 'en', title: offer.package.clearName }
      ],
      ...desc(meta.shortDescription),
      covers: img(meta.posterUrl)
    }))
  }

  return handles
}

// Normalization

const normalizeMedia = async (
  node: JWSearchNode,
  opts: { seasons?: JWSeason[], seasonNumber?: number },
  ctx: ExtractorServerContext
): Promise<GQLMedia> => {
  const id = String(node.objectId)
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

  return makeMedia({
    origin,
    id,
    url: `https://www.justwatch.com${node.content.fullPath}`,
    handles: await buildOffersAsHandles(node.offers ?? [], {
      shortDescription, title, posterUrl: resolveImageUrl(node.content.posterUrl), seasonNumber: opts.seasonNumber
    }, ctx),
    titles: [{ language: 'en', title }],
    ...desc(shortDescription),
    covers: img(resolveImageUrl(node.content.posterUrl)),
    episodes,
    episodeCount: episodes.length || undefined
  })
}

const normalizeEpisode = (ep: JWEpisode, mediaUri: string): GQLEpisode =>
  makeEpisode({
    origin,
    id: String(ep.objectId),
    mediaUri,
    titles: [{ language: 'en', title: ep.content.title }],
    ...desc(ep.content.shortDescription),
    seasonNumber: ep.content.seasonNumber,
    episodeNumber: ep.content.episodeNumber,
    runtime: ep.content.runtime ?? undefined
  })

// Season resolution

const resolveSeasonNumber = async (uri: string, node: JWShowNode, ctx: ExtractorServerContext) => {
  if (!node.seasons || node.seasons.length <= 1) return undefined
  return waitForMedia(uri, ctx, m => {
    const title = getFirstTitle(m)
    if (title) { const n = parseSeasonNumber(title); if (n) return n }
    const epCount = m?.episodeCount ?? m?.episodes?.length
    return epCount ? findMatchingSeason(node.seasons, epCount) : undefined
  })
}

// Core resolution

const searchAndLinkMedia = async (title: string, aggregatedUri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  for (const query of [title, ...simplifyTitle(title)]) {
    const searchRes = await searchTitles(query, ctx)
    const results = searchRes.data?.popularTitles?.edges ?? []
    if (!results.length) continue

    const detailRes = await getNodeDetails(results[0]!.node.id, ctx)
    const node = detailRes.data?.node
    if (!node) continue

    let seasonNumber: number | undefined
    if (node.seasons?.length > 1) {
      seasonNumber = parseSeasonNumber(title)
      if (!seasonNumber) {
        const epCount = await waitForMedia(aggregatedUri, ctx, m => m?.episodeCount ?? m?.episodes?.length)
        if (epCount) seasonNumber = findMatchingSeason(node.seasons, epCount)
      }
    }

    const media = await normalizeMedia(node, { seasons: node.seasons, seasonNumber }, ctx)
    mergeHandles(media, aggregatedUri)
    return media
  }
  return null
}

const resolveMedia = async (uri: string, ctx: ExtractorServerContext): Promise<GQLMedia | null> => {
  const jwUri = extractAggregatedUriOrigin(uri, origin)
  if (jwUri) {
    const detailRes = await getNodeDetails(`ts${jwUri.id}`, ctx)
    const node = detailRes.data?.node
    if (!node) return null
    const seasonNumber = isAggregatedUri(uri) ? await resolveSeasonNumber(uri, node, ctx) : undefined
    const media = await normalizeMedia(node, { seasons: node.seasons, seasonNumber }, ctx)
    if (isAggregatedUri(uri)) mergeHandles(media, uri)
    return media
  }
  if (!isAggregatedUri(uri)) return null
  const title = await waitForMedia(uri, ctx, m => getFirstTitle(m), 30_000)
  if (!title) return null
  return searchAndLinkMedia(title, uri, ctx)
}

// Resolvers

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
        const nodes = await Promise.all(
          (searchRes.data?.popularTitles?.edges ?? []).map(e => normalizeMedia(e.node, {}, ctx))
        )
        yield { mediaPage: { nodes } }
      }
    }
  },
  Media: {
    episodes: async (parent, _, ctx: ExtractorServerContext) => {
      if (parent.origin !== origin) return parent.episodes ?? []
      if (parent.episodes?.length) return parent.episodes
      const detailRes = await getNodeDetails(`ts${parent.id}`, ctx)
      const node = detailRes.data?.node
      if (!node?.seasons) return []
      const seasonNumber = parent.titles?.[0]?.title ? parseSeasonNumber(parent.titles[0].title) : undefined
      const seasons = seasonNumber != null
        ? node.seasons.filter(s => s.content.seasonNumber === seasonNumber)
        : node.seasons
      return seasons.flatMap(s =>
        (s.episodes ?? []).filter(ep => ep.content.isReleased).map(ep => normalizeEpisode(ep, parent.uri))
      )
    }
  }
}
