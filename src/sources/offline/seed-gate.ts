// What decides whether a walk's output is published to every user. Pure, total, and node-loadable:
// the only import is ./seed.ts, with the explicit extension node needs to strip its types.
//
// Every exported check answers with a list of lines and never throws, whatever it is handed, because
// the caller is a workflow step whose job is to print a refusal rather than a stack trace.
import type { SeedEpisode, SeedEpisodes, SeedHandle, SeedIndex, SeedRun } from './seed.ts'

import {
  SEED_BANNERS_PER_RUN, SEED_COMMIT, SEED_COVERS_PER_RUN, SEED_EPISODES_PER_RUN, SEED_MEDIA_CATEGORIES,
  SEED_MEDIA_TYPES, SEED_ORIGIN, SEED_RUN_KEY, SEED_SEASON_KEY, SEED_STREAMING_ORIGINS,
  SEED_THUMBNAILS_PER_EPISODE, SEED_TITLES_PER_EPISODE, SEED_TITLES_PER_RUN, SEED_UNROUTABLE_ID, SEED_URL,
  SEED_URLS_PER_EPISODE, SEED_VERSION, keyUri,
} from './seed.ts'

// The walk is the season's most popular `--top` (100 by default), not its whole 306, so these are
// floors on a deliberately small set: enough that a broken walk still refuses, low enough that a
// short season or a capped smoke run publishes. The first three walks used 250 and 120 against an
// uncapped list.
export const SEED_MIN_RUNS = 40
export const SEED_MIN_CURRENT_SEASON_RUNS = 30
export const SEED_MIN_STREAMING_SHARE = 0.25
export const SEED_MIN_MEDIAN_IDENTITY = 4
export const SEED_MAX_INDEX_BYTES = 2_000_000
export const SEED_MAX_EPISODES_BYTES = 6_000_000
export const SEED_MAX_REPORTED_FAILURES = 50
/**
 * How much of a walk may be welded before the seed is refused outright.
 *
 * The first real walk (2026-09-05, 358 runs) carried exactly ONE, `mal-63736` holding two Netflix
 * ids, which is the open collision between the ids unogs mints and the ones justwatch reads. A
 * welded run must never be published, and refusing the other 357 for it would mean one bad show
 * blocks every daily publish until somebody notices. So a weld drops its run and the SHARE is what
 * fails: 1 in 359 is the measured floor of the app, 2 percent is a spike that says something broke.
 */
export const SEED_MAX_WELD_SHARE = 0.02

const OFFLINE = 'offline'

type Unknowns = Record<string, unknown>

const isObject = (value: unknown): value is Unknowns =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isNumberOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const isTextOrNull = (value: unknown) => value === null || typeof value === 'string'
const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? '').length

/** Cut a runaway list to `SEED_MAX_REPORTED_FAILURES` and say how much was cut: a broken walk must not print 40,000 lines into a log. */
const capped = (failures: string[]): string[] =>
  failures.length <= SEED_MAX_REPORTED_FAILURES
    ? failures
    : [...failures.slice(0, SEED_MAX_REPORTED_FAILURES), `... and ${failures.length - SEED_MAX_REPORTED_FAILURES} more`]

/**
 * Whether one id is the other's own extension, `<a>` against `<a>-<something>`.
 *
 * The same rule `mostSpecific` in utils/uri.ts applies, and for the same reason: a season-scoped id is
 * built by joining the series id and a season id on '-', so a cluster holding both is one source
 * naming its run precisely, not two sources disagreeing. Two ids that merely share a prefix
 * (`G24H1N3MP` and `G24H1N3MPX`) are unrelated and stay a disagreement.
 */
export const extendsId = (a: string, b: string): boolean => a.startsWith(`${b}-`) || b.startsWith(`${a}-`)

