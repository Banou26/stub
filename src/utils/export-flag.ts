import { isSeedAssetUrl } from '../sources/offline/seed'

export const EXPORT_PARAM = 'export'
export const EXPORT_VALUE = 'store'

/**
 * Whether this url asks for the store export hook. Exactly `?export=store`, never mere presence, so a
 * stray `?export=1` in a shared link cannot attach anything. Never throws: an unparseable url reads
 * false. `base` resolves a relative url, the same way `readPluginUris` takes one.
 */
export const readExportFlag = (url: string, base?: string): boolean => {
  try {
    return new URL(url, base).searchParams.getAll(EXPORT_PARAM).includes(EXPORT_VALUE)
  } catch {
    return false
  }
}

export const NO_SEED_PARAM = 'seed'
export const NO_SEED_VALUE = 'off'

/**
 * Whether this url asks the offline source's SEEDED half to stay off, exactly `?seed=off`.
 *
 * Read per request rather than once, so a client-side navigation that keeps the query keeps the
 * answer. Never throws: an unparseable url reads false, which leaves the seed on.
 */
export const readNoSeedFlag = (url: string, base?: string): boolean => {
  try {
    return new URL(url, base).searchParams.getAll(NO_SEED_PARAM).includes(NO_SEED_VALUE)
  } catch {
    return false
  }
}

const requestUrlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/**
 * Whether the page must refuse a worker fetch of the published season seed.
 *
 * A walk drives the app with `?seed=off` so it never reads its own previous output. Without that a
 * seeded id is stored, joins the cluster's aggregated uri, and the next live source to read that uri
 * re-asserts SAME_AS across the whole membership (`mergeHandles` in sources/utils.ts), so the next
 * export publishes the id as though a source had checked it, permanently and with no inverse.
 *
 * It lives on the PAGE because a worker cannot see the page's url and an announcement over the port
 * would race the first resolver, and because the page already owns every byte the worker fetches.
 */
export const refusesSeedAsset = (pageUrl: string, request: RequestInfo | URL): boolean =>
  readNoSeedFlag(pageUrl) && isSeedAssetUrl(requestUrlOf(request))
