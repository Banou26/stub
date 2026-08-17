import type { ExtractorServerContext } from '../../worker/extractor'
import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

import { extractAggregatedUriOrigin, isAggregatedUri, isUri } from '../../utils/uri'
import { animeSeasonOf } from '../season'
import { origin as sourceOrigin, seasonKey, seasonPage, type ManamiRecord } from './normalize'

export const icon = 'https://github.com/manami-project.png'
export const originUrl = 'https://github.com/manami-project/anime-offline-database'
export const categories = ['ANIME', 'SERIES', 'MOVIE'] as const
export const name = 'manami'
export const origin = sourceOrigin
export const official = false
export const metadataOnly = true
export const isApiOnly = true
export const supportedUris = ['manami']
export const color = '#2b6cb0'

type Bundle = {
  tag: string
  updated: string
  seasons: Record<string, ManamiRecord[]>
}

/**
 * The one source in stub that answers without touching the network.
 *
 * Everything else here reaches an upstream API or scrapes a page, so all of it fails together the
 * moment those are unreachable. That is not hypothetical: on 2026-08-16 the homepage rendered
 * "Current season" with zero media because AniList was answering 403 and Jikan 504 at the same
 * time, with the user's own connection perfectly healthy. This source exists to put a floor under
 * that case.
 *
 * Note what it is NOT. stub has no service worker and no Cache Storage, so it has no offline mode,
 * and this bundle arrives over the same network as every other chunk. It survives an UPSTREAM
 * outage, not a disconnected user.
 */
let bundle: Promise<Bundle> | undefined

/**
 * Loaded through a dynamic import, and memoized, so the roughly 25 KB of season data is a separate
 * content-hashed chunk that is absent from the initial bundle and fetched at most once.
 *
 * The import has to sit somewhere genuinely reachable. Exporting a loader that nothing calls gets
 * the whole chunk tree-shaken away by rolldown, silently, leaving a source that always answers
 * empty. Keeping the call inside the resolver is what makes it reachable.
 *
 * A failure resolves to an empty bundle rather than rejecting: this is the fallback source, so it
 * has to be the one thing that cannot make the page worse by failing.
 */
const load = (): Promise<Bundle> =>
  (bundle ??= import('../../generated/anime-seasons')
    .then(module => module.default as Bundle)
    .catch(error => {
      console.error('manami: the bundled season data could not be loaded', error)
      return { tag: 'unavailable', updated: '', seasons: {} }
    }))

/**
 * The current season, read from the bundle rather than requested.
 *
 * Keyed on the season the CLOCK is in, matched against `animeSeason` in the data. It is deliberately
 * not keyed on manami's own `status` field, which is a snapshot from when the dump was cut and
 * decays within weeks of being written.
 *
 * A miss is normal and must stay quiet in the console but visible in the logs: the build carries a
 * window of seasons around the dump's cut date, so a season falls off the end only if the app has
 * not been rebuilt in about a year.
 */
const getSeasonNow = async (): Promise<GQLMedia[]> => {
  const data = await load()
  const key = seasonKey(animeSeasonOf())
  const records = data.seasons[key]
  if (!records) {
    console.warn(`manami: no bundled data for ${key}, the dump (${data.tag}) predates it. Rebuild to refresh.`)
    return []
  }
  return seasonPage(records)
}

const getMedia = async (id: string): Promise<GQLMedia | undefined> => {
  const data = await load()
  for (const records of Object.values(data.seasons)) {
    const media = seasonPage(records).find(candidate => candidate.id === id)
    if (media) return media
  }
  return undefined
}

export const resolvers: Resolvers = {
  Subscription: {
    media: {
      subscribe: async function* (_, { input: { uri } }, __: ExtractorServerContext) {
        if (!uri || !(isUri(uri) || isAggregatedUri(uri))) return yield { media: null }
        const manamiUri = extractAggregatedUriOrigin(uri, origin)
        yield { media: manamiUri ? (await getMedia(manamiUri.id)) ?? null : null }
      }
    },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* (_, { input: { status } }, __: ExtractorServerContext) {
        // Search is deliberately not answered. The bundle holds only a window of recent seasons, so
        // it would return a handful of hits for a query the live sources answer properly, and every
        // one of those hits carries no synopsis. A partial catalogue is worse than none in a ranked
        // result set.
        if (status !== 'RELEASING') return yield { mediaPage: { nodes: [] } }
        yield { mediaPage: { nodes: await getSeasonNow() } }
      }
    }
  }
}