/**
 * Every run whose identity holds two ids of one origin that name different runs.
 *
 * A weld is what a wrong union looks like once it is published: two runs of a show fused into one
 * cluster, with no inverse for anyone who reads the seed. Same grouping `scripts/check-welds.mjs`
 * applies to rendered hrefs, applied to the export, because the store holds clusters no page linked.
 *
 * Only the ids no OTHER id extends are compared, which is a one-way reading of `extendsId` on
 * purpose. Dropping both sides of the pair, as the symmetric reading does, made a shared parent hide
 * the disagreement it sits between: `[A, A-1, A-2]` is two seasons of one series welded into a run,
 * and every id there extends or is extended by another, so nothing was left to report.
 */
export const findSeedWelds = (index: SeedIndex): { key: string, origin: string, ids: string[] }[] => {
  const welds: { key: string, origin: string, ids: string[] }[] = []
  for (const run of index.runs ?? []) {
    const byOrigin = new Map<string, Set<string>>()
    for (const handle of run.identity ?? []) {
      if (!isText(handle?.origin) || !isText(handle?.id)) continue
      const ids = byOrigin.get(handle.origin) ?? new Set<string>()
      ids.add(handle.id)
      byOrigin.set(handle.origin, ids)
    }
    for (const [origin, group] of [...byOrigin].sort()) {
      if (group.size < 2) continue
      const ids = [...group]
      const specific = ids.filter(id => !ids.some(other => other.startsWith(`${id}-`))).sort()
      if (specific.length > 1) welds.push({ key: run.key, origin, ids: specific })
    }
  }
  return welds
}

const checkHandle = (handle: unknown, key: string, field: 'identity' | 'containers', expectedScope: 'RUN' | 'CONTAINER', failures: string[]) => {
  if (!isObject(handle)) {
    failures.push(`run ${key}: ${field} entry is not an object`)
    return
  }
  const { uri, origin, id, scope } = handle as Partial<SeedHandle>
  if (!isText(uri) || !isText(origin) || !isText(id) || uri !== `${origin}:${id}` || !SEED_ORIGIN.test(origin)) {
    failures.push(`run ${key}: ${field} uri ${JSON.stringify(uri)} is not <origin>:<id>`)
    return
  }
  if (SEED_UNROUTABLE_ID.test(id)) failures.push(`run ${key}: ${field} id ${JSON.stringify(id)} is not routable`)
  if (scope !== expectedScope) failures.push(`run ${key}: ${field} ${uri} scope ${JSON.stringify(scope)}, expected ${expectedScope}`)
  if (origin === OFFLINE) failures.push(`run ${key}: ${field} member ${uri} is of origin ${OFFLINE}`)
}

const checkTitles = (titles: unknown, where: string, cap: number, failures: string[]) => {
  if (!Array.isArray(titles)) {
    failures.push(`${where}: titles is not an array`)
    return
  }
  if (titles.length > cap) failures.push(`${where}: ${titles.length} titles over the cap of ${cap}`)
  for (const title of titles) {
    if (!isObject(title) || !isText(title.language) || !isText(title.title)) {
      failures.push(`${where}: title ${JSON.stringify(title)} needs a non-empty language and title`)
    }
  }
}

const checkImages = (images: unknown, where: string, field: 'cover' | 'banner' | 'thumbnail', cap: number, failures: string[]) => {
  if (!Array.isArray(images)) {
    failures.push(`${where}: ${field}s is not an array`)
    return
  }
  if (images.length > cap) failures.push(`${where}: ${images.length} ${field}s over the cap of ${cap}`)
  for (const image of images) {
    if (!isObject(image) || !isText(image.url) || !SEED_URL.test(image.url) || !isTextOrNull(image.language)) {
      failures.push(`${where}: ${field} ${JSON.stringify(isObject(image) ? image.url : image)} is not an http url`)
    }
  }
}

/** The run each uri was published under, one map per scope, so one uri claiming both can be reported. */
type SeenUris = { identity: Map<string, string>, containers: Map<string, string> }

