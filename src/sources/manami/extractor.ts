import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

import { fromAggregatedUri, fromUri, isAggregatedUri, isUri } from '../../utils/uri'
import { makeMedia } from '../utils'
import { animeSeasonOf } from '../season'
import { origin as sourceOrigin, SCORE, seasonKey, seasonPage, type ManamiRecord } from './normalize'
import {
  INDEXED_ORIGINS,
  readIndex,
  rowId,
  type CatalogIndex,
  type CatalogRow,
  type IndexBundle,
  type IndexedOrigin,
} from './index-lookup'

export const icon = 'https://github.com/manami-project.png'
export const originUrl = 'https://github.com/manami-project/anime-offline-database'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'manami'
export const origin = sourceOrigin
export const official = false
export const metadataOnly = true
export const isApiOnly = true
// Answers about other catalogues' uris, not only its own, which is the anizip pattern. Note this
// export is declarative only: nothing in the worker reads it, so what actually decides is the
// resolver below.
export const supportedUris = ['manami', ...INDEXED_ORIGINS]
export const color = '#2b6cb0'

type SeasonBundle = { tag: string, updated: string, seasons: Record<string, ManamiRecord[]> }

/**
 * The one source in stub that answers without touching the network.
 *
 * Everything else reaches an upstream API or scrapes a page, so all of it fails together the moment
 * those are unreachable. That is not hypothetical: on 2026-08-16 the homepage rendered "Current
 * season" with zero media because AniList answered 403 and Jikan 504 at the same time, with the
 * user's connection perfectly healthy.
 *
 * Note what it is NOT. stub has no service worker and no Cache Storage, so it has no offline mode,
 * and these bundles arrive over the same network as every other chunk. This survives an UPSTREAM
 * outage, not a disconnected user.
 *
 * TWO bundles, loaded independently, because they are wanted at different moments. The homepage
 * needs seasons and never the index; opening one show needs the index and never the seasons. Split
 * this way a visitor who only browses the season row never fetches the 114 KB id table.
 */
let seasons: Promise<SeasonBundle> | undefined
let index: Promise<CatalogIndex> | undefined

/**
 * Each loaded through a dynamic import, and memoized.
 *
 * The import has to sit somewhere genuinely reachable. Exporting a loader that nothing calls gets
 * the chunk tree-shaken away by rolldown, silently, leaving a source that always answers empty.
 * Keeping the call inside a resolver path is what makes it reachable.
 *
 * A failure resolves to an empty bundle rather than rejecting. This is the fallback source, so it
 * is the one thing that must not be able to make the page worse by failing.
 */
const loadSeasons = (): Promise<SeasonBundle> =>
  (seasons ??= import('../../generated/anime-seasons')
    .then(module => module.default as SeasonBundle)
    .catch(error => {
      console.error('manami: the bundled season data could not be loaded', error)
      return { tag: 'unavailable', updated: '', seasons: {} }
    }))

const loadIndex = (): Promise<CatalogIndex> =>
  (index ??= import('../../generated/anime-index')
    .then(module => readIndex(module.default as IndexBundle))
    .catch(error => {
      console.error('manami: the bundled id index could not be loaded', error)
      return readIndex({ mal: [], anilist: [], kitsu: [], anidb: [] })
    }))

/**
 * The current season, read from the bundle rather than requested.
 *
 * Keyed on the season the CLOCK is in, matched against `animeSeason` in the data, and deliberately
 * not on manami's own `status`, which is a snapshot from the dump's cut date and decays within
 * weeks of being written.
 */
const getSeasonNow = async (): Promise<GQLMedia[]> => {
  const data = await loadSeasons()
  const key = seasonKey(animeSeasonOf())
  const records = data.seasons[key]
  if (!records) {
    console.warn(`manami: no bundled data for ${key}, the dump (${data.tag}) predates it. Rebuild to refresh.`)
    return []
  }
  return seasonPage(records)
}

/** Every (origin, id) pair named by a uri, whether it is a single uri or an aggregated one. */
const urisOf = (uri: string): { origin: string, id: string }[] => {
  if (isAggregatedUri(uri)) return fromAggregatedUri(uri)?.handleUrisValues ?? []
  if (isUri(uri)) {
    const parsed = fromUri(uri)
    return parsed ? [parsed] : []
  }
  return []
}

