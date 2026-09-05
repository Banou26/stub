// Reading the season seed at runtime and minting it as rows. Kept out of the extractor so it can be
// tested: the extractor pulls in the generated data modules, and this half is what the seed's whole
// safety argument rests on, so it has to be drivable against the real store.
//
// Everything here is minted at the offline SCORE (0.2, see ./normalize.ts) and every handle node
// carries identity and NOTHING else, which is what makes a live row win every merge in either arrival
// order: a row that writes no field cannot take one. Read the two docblocks below before adding a
// field to either.

import type { ExtractorServerContext } from '../../worker/extractor'
import type { Episode as GQLEpisode, Media as GQLMedia, MediaHandle as GQLMediaHandle } from '../../generated/schema/types.generated'
import type { SeedEpisode, SeedEpisodes, SeedHandle, SeedIndex, SeedRun } from './seed'

import { makeEpisode, makeMedia, sameAs } from '../utils'
import { SEED_EPISODES_ASSET, SEED_INDEX_ASSET, seedAssetUrl } from './seed'
import { isSeedEpisodes, isSeedIndex } from './seed-gate'
import { SCORE, origin } from './normalize'

type Fetch = ExtractorServerContext['fetch']

/**
 * A race, never an `AbortSignal` in the init: `ctx.fetch` crosses an osra port to the relay and a
 * signal is not structured-cloneable, which is why no source in the tree passes one. On expiry the
 * loader answers undefined and the abandoned request is ignored.
 */
const SEED_INDEX_TIMEOUT_MS = 10_000
const SEED_EPISODES_TIMEOUT_MS = 15_000

/**
 * gzip at rest, decoded here.
 *
 * From an ArrayBuffer rather than the response's `body`, because `ctx.fetch` crosses an osra port and
 * a live stream is not something to assume on the other side of it. The plain-text fallback covers
 * the other direction: a layer that DID decompress in transit leaves `DecompressionStream` throwing
 * on plain JSON.
 */