const checkRun = (value: unknown, position: number, seen: SeenUris, failures: string[]) => {
  if (!isObject(value)) {
    failures.push(`runs[${position}]: not an object`)
    return
  }
  const run = value as unknown as SeedRun
  const key = isText(run.key) ? run.key : `runs[${position}]`
  const identity = Array.isArray(run.identity) ? run.identity : []
  const where = `run ${key}`

  if (!isText(run.key) || !SEED_RUN_KEY.test(run.key)) {
    failures.push(`${where}: key ${JSON.stringify(run.key)} is not <mal|anilist|kitsu>-<digits>`)
  } else if (!identity.some(handle => isObject(handle) && handle.uri === keyUri(run.key))) {
    failures.push(`${where}: key names no identity member (${keyUri(run.key)})`)
  }

  if (!Array.isArray(run.identity)) failures.push(`${where}: identity is not an array`)
  else if (!run.identity.length) failures.push(`${where}: identity is empty`)
  for (const handle of identity) checkHandle(handle, key, 'identity', 'RUN', failures)

  if (!Array.isArray(run.containers)) failures.push(`${where}: containers is not an array`)
  for (const handle of Array.isArray(run.containers) ? run.containers : []) checkHandle(handle, key, 'containers', 'CONTAINER', failures)

  for (const handle of identity) {
    if (!isObject(handle) || !isText(handle.uri)) continue
    const owner = seen.identity.get(handle.uri)
    if (owner) failures.push(`${handle.uri} is in the identity of both ${owner} and ${key}`)
    else seen.identity.set(handle.uri, key)
  }

  for (const handle of Array.isArray(run.containers) ? run.containers : []) {
    if (!isObject(handle) || !isText(handle.uri)) continue
    if (!seen.containers.has(handle.uri)) seen.containers.set(handle.uri, key)
  }

  checkTitles(run.titles, where, SEED_TITLES_PER_RUN, failures)
  checkImages(run.covers, where, 'cover', SEED_COVERS_PER_RUN, failures)
  checkImages(run.banners, where, 'banner', SEED_BANNERS_PER_RUN, failures)

  if (run.type !== null && !(SEED_MEDIA_TYPES as readonly unknown[]).includes(run.type)) failures.push(`${where}: type ${JSON.stringify(run.type)} is not a media type`)
  if (!Array.isArray(run.categories) || run.categories.some(category => !(SEED_MEDIA_CATEGORIES as readonly unknown[]).includes(category))) {
    failures.push(`${where}: categories ${JSON.stringify(run.categories)} are not media categories`)
  }
  if (!isNumberOrNull(run.episodeCount)) failures.push(`${where}: episodeCount is neither a number nor null`)
  if (!isNumberOrNull(run.averageScore)) failures.push(`${where}: averageScore is neither a number nor null`)
  if (run.isAdult !== null && typeof run.isAdult !== 'boolean') failures.push(`${where}: isAdult is neither a boolean nor null`)
  if (run.season !== null && !(isText(run.season) && SEED_SEASON_KEY.test(run.season))) {
    failures.push(`${where}: season ${JSON.stringify(run.season)} is not a season key`)
  }
}

