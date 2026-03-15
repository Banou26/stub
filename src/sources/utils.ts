import type { ExtractorServerContext } from '../worker/extractor'
import type { Media as GQLMedia, Episode as GQLEpisode } from '../generated/schema/types.generated'
import { fromAggregatedUri, toUri } from '../utils/uri'

export const makeMedia = ({ origin, id, ...fields }: { origin: string, id: string } & Partial<GQLMedia>): GQLMedia => ({
  _id: crypto.randomUUID(),
  uri: toUri({ origin, id }),
  origin,
  id,
  url: undefined,
  handles: [],
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

export const desc = (d?: string | null) => d
  ? { descriptions: [{ language: 'en', description: d }], shortDescriptions: [{ language: 'en', shortDescription: d }] }
  : {}

export const img = (url?: string | null) => url ? [{ url }] : []

export const getFirstTitle = (media: { titles?: { title: string }[] } | undefined) =>
  media?.titles?.[0]?.title

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
    for await (const _ of ctx.listenForMediaChanges({ abort: ac.signal })) {
      const r = extract(await ctx.findAggregatedMedia(uri))
      if (r) return r
    }
  } finally {
    clearTimeout(timeout)
    ac.abort()
  }
  return undefined
}