/**
 * A media that renders nothing and exists only to be merged.
 *
 * This is the whole point of shipping the index. The record carries no title, no cover and no
 * description, so it cannot win a field in `aggregateMedia` and cannot show up as a card. What it
 * does carry is one handle per catalogue, and `db.ts` turns every handle into a
 * `graph.link(mediaUri, handleUri, MEDIA_SAME_AS)`. So a record that knows only a MyAnimeList id
 * and one that knows only an AniList id land in the same union-find component through this, instead
 * of being guessed at by comparing their titles.
 *
 * Same shape as anizip, which also answers about other catalogues' uris, with even less payload.
 *
 * No categories are claimed either. A format claim would be a second assertion this row has no
 * evidence for, and `aggregateMedia` enforces one format per media, so the safe thing to say is
 * nothing.
 */
const handleCarrier = (row: CatalogRow): GQLMedia | undefined => {
  const id = rowId(row)
  if (!id) return undefined

  const handles: GQLMedia[] = []
  if (row.mal) handles.push(makeMedia({ origin: 'mal', id: String(row.mal), url: `https://myanimelist.net/anime/${row.mal}` }))
  if (row.anilist) handles.push(makeMedia({ origin: 'anilist', id: String(row.anilist), url: `https://anilist.co/anime/${row.anilist}` }))
  if (row.kitsu) handles.push(makeMedia({ origin: 'kitsu', id: String(row.kitsu), url: `https://kitsu.app/anime/${row.kitsu}` }))
  if (row.anidb) handles.push(makeMedia({ origin: 'anidb', id: String(row.anidb), url: `https://anidb.net/anime/${row.anidb}` }))

  // A single handle links nothing to anything, so the record would be an orphan node carrying no
  // information. Only rows that actually bridge two catalogues are worth returning.
  if (handles.length < 2) return undefined

  return makeMedia({ origin, id, handles, score: SCORE })
}

/** The seasonal record for an id, which carries a title and a cover the index row does not. */
const seasonalById = async (id: string): Promise<GQLMedia | undefined> => {
  const data = await loadSeasons()
  for (const records of Object.values(data.seasons)) {
    const media = seasonPage(records).find(candidate => candidate.id === id)
    if (media) return media
  }
  return undefined
}

/**
 * Whatever this source knows about a uri, richest first.
 *
 * The seasonal half and the index half deliberately use the same id scheme, so a show in the
 * current season resolves to one node supplied twice rather than two nodes needing a merge. The
 * seasonal record is preferred when both exist, because it carries a title and a cover.
 */
const getMedia = async (uri: string): Promise<GQLMedia | null> => {
  const uris = urisOf(uri)
  if (!uris.length) return null

  const own = uris.find(candidate => candidate.origin === origin)
  if (own) return (await seasonalById(own.id)) ?? null

  const table = await loadIndex()
  for (const candidate of uris) {
    if (!INDEXED_ORIGINS.includes(candidate.origin as IndexedOrigin)) continue
    const id = Number(candidate.id)
    if (!Number.isInteger(id) || id <= 0) continue
    const row = table.lookup(candidate.origin as IndexedOrigin, id)
    if (!row) continue
    const carrier = handleCarrier(row)
    if (!carrier) continue
    return (await seasonalById(carrier.id)) ?? carrier
  }
  return null
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      // Always yield exactly once. A subscription generator that completes without yielding makes
      // yoga answer 204 No Content, which is not the same thing as "this source knows nothing".
      subscribe: async function* (_, { input: { uri } }, __: ExtractorServerContext) {
        if (!uri) return yield { media: null }
        yield { media: await getMedia(uri) }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { status } }, __: ExtractorServerContext) {
        // Search is deliberately unanswered. The seasonal bundle holds only a window of recent
        // seasons, so it would return a handful of hits for a query the live sources answer
        // properly, and every hit carries no synopsis. A partial catalogue is worse than none in a
        // ranked result set.
        if (status !== 'RELEASING') return yield { mediaPage: { nodes: [] } }
        yield { mediaPage: { nodes: await getSeasonNow() } }
      }
    }
  }
}