/** Every way the index is not a `SeedIndex`, one line each, capped. Empty means it is one. */
export const checkSeedSchema = (value: unknown): string[] => {
  if (!isObject(value)) return ['seed: not an object']
  const failures: string[] = []
  const index = value as unknown as SeedIndex

  if (index.version !== SEED_VERSION) failures.push(`seed: version ${JSON.stringify(index.version)}, expected ${SEED_VERSION}`)
  if (!isText(index.generatedAt) || !Number.isFinite(Date.parse(index.generatedAt))) failures.push(`seed: generatedAt ${JSON.stringify(index.generatedAt)} is not a date`)
  if (!isText(index.commit) || !SEED_COMMIT.test(index.commit)) failures.push(`seed: commit ${JSON.stringify(index.commit)} is not a sha`)

  if (!Array.isArray(index.runs)) {
    failures.push('seed: runs is not an array')
    return capped(failures)
  }

  const seen: SeenUris = { identity: new Map(), containers: new Map() }
  index.runs.forEach((run, position) => checkRun(run, position, seen, failures))

  // ONE URI, ONE SCOPE, across the whole seed. A uri published as a run's SAME_AS member here and as
  // another run's container there is not two readings the store can hold at once: scope is sticky
  // toward CONTAINER, so whichever row lands first decides whether the SAME_AS claim unions or is
  // demoted to an edge, and a dataloader batching both runs together answers differently from one
  // batching them apart. `buildSeed` reconciles this before it can reach a file; a seed that still
  // carries it is structural damage.
  for (const [uri, runKey] of seen.identity) {
    const container = seen.containers.get(uri)
    if (container) failures.push(`${uri} is a RUN member of ${runKey} and a CONTAINER of ${container}`)
  }

  const keys = new Set(index.runs.map(run => isObject(run) ? run.key : undefined).filter(isText))
  const bucketOf = new Map<string, string>()
  if (!isObject(index.seasons)) failures.push('seed: seasons is not an object')
  else {
    for (const [season, listed] of Object.entries(index.seasons)) {
      if (!SEED_SEASON_KEY.test(season)) failures.push(`seasons: ${JSON.stringify(season)} is not a season key`)
      if (!Array.isArray(listed)) {
        failures.push(`seasons ${season}: not an array of run keys`)
        continue
      }
      for (const key of listed) {
        if (!isText(key) || !keys.has(key)) failures.push(`seasons ${season}: names ${JSON.stringify(key)}, which is not a run`)
        else if (!bucketOf.has(key)) bucketOf.set(key, season)
      }
    }
    // both directions: a bucket and its runs' own `season` are one fact written twice, and a seed
    // where they disagree answers a listing differently from a media ask for the same run
    for (const run of index.runs) {
      if (!isObject(run) || !isText(run.key)) continue
      const expected = bucketOf.get(run.key) ?? null
      if ((run.season ?? null) !== expected) {
        failures.push(`run ${run.key}: season ${JSON.stringify(run.season)}, expected ${JSON.stringify(expected)}`)
      }
    }
  }

  return capped(failures)
}

export const isSeedIndex = (value: unknown): value is SeedIndex => checkSeedSchema(value).length === 0

const checkEpisode = (value: unknown, where: string, failures: string[]) => {
  if (!isObject(value)) {
    failures.push(`${where}: not an object`)
    return
  }
  const episode = value as unknown as SeedEpisode
  checkTitles(episode.titles, where, SEED_TITLES_PER_EPISODE, failures)
  checkImages(episode.thumbnails, where, 'thumbnail', SEED_THUMBNAILS_PER_EPISODE, failures)

  if (!Array.isArray(episode.urls)) failures.push(`${where}: urls is not an array`)
  else {
    if (episode.urls.length > SEED_URLS_PER_EPISODE) failures.push(`${where}: ${episode.urls.length} urls over the cap of ${SEED_URLS_PER_EPISODE}`)
    const origins = new Set<string>()
    let repeated = false
    for (const link of episode.urls) {
      if (!isObject(link) || !isText(link.origin) || !isText(link.url) || !SEED_URL.test(link.url)) {
        failures.push(`${where}: url ${JSON.stringify(link)} needs an origin and an http url`)
        continue
      }
      if (link.origin === OFFLINE) failures.push(`${where}: url ${link.url} is of origin ${OFFLINE}`)
      if (origins.has(link.origin) && !repeated) {
        repeated = true
        failures.push(`${where}: two urls of origin ${link.origin}`)
      }
      origins.add(link.origin)
    }
  }

  if (!isTextOrNull(episode.releaseDate)) failures.push(`${where}: releaseDate is neither a string nor null`)
  if (!isNumberOrNull(episode.seasonNumber)) failures.push(`${where}: seasonNumber is neither a number nor null`)
  if (!isNumberOrNull(episode.absoluteEpisodeNumber)) failures.push(`${where}: absoluteEpisodeNumber is neither a number nor null`)
  if (!isNumberOrNull(episode.runtime)) failures.push(`${where}: runtime is neither a number nor null`)
}

