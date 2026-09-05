// The season seed's shape and constants, shared by the exporter (node, through type stripping), the
// gate and the runtime loader. Only `import type` from elsewhere, and erasable syntax throughout: no
// enum, no namespace, no parameter properties, because node has to load this file directly. Every
// mirror below is pinned by tests/unit/sources/offline/seed.test.ts against the module it mirrors.
import type { MediaScope, MediaType, MediaCategory } from '../../worker/store/types'

export const SEED_VERSION = 1 as const
export const SEED_REPO = 'Banou26/stub'
export const SEED_RELEASE_TAG = 'season-seed'
export const SEED_INDEX_ASSET = 'season-seed.json.gz'
export const SEED_EPISODES_ASSET = 'season-seed-episodes.json.gz'
export const SEED_MANIFEST_ASSET = 'season-seed.manifest.json'

/** The plain download url: unauthenticated, no api.github.com budget, two 302 hops to a signed url. */
export const seedAssetUrl = (asset: string): string =>
  `https://github.com/${SEED_REPO}/releases/download/${SEED_RELEASE_TAG}/${asset}`

/**
 * Whether a url names one of THIS seed's release assets.
 *
 * The walk's page refuses these (see `refusesSeedAsset` in utils/export-flag.ts), because a walk that
 * reads its own previous output publishes it again: a seeded id is stored, enters the cluster's
 * aggregated uri, and the next live source that reads that uri re-asserts SAME_AS across it, so the
 * next export carries the id as though a source had checked it.
 */
export const isSeedAssetUrl = (url: string): boolean => url.startsWith(seedAssetUrl(''))

export const SEED_SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'] as const
export const SEED_KEY_ORIGINS = ['mal', 'anilist', 'kitsu'] as const
export const SEED_STREAMING_ORIGINS = ['cr', 'nf', 'jw'] as const

export const SEED_SEASON_KEY = /^\d{4}-(WINTER|SPRING|SUMMER|FALL)$/
export const SEED_RUN_KEY = /^(mal|anilist|kitsu)-\d+$/
export const SEED_ORIGIN = /^[a-z0-9]+$/
/** mirrors UNROUTABLE_IN_ID in utils/uri.ts; pinned equal by a test */
export const SEED_UNROUTABLE_ID = /[,/()]/
export const SEED_URL = /^https?:\/\//
export const SEED_COMMIT = /^[0-9a-f]{7,40}$/

/**
 * ONE title a run, which is exactly what the bundle contributes.
 *
 * The fuzzy merge compares clusters on a six-slot title profile filled by score, alphabetically
 * inside a tier. Six seeded titles at the offline SCORE of 0.2 fill that profile outright and evict
 * both the bundle's title and a live 0.2 source's, across the whole current-season listing at the
 * moment the store is thinnest. ./normalize.ts names that mechanism as the cause of a 68-show weld,
 * and is why the bundle ships one title. The seed ships one for the same reason.
 */
export const SEED_TITLES_PER_RUN = 1
export const SEED_COVERS_PER_RUN = 3
export const SEED_BANNERS_PER_RUN = 2
export const SEED_EPISODES_PER_RUN = 60
export const SEED_TITLES_PER_EPISODE = 2
export const SEED_THUMBNAILS_PER_EPISODE = 1
export const SEED_URLS_PER_EPISODE = 2

// mirrors of src/worker/store/types.ts, pinned equal by tests/unit/sources/offline/seed.test.ts
export const SEED_MEDIA_TYPES = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export const SEED_MEDIA_CATEGORIES = ['ANIME', 'SERIES', 'MOVIE'] as const
export const SEED_SCOPES = ['RUN', 'CONTAINER'] as const

export type SeedScope = MediaScope

/**
 * Identity and scope, and NO url.
 *
 * A url is the one scalar a handle node could carry, and a stored row's scalars are last-write-wins,
 * so a seeded node landing after the live one would overwrite the live url with a walk up to a day
 * old. Without it the node is a placeholder: not stored, its claim waits under `pendingClaims`, and it
 * lands the moment the owning source describes that uri, which is also what keeps a seeded id no live
 * source knows out of the cluster and out of the next walk's export.
 */
export type SeedHandle = { uri: string, origin: string, id: string, scope: SeedScope }
export type SeedTitle = { language: string, title: string }
export type SeedImage = { url: string, language: string | null }
export type SeedLink = { origin: string, url: string }

/**
 * One run's identity and its STATIC metadata.
 *
 * Deliberately absent, and it is the same list ./normalize.ts withholds from the bundle plus the
 * reason that list is not optional here: `status`, `startDate`, `endDate` and `popularity`. Every
 * seeded field is minted at the offline SCORE of 0.2, and justwatch, appletv, paramount and unogs
 * score exactly 0.2 too, so at a tie the seed wins on arrival order and the seed exists to arrive
 * first. A seeded `startDate` also OPENS justwatch's evidence gate (it refuses to link without a
 * date), so a walk up to a day old would supply both axes of a permanent SAME_AS before any live
 * source has answered.
 */