const decompress = async (response: Response): Promise<string> => {
  const bytes = await response.arrayBuffer()
  try {
    const body = new Response(bytes).body
    if (!body) throw new Error('the response carried no body to decompress')
    return await new Response(body.pipeThrough(new DecompressionStream('gzip'))).text()
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

const readAsset = async (fetch: Fetch, asset: string): Promise<unknown> => {
  const response = await fetch(seedAssetUrl(asset))
  if (!response.ok) throw new Error(`${asset} answered ${response.status}`)
  return JSON.parse(await decompress(response))
}

const withBudget = async <T>(work: Promise<T>, budgetMs: number, what: string): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), budgetMs) })
  try {
    return await Promise.race([work, budget])
  } catch (error) {
    console.warn(`offline: ${what} could not be read, the bundled data still answers`, error)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

let indexOnce: Promise<SeedIndex | undefined> | undefined
let episodesOnce: Promise<SeedEpisodes | undefined> | undefined

/**
 * The seed index, fetched once per worker session.
 *
 * Promises exactly one thing: it never rejects and never makes the page worse. A timeout, a 404, a
 * body that is not gzip, and a payload the gate refuses all resolve to undefined, logged once, and
 * the bundled half of this source keeps answering what it answers today.
 */
export const loadSeedIndex = (fetch: Fetch): Promise<SeedIndex | undefined> =>
  (indexOnce ??= withBudget(readAsset(fetch, SEED_INDEX_ASSET), SEED_INDEX_TIMEOUT_MS, SEED_INDEX_ASSET)
    .then(value => {
      if (value === undefined) return undefined
      if (isSeedIndex(value)) return value
      console.warn(`offline: ${SEED_INDEX_ASSET} is not a seed index, the bundled data still answers`)
      return undefined
    }))

/**
 * The seed's episode rows, fetched once per worker session, and only for THIS index.
 *
 * `--clobber` on the release is not atomic, so a new episodes file can sit beside an old index. The
 * validation refuses that pairing on `generatedAt` and `commit`, and the index stays in use with no
 * episodes rather than the wrong ones.
 */
export const loadSeedEpisodes = (fetch: Fetch, index: SeedIndex): Promise<SeedEpisodes | undefined> =>
  (episodesOnce ??= withBudget(readAsset(fetch, SEED_EPISODES_ASSET), SEED_EPISODES_TIMEOUT_MS, SEED_EPISODES_ASSET)
    .then(value => {
      if (value === undefined) return undefined
      if (isSeedEpisodes(value, index)) return value
      console.warn(`offline: ${SEED_EPISODES_ASSET} does not belong to this index, the index still answers`)
      return undefined
    }))

/** TESTS ONLY: drops the memoized fetches, which are a module singleton like the store. */
export const resetSeedCache = () => {
  indexOnce = undefined
  episodesOnce = undefined
}

// Built per index and cached on it, because `seedRunFor` runs once per media ask and the index holds
// hundreds of runs.
const runsByUri = new WeakMap<SeedIndex, Map<string, SeedRun>>()

const uriTable = (index: SeedIndex): Map<string, SeedRun> => {
  const cached = runsByUri.get(index)
  if (cached) return cached
  const table = new Map<string, SeedRun>()
  for (const run of index.runs) {
    // the borrowed id too: once this source contributes, `offline:<key>` is in every aggregated uri
    // the cluster is asked about, exactly as ./index-lookup.ts describes
    table.set(`${origin}:${run.key}`, run)
    for (const handle of run.identity) table.set(handle.uri, run)
  }
  runsByUri.set(index, table)
  return table
}

/** The seeded run a uri names, by any identity member or by the borrowed `offline:<key>` id. */
export const seedRunFor = (index: SeedIndex, uris: readonly { origin: string, id: string }[]): SeedRun | undefined => {
  const table = uriTable(index)
  for (const uri of uris) {
    const run = table.get(`${uri.origin}:${uri.id}`)
    if (run) return run
  }
  return undefined
}

/**
 * Identity and nothing else, which makes every seeded handle a PLACEHOLDER.
 *
 * Deliberate, and the whole reason the seed cannot damage a store. A placeholder is not stored
 * (`IDENTITY_FIELDS` in store/db.ts), so its claim waits under `pendingClaims` and lands the moment
 * the owning source describes that uri. Three things follow: the seed can win no field in either
 * arrival order, because it writes no field; a url minted here would be the one scalar it could
 * write, and scalars are last-write-wins, so a walk up to a day old would overwrite the live url; and
 * a seeded id no live source knows never enters the cluster at all, so it never reaches an aggregated
 * uri for the next source to re-assert SAME_AS across.
 */
const handleNode = (handle: SeedHandle): GQLMedia =>
  makeMedia({ origin: handle.origin, id: handle.id })

/**
 * A container claim that does NOT stamp the scope, which is why `partOf` from ../utils is not used
 * here: that helper copies the node scoped CONTAINER, the store keeps CONTAINER for good once any row
 * carries it, and a stamped row is stored, so the seed would re-assert it on every load and re-export
 * it on every walk with nothing able to recover a wrong one. As a placeholder the claim waits for the
 * owning source to say what the id is, and the store derives the same PART_OF edge from the scopes it
 * is then told.
 */
const containerHandle = (handle: SeedHandle): GQLMediaHandle =>
  ({ node: handleNode(handle), relation: 'PART_OF' })

/**
 * One seeded episode under the run's own offline uri.
 *
 * Never minted under another origin's uri: a wrong number or a wrong id there lands in the wrong
 * row silently. `Media.episodes` groups by `episodeNumber` alone, so this merges with the live
 * episode of the same number and loses every field to it on score.
 */
const seedEpisodeRow = (run: SeedRun, episode: SeedEpisode): GQLEpisode =>
  makeEpisode({
    origin,
    id: `${run.key}-${episode.number}`,
    mediaUri: `${origin}:${run.key}`,
    url: episode.urls[0]?.url,
    score: SCORE,
    episodeNumber: episode.number,
    titles: episode.titles.map(({ language, title }) => ({ language, title, score: SCORE })),
    thumbnails: episode.thumbnails.map(({ url, language }) => ({ url, language, score: SCORE })),
    releaseDate: episode.releaseDate,
    seasonNumber: episode.seasonNumber,
    absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
    runtime: episode.runtime,
  })

/**
 * One seeded run as a media: static metadata at the offline score, one handle per identity member, one
 * PART_OF handle per container, and episodes only when the episodes file has been read.
 *
 * It carries exactly what the bundled half carries and no more. `status`, `startDate`, `endDate` and
 * `popularity` are absent for the reason ./normalize.ts withholds them from the bundle, plus one this
 * half adds: several live sources score exactly this SCORE, `aggregateMedia` breaks a tie by arrival
 * order, and the seed exists to arrive first. A seeded `startDate` also opens justwatch's evidence
 * gate, which refuses to link a search hit without one.
 */
export const seedMedia = (run: SeedRun, episodes?: readonly SeedEpisode[]): GQLMedia =>
  makeMedia({
    origin,
    id: run.key,
    score: SCORE,
    handles: [
      ...run.identity.map(handle => sameAs(handleNode(handle))),
      ...run.containers.map(containerHandle),
    ],
    titles: run.titles.map(({ language, title }) => ({ language, title, score: SCORE })),
    covers: run.covers.map(({ url, language }) => ({ url, language, score: SCORE })),
    banners: run.banners.map(({ url, language }) => ({ url, language, score: SCORE })),
    type: run.type,
    categories: run.categories,
    episodeCount: run.episodeCount,
    averageScore: run.averageScore,
    popularity: run.popularity,
    isAdult: run.isAdult,
    episodes: (episodes ?? []).map(episode => seedEpisodeRow(run, episode)),
  })

/** The current season's runs as listing rows: metadata and handles, deliberately no episodes. */
export const seedSeasonPage = (index: SeedIndex, seasonKey: string): GQLMedia[] => {
  const byKey = new Map(index.runs.map(run => [run.key, run]))
  return (index.seasons[seasonKey] ?? [])
    .map(key => byKey.get(key))
    .filter((run): run is SeedRun => Boolean(run))
    .map(run => seedMedia(run))
}