/** Every way the episodes file is not a `SeedEpisodes` for THIS index, one line each, capped. */
export const checkSeedEpisodesSchema = (episodes: unknown, index: SeedIndex): string[] => {
  if (!isObject(episodes)) return ['seed episodes: not an object']
  const failures: string[] = []
  const file = episodes as unknown as SeedEpisodes

  if (file.version !== SEED_VERSION) failures.push(`seed episodes: version ${JSON.stringify(file.version)}, expected ${SEED_VERSION}`)
  if (file.generatedAt !== index.generatedAt) failures.push(`seed episodes: generatedAt ${JSON.stringify(file.generatedAt)} is not the index's ${JSON.stringify(index.generatedAt)}`)
  if (file.commit !== index.commit) failures.push(`seed episodes: commit ${JSON.stringify(file.commit)} is not the index's ${JSON.stringify(index.commit)}`)

  if (!isObject(file.episodes)) {
    failures.push('seed episodes: episodes is not an object')
    return capped(failures)
  }

  const keys = new Set((index.runs ?? []).map(run => run?.key))
  for (const [key, list] of Object.entries(file.episodes)) {
    if (!keys.has(key)) failures.push(`seed episodes ${key}: names no run in the index`)
    if (!Array.isArray(list)) {
      failures.push(`seed episodes ${key}: not an array`)
      continue
    }
    if (list.length > SEED_EPISODES_PER_RUN) failures.push(`seed episodes ${key}: ${list.length} episodes over the cap of ${SEED_EPISODES_PER_RUN}`)
    let previous = 0
    for (const [position, episode] of list.entries()) {
      const number = isObject(episode) ? episode.number : undefined
      if (typeof number !== 'number' || !Number.isFinite(number) || number <= previous) {
        failures.push(`seed episodes ${key}: number ${JSON.stringify(number)} at ${position} is not ascending and positive`)
        break
      }
      previous = number
    }
    for (const episode of list) checkEpisode(episode, `seed episodes ${key}`, failures)
  }

  return capped(failures)
}

export const isSeedEpisodes = (value: unknown, index: SeedIndex): value is SeedEpisodes =>
  checkSeedEpisodesSchema(value, index).length === 0

export type SeedStats = {
  runs: number
  perSeason: Record<string, number>
  medianIdentity: number
  streamingCounts: Record<string, number>
  streamingShare: number
  bytes: { index: number, episodes: number }
}