export type SeedRun = {
  /** `mal-59193`, from `runKeyOf` over the identity uris */
  key: string
  /** the season key it was walked under, null when it arrived as a side effect */
  season: string | null
  /** every asserted SAME_AS member, scope RUN, never the `offline` origin, sorted by uri */
  identity: SeedHandle[]
  /** asserted PART_OF targets and CONTAINER-scoped members, scope CONTAINER, sorted by uri */
  containers: SeedHandle[]
  /** deduped by title text, highest source score first, capped at SEED_TITLES_PER_RUN */
  titles: SeedTitle[]
  covers: SeedImage[]
  banners: SeedImage[]
  type: MediaType | null
  /** ANIME plus at most one of MOVIE/SERIES */
  categories: MediaCategory[]
  episodeCount: number | null
  averageScore: number | null
  isAdult: boolean | null
}

export type SeedEpisode = {
  number: number
  titles: SeedTitle[]
  thumbnails: SeedImage[]
  /** one per origin, best score first */
  urls: SeedLink[]
  releaseDate: string | null
  seasonNumber: number | null
  absoluteEpisodeNumber: number | null
  runtime: number | null
}

export type SeedIndex = {
  version: typeof SEED_VERSION
  /** ISO */
  generatedAt: string
  /** the app sha the walk ran on, read off the footer */
  commit: string
  /** '0.0.17' */
  appVersion: string
  /** 'http://localhost:4599' or 'https://anime.fkn.app' */
  walkedOrigin: string
  /** season key -> run keys. Carries exactly the current and the next season. */
  seasons: Record<string, string[]>
  /** sorted by key */
  runs: SeedRun[]
}

export type SeedEpisodes = {
  version: typeof SEED_VERSION
  /** must equal the index's, or the runtime refuses the whole file */
  generatedAt: string
  commit: string
  /** run key -> episodes sorted by number ascending */
  episodes: Record<string, SeedEpisode[]>
}

export type SeedManifest = {
  version: typeof SEED_VERSION
  generatedAt: string
  commit: string
  appVersion: string
  walkedOrigin: string
  tabs: number
  durationMs: number
  walked: { items: number, empty: number, capped: number, split: number, medianSettleMs: number }
  seasons: Record<string, number>
  runs: number
  originCounts: Record<string, number>
  streamingCounts: Record<string, number>
  streamingShare: number
  medianIdentity: number
  nullUrlMembers: number
  droppedNoKey: number
  droppedTitles: number
  droppedImages: number
  droppedUrls: number
  droppedEpisodes: number
  scopeConflicts: number
  cappedEpisodeRuns: number
  bytes: { index: number, indexGz: number, episodes: number, episodesGz: number }
  /** 'none': no user API key was seeded, so the seed is reproducible from public sources alone */
  keyedSources: 'none'
  gate: { ok: boolean, failures: string[] }
}

/** `2026-SUMMER`. Equals `seasonKey` in ./normalize.ts, pinned by a test. Accepts either case. */
export const seasonKeyOf = ({ season, year }: { season: string, year: number }): string =>
  `${year}-${season.toUpperCase()}`

/** fall 2026 -> winter 2027, in the lower-case spelling `animeSeasonOf` uses. Throws on a non-season. */
export const nextSeason = ({ season, year }: { season: string, year: number }): { season: string, year: number } => {
  const index = SEED_SEASON_ORDER.indexOf(season.toLowerCase() as typeof SEED_SEASON_ORDER[number])
  if (index === -1) throw new RangeError(`not a season: ${season}`)
  const next = (index + 1) % SEED_SEASON_ORDER.length
  return { season: SEED_SEASON_ORDER[next]!, year: next === 0 ? year + 1 : year }
}

const NUMERIC_ID = /^\d+$/

/**
 * `mal-59193`: identity borrowed in the same order `recordId` (./normalize.ts) and `rowId`
 * (./index-lookup.ts) borrow it, which is what makes the seed's offline row and the bundle's offline
 * row ONE node supplied twice rather than two rows needing a merge. Takes `origin:id` strings and
 * answers undefined when none of mal, anilist or kitsu carries a numeric id.
 *
 * The numeric check is not decoration. A walk measured an anilist handle whose id was the slug
 * `Keroro-Gunsou-Shin-Anime`, which mints a key `SEED_RUN_KEY` refuses, and a gate failure refuses the
 * whole day's publish rather than that one run. Skipping it also lets the next key origin answer, and
 * keeps `keyUri` a total inverse, since the key can then hold no hyphen but the one this joins on.
 */
export const runKeyOf = (uris: readonly string[]): string | undefined => {
  for (const origin of SEED_KEY_ORIGINS) {
    const uri = uris.find(candidate => candidate.startsWith(`${origin}:`) && NUMERIC_ID.test(candidate.slice(origin.length + 1)))
    if (uri) return `${origin}-${uri.slice(origin.length + 1)}`
  }
  return undefined
}

/** `mal-59193` -> `mal:59193`: the identity member the key was borrowed from. */
export const keyUri = (key: string): string => key.replace('-', ':')

/** Order two season keys chronologically: `2026-FALL` after `2026-SUMMER`, `2027-WINTER` after both. */
export const compareSeasonKeys = (a: string, b: string): number => {
  const parse = (key: string) => {
    const [year, season] = key.split('-')
    return [Number(year), SEED_SEASON_ORDER.indexOf((season ?? '').toLowerCase() as typeof SEED_SEASON_ORDER[number])] as const
  }
  const [yearA, seasonA] = parse(a)
  const [yearB, seasonB] = parse(b)
  return yearA - yearB || seasonA - seasonB
}
