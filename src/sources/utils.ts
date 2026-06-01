import type { ExtractorServerContext } from '../worker/extractor'
import type { Media as GQLMedia, Episode as GQLEpisode } from '../generated/schema/types.generated'

import { swAlign } from 'seal-wasm'
import { fromAggregatedUri, toUri } from '../utils/uri'

export const makeMedia = ({ origin, id, ...fields }: { origin: string, id: string } & Partial<GQLMedia>): GQLMedia => ({
  _id: crypto.randomUUID(),
  uri: toUri({ origin, id }),
  origin,
  id,
  url: undefined,
  handles: [],
  categories: [],
  titles: [],
  descriptions: [],
  shortDescriptions: [],
  covers: [],
  banners: [],
  episodes: [],
  trailers: [],
  ...fields
})

export const makeEpisode = ({ origin, id, mediaUri, ...fields }: { origin: string, id: string, mediaUri: string } & Partial<GQLEpisode>): GQLEpisode => ({
  _id: crypto.randomUUID(),
  uri: toUri({ origin, id }),
  origin,
  id,
  url: undefined,
  mediaUri,
  handles: [],
  titles: [],
  descriptions: [],
  shortDescriptions: [],
  thumbnails: [],
  ...fields
})

export const desc = (description?: string | null, score?: number) =>
  description
    ? {
      descriptions: [{
        language: 'en',
        description: description,
        score
      }],
      shortDescriptions: [{
        language: 'en',
        shortDescription: description,
        score
      }]
    }
    : {}

export const img = (url?: string | null, score?: number) =>
  url
    ? [{ url, score }]
    : []

export const getFirstTitle = (media: { titles?: { title: string }[] } | undefined) =>
  media?.titles?.[0]?.title

export const titleSimilarity = async (a: string, b: string): Promise<number> => {
  const normalA = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const normalB = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  if (!normalA || !normalB) return 0
  const result = await swAlign(normalA, normalB, {
    alignment: 'local',
    equal: 2,
    align: -1,
    insert: -1,
    delete: -1,
  })
  const maxLen = Math.max(normalA.length, normalB.length)
  return result.score / (maxLen * 2) // normalize to 0-1
}

// Search-relevance: how much of `query` is found in `title` (local alignment normalized by
// the QUERY length, so a real match where the query appears in a long title still scores ~1,
// unlike titleSimilarity which normalizes by the longer string).
export const searchScore = async (query: string, title: string): Promise<number> => {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const t = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  if (!q || !t) return 0
  const result = await swAlign(q, t, { alignment: 'local', equal: 2, align: -1, insert: -1, delete: -1 })
  return Math.min(1, result.score / (q.length * 2))
}

// Max search-relevance of `query` across all of a media's titles (en/romaji/native/...).
export const searchRelevance = async (query: string, titles: string[]): Promise<number> =>
  titles.length ? Math.max(...await Promise.all(titles.map(title => searchScore(query, title)))) : 0

export const simplifyTitle = (title: string): string[] => {
  const queries: string[] = []
  const stripped = title.replace(/\s+(Season|Part|Cour)\s+\d+$/i, '').trim()
  if (stripped !== title) queries.push(stripped)
  const colonIdx = title.indexOf(':')
  if (colonIdx > 2) queries.push(title.slice(0, colonIdx).trim())
  return queries
}

export const buildHandlesFromUri = (aggregatedUri: string, excludeOrigin: string): GQLMedia[] => {
  const parsed = fromAggregatedUri(aggregatedUri as Parameters<typeof fromAggregatedUri>[0])
  if (!parsed) return []
  return parsed.handleUrisValues
    .filter(({ origin }) => origin !== excludeOrigin)
    .map(({ origin, id }) => makeMedia({ origin, id }))
}

export const mergeHandles = (media: GQLMedia, aggregatedUri: string) => {
  const extra = buildHandlesFromUri(aggregatedUri, media.origin)
  const existing = new Set(media.handles.map(h => h.origin))
  media.handles = [...media.handles, ...extra.filter(h => !existing.has(h.origin))]
}

export const waitForMedia = async <T>(
  uri: string,
  ctx: ExtractorServerContext,
  extract: (media: any) => T | undefined,
  timeoutMs = 15_000
): Promise<T | undefined> => {
  const result = extract(await ctx.findAggregatedMedia(uri))
  if (result) return result
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), timeoutMs)
  try {
    for await (const _ of ctx.listenForMediaChanges({ uri }, { abortSignal: ac.signal })) {
      const r = extract(await ctx.findAggregatedMedia(uri))
      if (r) return r
    }
  } finally {
    clearTimeout(timeout)
    ac.abort()
  }
  return undefined
}