const median = (values: number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  return sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * The measurements a walk has to clear to be published, and the failures where it does not.
 *
 * Two of these catch the relay answering nothing from a runner without knowing anything about the
 * relay: with every live source silent the offline bundle still mints mal, anilist and kitsu locally,
 * so `streamingShare` comes out exactly 0 and `medianIdentity` exactly 3. The floors are set to catch
 * that, not as targets.
 */
export const checkSeedCounts = (
  index: SeedIndex,
  episodes: SeedEpisodes,
  { currentSeasonKey }: { currentSeasonKey: string }
): { failures: string[], stats: SeedStats } => {
  const runs = index.runs ?? []
  const perSeason: Record<string, number> = {}
  for (const [season, listed] of Object.entries(index.seasons ?? {})) perSeason[season] = listed.length

  const streamingCounts: Record<string, number> = {}
  for (const origin of SEED_STREAMING_ORIGINS) streamingCounts[origin] = 0
  let streamingRuns = 0
  for (const run of runs) {
    const origins = new Set((run.identity ?? []).map(handle => handle.origin))
    let any = false
    for (const origin of SEED_STREAMING_ORIGINS) {
      if (!origins.has(origin)) continue
      streamingCounts[origin] = (streamingCounts[origin] ?? 0) + 1
      any = true
    }
    if (any) streamingRuns += 1
  }

  const stats: SeedStats = {
    runs: runs.length,
    perSeason,
    medianIdentity: median(runs.map(run => (run.identity ?? []).length)),
    streamingCounts,
    streamingShare: runs.length ? streamingRuns / runs.length : 0,
    bytes: { index: bytesOf(index), episodes: bytesOf(episodes) },
  }

  const failures: string[] = []
  if (stats.runs < SEED_MIN_RUNS) failures.push(`runs ${stats.runs}, expected at least ${SEED_MIN_RUNS}`)
  const current = perSeason[currentSeasonKey] ?? 0
  if (current < SEED_MIN_CURRENT_SEASON_RUNS) failures.push(`season ${currentSeasonKey}: ${current} runs, expected at least ${SEED_MIN_CURRENT_SEASON_RUNS}`)
  if (stats.streamingShare < SEED_MIN_STREAMING_SHARE) {
    const counted = SEED_STREAMING_ORIGINS.map(origin => `${origin}=${streamingCounts[origin] ?? 0}`).join(' ')
    failures.push(`streaming ${counted} over ${stats.runs} runs, share ${stats.streamingShare}, expected at least ${SEED_MIN_STREAMING_SHARE}`)
  }
  if (stats.medianIdentity < SEED_MIN_MEDIAN_IDENTITY) failures.push(`median identity ${stats.medianIdentity}, expected at least ${SEED_MIN_MEDIAN_IDENTITY}`)
  if (stats.bytes.index > SEED_MAX_INDEX_BYTES) failures.push(`index ${stats.bytes.index} bytes, over the budget of ${SEED_MAX_INDEX_BYTES}`)
  if (stats.bytes.episodes > SEED_MAX_EPISODES_BYTES) failures.push(`episodes ${stats.bytes.episodes} bytes, over the budget of ${SEED_MAX_EPISODES_BYTES}`)

  return { failures, stats }
}

/**
 * The welded runs removed, and their keys. A weld is two runs of one show fused into one cluster, so
 * publishing it hands every reader an identity with no inverse; the run goes, its episodes go with
 * it, and its place in the season buckets goes too. `gateSeed` still refuses any weld left behind, so
 * skipping this call cannot publish one by accident.
 */
export const dropWeldedRuns = (
  index: SeedIndex,
  episodes: SeedEpisodes
): { index: SeedIndex, episodes: SeedEpisodes, dropped: string[] } => {
  const dropped = [...new Set(findSeedWelds(index).map(weld => weld.key))]
  if (!dropped.length) return { index, episodes, dropped }
  const gone = new Set(dropped)
  return {
    dropped,
    index: {
      ...index,
      runs: index.runs.filter(run => !gone.has(run.key)),
      seasons: Object.fromEntries(
        Object.entries(index.seasons).map(([season, keys]) => [season, keys.filter(key => !gone.has(key))])
      ),
    },
    episodes: {
      ...episodes,
      episodes: Object.fromEntries(Object.entries(episodes.episodes).filter(([key]) => !gone.has(key))),
    },
  }
}

/**
 * The one call the exporter makes before writing anything: schema first, and welds and counts only on
 * a shape that parsed, so a garbage payload cannot be reported as a clean seed with odd numbers.
 */
export const gateSeed = (
  index: unknown,
  episodes: unknown,
  options: { currentSeasonKey: string, weldedDropped?: number }
): { ok: boolean, failures: string[], stats: SeedStats | null } => {
  const schema = checkSeedSchema(index)
  if (schema.length) return { ok: false, failures: schema, stats: null }

  const parsed = index as SeedIndex
  const episodeSchema = checkSeedEpisodesSchema(episodes, parsed)
  if (episodeSchema.length) return { ok: false, failures: episodeSchema, stats: null }

  // still a refusal, not a warning: `dropWeldedRuns` is the caller's job and this is what catches a
  // caller that forgot, rather than publishing the weld it was meant to remove
  const welds = findSeedWelds(parsed).map(weld => `weld ${weld.key} ${weld.origin}: ${weld.ids.join(' + ')}`)
  const dropped = options.weldedDropped ?? 0
  const weldShare = dropped / Math.max(1, parsed.runs.length + dropped)
  const spike = dropped && weldShare > SEED_MAX_WELD_SHARE
    ? [`welded runs dropped ${dropped} of ${parsed.runs.length + dropped}, share ${weldShare}, expected at most ${SEED_MAX_WELD_SHARE}`]
    : []
  const { failures: counts, stats } = checkSeedCounts(parsed, episodes as SeedEpisodes, options)
  const failures = capped([...welds, ...spike, ...counts])
  return { ok: failures.length === 0, failures, stats }
}
