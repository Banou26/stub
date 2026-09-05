#!/usr/bin/env node
/**
 * Walk the built app once per current-season run and export the store as the offline source's seed.
 *
 *   node scripts/export-season-seed.mjs [--origin http://localhost:4599] [--tabs 4]
 *                                       [--max-minutes 45] [--limit N] [--out dist-seed]
 *                                       [--runs-per-load 1]
 *
 * The seed is one more source's rows and claims, subject to the same scope and evidence rules as any
 * other. Nothing here fetches an upstream directly: it drives the SAME code a user runs, through the
 * same relay, and reads the store the app itself built. That is the only way the seed can carry
 * identity the product would have derived anyway.
 *
 * WHY IT DOES NOT RUN IN `npm run build`. Cloudflare Pages' build budget cannot hold thousands of
 * rate-limited upstream requests. This runs on a schedule (.github/workflows/season-seed.yml) and
 * publishes a runtime-fetched release asset, so the data refreshes without a deploy and a bad seed
 * rolls back by re-pointing the tag.
 *
 * THE THREE RULES THAT KEEP THE SEED HONEST, and each of them costs something on purpose:
 *
 *   1. ONE PAGE LOAD PER RUN. The media route renders the home listing too, so every load re-runs the
 *      listing fan-out. The benefit is that a run's store holds that listing and ONE run, so
 *      `askUnasked` can never be handed a uri carrying another run's ids and a weld cannot propagate
 *      from one walked run to the next. A weld has no inverse and this seed reaches every user.
 *   2. SINGLE `origin:id` URIS ONLY, NEVER AN AGGREGATED ONE. `mergeHandles` (src/sources/utils.ts)
 *      makes any source handed an `ag:(...)` uri re-assert SAME_AS across its whole membership, so
 *      navigating one would launder whatever built it, including a fuzzy title guess, into an
 *      asserted claim attributed to a source that never checked it.
 *   3. THE `offline` ORIGIN IS EXCLUDED FROM EVERY EXPORT. The offline source's handles form a star
 *      centred on `offline:<key>`; cutting it means mal, anilist and kitsu are connected in the
 *      export only where a LIVE source asserted it. Without this, seed N+1 would ratify seed N
 *      forever. The cost is that a run only the bundle bridged exports as two clusters, which is
 *      measured as `walked.split` and self-repairs at runtime when both halves union on arrival.
 *   4. EVERY PAGE CARRIES `?seed=off`, so a walk never reads its own previous output. Rule 3 alone
 *      does not close that loop: a seeded id is stored, joins the cluster's aggregated uri, and rule
 *      2's `mergeHandles` then has a LIVE source assert SAME_AS across the whole membership, which
 *      does not route through `offline:` and so survives the exclusion. The page refuses the seed
 *      asset outright (`refusesSeedAsset` in src/utils/export-flag.ts).
 *
 * Navigation uses the RAW uri. `/media/` + uri, never `encodeURIComponent(uri)`: a percent-encoded
 * segment blinded three probes on 2026-09-05.
 *
 * Headless and muted, always. The page autoplays a trailer, and the route-abort list below drops it
 * along with every image, font and media byte the store does not read. `fkn.app`, `api.fkn.app` and
 * the walked origin are never aborted: the relay iframe and its scripts are the entire source path.
 *
 * EXIT CODES. 0 clean, 1 the gate refused, 2 a control failed. Build, gate, THEN write: a seed that
 * fails the gate is not written at all, so the workflow uploads nothing and the live asset stays.
 * The manifest is written either way, because a refused run still has to be diagnosable.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Every value import from src/ carries an explicit .ts extension, and both halves of that are
// required: node's type stripping refuses a bare './a' specifier with ERR_MODULE_NOT_FOUND, and tsc
// refuses a '.ts' one with TS5097 unless allowImportingTsExtensions is set, which tsconfig.json now
// sets for exactly this.
import {
  SEED_EPISODES_ASSET, SEED_INDEX_ASSET, SEED_MANIFEST_ASSET, SEED_VERSION,
  compareSeasonKeys, nextSeason, runKeyOf, seasonKeyOf,
} from '../src/sources/offline/seed.ts'
import { buildSeed } from '../src/sources/offline/seed-build.ts'
import { gateSeed } from '../src/sources/offline/seed-gate.ts'
import { animeSeasonOf } from '../src/sources/season.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* --------------------------------------------------------------------------------------------- */
/* flags                                                                                           */
/* --------------------------------------------------------------------------------------------- */

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1]
}

const ORIGIN = String(flag('origin', 'http://localhost:4599')).replace(/\/+$/, '')
const TABS = Math.max(1, Number(flag('tabs', 4)))
const MAX_MINUTES = Number(flag('max-minutes', 45))
const LIMIT = flag('limit', undefined) === undefined ? Infinity : Number(flag('limit'))
const OUT_DIR = resolve(ROOT, String(flag('out', 'dist-seed')))
const RUNS_PER_LOAD = Math.max(1, Number(flag('runs-per-load', 1)))

const HOOK_TIMEOUT_MS = 15_000
const FOOTER_TIMEOUT_MS = 15_000
const SETTLE_POLL_MS = 400
const SETTLE_QUIET_MS = 1_200
/**
 * A settle is not accepted before this, and the reason is the one source that answers with NO
 * network at all.
 *
 * Measured 2026-09-05, four runs, from the moment the hook attaches: at ~0.9 s the offline bundle's
 * three handles are stored and, with the `offline` origin excluded, they are THREE SINGLETONS; at
 * ~1.4 s a live source asserts the bridge and they become one cluster; cr, jw and anizip then arrive
 * through 3.0 s. So the store holds still for well over the quiet window while the first real ask is
 * still in flight, and a run settled in that gap ships with an identity of one. Without this floor
 * that is exactly what happened to 10 of 20 walked runs.
 */
const SETTLE_FLOOR_MS = 5_000
const SETTLE_CAP_MS = 12_000
const PACE_MS = 3_000
const MIN_HOME_CLUSTERS = 20

// `export=store` attaches the export hook; `seed=off` makes the page refuse the published seed, so a
// walk measures the live sources and never its own last publish. Both ride every navigation,
// including the client-side ones a --runs-per-load above 1 makes.
const WALK_QUERY = '?export=store&seed=off'

const log = (...args) => console.log('[season-seed]', ...args)

/* --------------------------------------------------------------------------------------------- */
/* browser hygiene                                                                                 */
/* --------------------------------------------------------------------------------------------- */

const BLOCKED_TYPES = new Set(['image', 'media', 'font'])
// Measured census: 30 to 33 of 88 home requests are the trailer. None of it reaches the store.
const BLOCKED_HOSTS = [
  'www.youtube.com', 'i.ytimg.com', 'googleads.g.doubleclick.net', 'static.doubleclick.net',
  'www.google.com', 'play.google.com', 'jnn-pa.googleapis.com',
]
const BLOCKED_SUFFIXES = ['.googlevideo.com']

const originHost = (() => { try { return new URL(ORIGIN).hostname } catch { return '' } })()

// The allow list wins over BOTH abort rules. The relay iframe and its scripts are the source path,
// so an over-broad type rule taking one of their responses would look exactly like every upstream
// refusing at once.
const isSourcePath = host =>
  host === originHost || host === 'fkn.app' || host.endsWith('.fkn.app')

const installRoutes = context =>
  context.route('**/*', route => {
    const request = route.request()
    let host = ''
    try { host = new URL(request.url()).hostname } catch { host = '' }
    if (isSourcePath(host)) return route.continue()
    if (BLOCKED_HOSTS.includes(host) || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) return route.abort()
    if (BLOCKED_TYPES.has(request.resourceType())) return route.abort()
    return route.continue()
  })

/* --------------------------------------------------------------------------------------------- */
/* the page hook                                                                                   */
/* --------------------------------------------------------------------------------------------- */

const exportFrom = (page, uris) =>
  page.evaluate(
    list => typeof window.__stubExportStore === 'function'
      ? window.__stubExportStore(list ? { excludeOrigins: ['offline'], uris: list } : { excludeOrigins: ['offline'] })
      : undefined,
    uris ?? null
  ).catch(() => undefined)

/**
 * What "the store stopped changing" means here.
 *
 * Not the full serialized clusters: descriptions and provider offers keep arriving long after the
 * identity has settled, and the seed carries neither, so a full compare would sit at the cap on
 * nearly every run. Not uris alone either, since a member's titles and covers arrive after its uri
 * does. This is every field the seed actually publishes, reduced to lengths where an array is all
 * that matters.
 */
const signatureOf = snapshot =>
  JSON.stringify((snapshot?.clusters ?? []).map(cluster => [
    cluster.members.map(member => [
      member.uri, member.scope, member.score ?? null, member.status ?? null, member.episodeCount ?? null,
      (member.titles ?? []).length, (member.covers ?? []).length, (member.banners ?? []).length,
    ]),
    cluster.partOf.map(row => row.uri),
    cluster.episodes.map(episode => [
      episode.uri, episode.episodeNumber ?? null, episode.url ? 1 : 0,
      (episode.titles ?? []).length, (episode.thumbnails ?? []).length,
    ]),
  ]))

/** Whether the page has booted far enough to answer at all. Its absence is never a settled store. */
const waitForHook = page =>
  page
    .waitForFunction(() => typeof window.__stubExportStore === 'function', { timeout: HOOK_TIMEOUT_MS })
    .then(() => true, () => false)

/** Poll until the signature holds still, then take what is there. Answers what it took and why. */
const settle = async (page, uris) => {
  const started = Date.now()
  let previous = null
  let stableSince = 0
  let snapshot
  for (;;) {
    snapshot = await exportFrom(page, uris)
    const signature = signatureOf(snapshot)
    if (signature === previous) {
      if (!stableSince) stableSince = Date.now()
      if (Date.now() - stableSince >= SETTLE_QUIET_MS && Date.now() - started >= SETTLE_FLOOR_MS) {
        return { snapshot, ms: Date.now() - started, capped: false }
      }
    } else {
      previous = signature
      stableSince = 0
    }
    if (Date.now() - started >= SETTLE_CAP_MS) return { snapshot, ms: Date.now() - started, capped: true }
    await page.waitForTimeout(SETTLE_POLL_MS)
  }
}

/* --------------------------------------------------------------------------------------------- */
/* the work list                                                                                   */
/* --------------------------------------------------------------------------------------------- */

const KEY_ORIGINS = ['mal', 'anilist', 'kitsu']

/** In order: an `offline:` member, else mal, anilist, kitsu, else the first candidate sorted. */
const navigationUriOf = candidates => {
  const sorted = [...candidates].sort()
  const offline = sorted.find(uri => uri.startsWith('offline:'))
  if (offline) return offline
  for (const origin of KEY_ORIGINS) {
    const match = sorted.find(uri => uri.startsWith(`${origin}:`))
    if (match) return match
  }
  return sorted[0]
}

/** Merge work items whose candidate uri sets intersect, so one run is never walked twice. */
const mergeItems = items => {
  const owner = new Map()
  const groups = []
  for (const item of items) {
    const hit = [...new Set(item.candidates.map(uri => owner.get(uri)).filter(group => group !== undefined))]
    let group = hit[0]
    if (group === undefined) {
      group = { candidates: new Set() }
      groups.push(group)
    }
    for (const other of hit.slice(1)) {
      for (const uri of other.candidates) { group.candidates.add(uri); owner.set(uri, group) }
      other.candidates.clear()
      other.merged = true
    }
    for (const uri of item.candidates) { group.candidates.add(uri); owner.set(uri, group) }
  }
  return groups
    .filter(group => !group.merged && group.candidates.size)
    .map(group => {
      const candidates = [...group.candidates].sort()
      return { candidates, uri: navigationUriOf(candidates) }
    })
    .sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0)
}

/**
 * candidate member uri -> season key, taken from the RAW work list rather than the merged one: a
 * merged item can span two seasons, and `buildSeed` picks the earliest across a run's own members.
 */
const seasonsByUri = raw => {
  const map = {}
  for (const item of raw) {
    if (!item.season) continue
    for (const uri of item.candidates) {
      const held = map[uri]
      if (held === undefined || compareSeasonKeys(item.season, held) < 0) map[uri] = item.season
    }
  }
  return map
}

/** The manami buckets for the current and the next season, read from the generated bundle. */
const bucketItems = async (currentKey, nextKey) => {
  const bundle = (await import('../src/generated/anime-seasons.ts')).default
  const items = []
  for (const key of [currentKey, nextKey]) {
    const records = bundle.seasons?.[key]
    if (!records) {
      log(`WARNING: the bundle (${bundle.tag}) carries no ${key}; run npm run data:build`)
      continue
    }
    for (const record of records) {
      const candidates = []
      if (record.ml) candidates.push(`mal:${record.ml}`)
      if (record.al) candidates.push(`anilist:${record.al}`)
      if (record.ku) candidates.push(`kitsu:${record.ku}`)
      // A record with no catalogue id has no identity to borrow, exactly as `seasonMedia` skips it.
      const runKey = runKeyOf(candidates)
      if (!runKey) continue
      items.push({ candidates: [`offline:${runKey}`, ...candidates], season: key })
    }
  }
  return items
}

/* --------------------------------------------------------------------------------------------- */
/* the walk                                                                                        */
/* --------------------------------------------------------------------------------------------- */

const die = (code, message) => {
  console.error(`[season-seed] ${message}`)
  process.exitCode = code
}

const newContext = async browser => {
  const context = await browser.newContext()
  await installRoutes(context)
  return context
}

const main = async () => {
  const startedAt = Date.now()
  const deadline = startedAt + MAX_MINUTES * 60_000
  const currentSeasonKey = seasonKeyOf(animeSeasonOf())
  const nextSeasonKey = seasonKeyOf(nextSeason(animeSeasonOf()))
  log(`origin ${ORIGIN}, tabs ${TABS}, seasons ${currentSeasonKey} and ${nextSeasonKey}`)

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH ?? undefined,
    args: ['--mute-audio'],
  })

  let failure
  const snapshots = []
  const walked = { items: 0, empty: 0, capped: 0, split: 0, medianSettleMs: 0 }
  const settleTimes = []
  let commit = ''
  let appVersion = ''
  let bestMembers = 0
  let items = []
  let seasonByUri = {}

  try {
    /* control (a) and (b): the hook, and a build that names the commit it came from */
    const homeContext = await newContext(browser)
    const homePage = await homeContext.newPage()
    await homePage.goto(`${ORIGIN}/${WALK_QUERY}`, { waitUntil: 'domcontentloaded' })

    const hooked = await waitForHook(homePage)
    if (!hooked) {
      throw { code: 2, message: 'CONTROL FAILED: window.__stubExportStore never appeared, so the flag never reached the app. An export of nothing would look identical to a store of nothing.' }
    }
    log('control (a) the export hook is attached: ok')

    const footer = await homePage
      .waitForFunction(() => document.body.innerText.match(/v([\d.]+) ([0-9a-f]{7})/)?.slice(1) ?? null, { timeout: FOOTER_TIMEOUT_MS })
      .then(handle => handle.jsonValue(), () => null)
    if (!footer || footer[1] === 'dev') {
      throw { code: 2, message: `CONTROL FAILED: the footer names no commit (${footer ? footer.join(' ') : 'no version line'}), so the seed could not say what produced it.` }
    }
    appVersion = footer[0]
    commit = footer[1]
    log(`control (b) the build names its commit: ok (v${appVersion} ${commit})`)

    /* control (c): the listing answered at all */
    const home = await settle(homePage, null)
    const homeClusters = home.snapshot?.clusters ?? []
    log(`home listing: ${homeClusters.length} clusters in ${home.ms} ms${home.capped ? ' (capped)' : ''}`)
    if (homeClusters.length < MIN_HOME_CLUSTERS) {
      throw { code: 2, message: `CONTROL FAILED: the home export holds ${homeClusters.length} clusters, under ${MIN_HOME_CLUSTERS}. The listing never answered, so the current-season half is not a measurement.` }
    }
    log(`control (c) the listing answered: ok (${homeClusters.length} clusters)`)

    // The home snapshot ENUMERATES work items and is deliberately NOT part of the seed. Every
    // cluster in it becomes a work item, so a full run walks all of them and their rows arrive in the
    // per-run snapshots anyway; keeping it as well would change nothing there. What it WOULD change
    // is a capped or expired run, where it publishes runs the walk never described: two-member
    // identities with no episodes, which is exactly the shape `medianIdentity` exists to refuse.
    await homePage.close()
    await homeContext.close()

    /* the work list: the manami buckets, plus whatever the live listing knows that they predate */
    const listingItems = homeClusters.map(cluster => ({
      candidates: cluster.members.map(member => member.uri),
      season: currentSeasonKey,
    }))
    const raw = [...(await bucketItems(currentSeasonKey, nextSeasonKey)), ...listingItems]
    seasonByUri = seasonsByUri(raw)
    items = mergeItems(raw)
    log(`work list: ${items.length} runs (${listingItems.length} from the listing)`)
    // `--limit` takes an evenly spaced sample rather than a prefix, and that is deliberate. The list
    // is sorted by navigation uri for determinism, so its head is entirely `anilist:` items: the runs
    // the manami bundle does NOT carry. A prefix would therefore never walk an `offline:` navigation
    // uri, which is the path the uncapped run mostly takes, so a capped run would measure a
    // population the real one does not have. The stride is fixed, so a re-run walks the same subset.
    if (Number.isFinite(LIMIT) && items.length > LIMIT) {
      const stride = items.length / LIMIT
      items = Array.from({ length: LIMIT }, (_, at) => items[Math.floor(at * stride)])
      log(`--limit ${LIMIT}: walking ${items.length} evenly spaced across the list`)
    }

    /* the walk itself: one goto per run, TABS independent stores, paced */
    const batches = []
    for (let at = 0; at < items.length; at += RUNS_PER_LOAD) batches.push(items.slice(at, at + RUNS_PER_LOAD))
    let nextBatch = 0

    const worker = async index => {
      const context = await newContext(browser)
      let lastGoto = 0
      for (;;) {
        const at = nextBatch++
        if (at >= batches.length) break
        if (Date.now() >= deadline) break
        const batch = batches[at]
        const wait = PACE_MS - (Date.now() - lastGoto)
        if (wait > 0) await new Promise(done => setTimeout(done, wait))
        lastGoto = Date.now()

        const page = await context.newPage()
        try {
          for (const [step, item] of batch.entries()) {
            // RAW uri. Never encodeURIComponent: a percent-encoded segment blinded three probes.
            const path = `/media/${item.uri}${WALK_QUERY}`
            if (step === 0) await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' })
            else {
              await page.evaluate(url => {
                history.pushState({}, '', url)
                window.dispatchEvent(new PopStateEvent('popstate'))
              }, path)
            }
            // `domcontentloaded` fires long before the app boots, and a page with no hook exports an
            // empty signature that holds perfectly still, so the settle would accept nothing as a
            // result. The hook has to be there before the clock starts.
            if (!(await waitForHook(page))) {
              walked.items += 1
              walked.empty += 1
              log(`[tab ${index}] ${item.uri}: the export hook never attached`)
              continue
            }
            const { snapshot, ms, capped } = await settle(page, item.candidates)
            const clusters = snapshot?.clusters ?? []
            walked.items += 1
            settleTimes.push(ms)
            if (capped) walked.capped += 1
            if (!clusters.length) walked.empty += 1
            for (const cluster of clusters) bestMembers = Math.max(bestMembers, cluster.members.length)
            if (snapshot) snapshots.push(snapshot)
            if (walked.items % 10 === 0 || clusters.length === 0) {
              log(`[tab ${index}] ${walked.items}/${items.length} ${item.uri}: ${clusters.length} clusters, ${ms} ms${capped ? ' capped' : ''}`)
            }
          }
        } catch (error) {
          walked.empty += 1
          walked.items += 1
          log(`[tab ${index}] ${batch[0]?.uri}: failed, ${error?.message ?? error}`)
        } finally {
          await page.close().catch(() => {})
        }
      }
      await context.close().catch(() => {})
    }

    await Promise.all(Array.from({ length: Math.min(TABS, batches.length || 1) }, (_, index) => worker(index)))
    if (Date.now() >= deadline) log(`--max-minutes ${MAX_MINUTES} expired: building the seed from ${walked.items} walked runs`)

    /* control (d): the walk succeeded at something */
    if (bestMembers < 3) {
      throw { code: 2, message: `CONTROL FAILED: no walked run produced a cluster of 3 or more members (best ${bestMembers}). The walk succeeded at nothing.` }
    }
    log(`control (d) the walk produced a real cluster: ok (largest ${bestMembers} members)`)
  } catch (error) {
    failure = error?.code === 2 ? error : { code: 2, message: `CONTROL FAILED: ${error?.stack ?? error}` }
  } finally {
    await browser.close().catch(() => {})
  }

  if (failure) {
    die(failure.code, failure.message)
    return
  }

  /* ------------------------------------------------------------------------------------------- */
  /* build, gate, then write                                                                       */
  /* ------------------------------------------------------------------------------------------- */

  const sorted = [...settleTimes].sort((a, b) => a - b)
  walked.medianSettleMs = sorted.length
    ? (sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2))
    : 0

  const generatedAt = new Date().toISOString()
  const { index, episodes, report } = buildSeed(snapshots, {
    generatedAt, commit, appVersion, walkedOrigin: ORIGIN, seasonByUri,
  })

  // `report.split` is what the UNION step merged away, which buildSeed can prove from snapshots
  // alone. This is the other sense, the one only the work list can see: a run the offline exclusion
  // cut into two clusters, so one walked item ships as two seed runs.
  const runOfUri = new Map()
  for (const run of index.runs) for (const handle of run.identity) runOfUri.set(handle.uri, run.key)
  for (const item of items) {
    const keys = new Set(item.candidates.map(uri => runOfUri.get(uri)).filter(Boolean))
    if (keys.size > 1) walked.split += keys.size - 1
  }

  const indexJson = JSON.stringify(index)
  const episodesJson = JSON.stringify(episodes)
  const indexGz = gzipSync(Buffer.from(indexJson), { level: 9 })
  const episodesGz = gzipSync(Buffer.from(episodesJson), { level: 9 })

  const gate = gateSeed(index, episodes, { currentSeasonKey })

  const manifest = {
    version: SEED_VERSION,
    generatedAt,
    commit,
    appVersion,
    walkedOrigin: ORIGIN,
    tabs: TABS,
    durationMs: Date.now() - startedAt,
    walked,
    seasons: report.perSeason,
    runs: report.runs,
    originCounts: report.originCounts,
    streamingCounts: report.streamingCounts,
    streamingShare: report.streamingShare,
    medianIdentity: report.medianIdentity,
    nullUrlMembers: report.nullUrlMembers,
    droppedNoKey: report.droppedNoKey,
    droppedTitles: report.droppedTitles,
    droppedImages: report.droppedImages,
    droppedUrls: report.droppedUrls,
    droppedEpisodes: report.droppedEpisodes,
    scopeConflicts: report.scopeConflicts,
    cappedEpisodeRuns: report.cappedEpisodeRuns,
    bytes: {
      index: Buffer.byteLength(indexJson),
      indexGz: indexGz.length,
      episodes: Buffer.byteLength(episodesJson),
      episodesGz: episodesGz.length,
    },
    // A runner has empty localStorage and the workflow deliberately seeds no key from a secret, so
    // the seed carries no identity derived from a paid or metered account on anyone's behalf.
    keyedSources: 'none',
    gate: { ok: gate.ok, failures: gate.failures },
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, SEED_MANIFEST_ASSET), `${JSON.stringify(manifest, null, 2)}\n`)
  // debug only, never uploaded: the raw snapshots the seed was built from
  writeFileSync(resolve(OUT_DIR, 'snapshots.jsonl'), snapshots.map(snapshot => JSON.stringify(snapshot)).join('\n'))

  log(`runs ${report.runs}, seasons ${JSON.stringify(report.perSeason)}`)
  log(`origins ${JSON.stringify(report.originCounts)}`)
  log(`streaming ${JSON.stringify(report.streamingCounts)}, share ${report.streamingShare}`)
  log(`median identity ${report.medianIdentity}, split ${walked.split}, dropped without a key ${report.droppedNoKey}`)
  log(`dropped rows: ${report.droppedTitles} titles, ${report.droppedImages} images, ${report.droppedUrls} urls, ${report.droppedEpisodes} episodes; ${report.scopeConflicts} scope conflicts`)
  log(`bytes index ${manifest.bytes.index} (${manifest.bytes.indexGz} gz), episodes ${manifest.bytes.episodes} (${manifest.bytes.episodesGz} gz)`)
  log(`walked ${walked.items} runs in ${Math.round(manifest.durationMs / 1000)} s, ${walked.empty} empty, ${walked.capped} capped, median settle ${walked.medianSettleMs} ms`)

  if (!gate.ok) {
    for (const line of gate.failures) console.error(`[season-seed] GATE: ${line}`)
    die(1, `the gate refused this seed (${gate.failures.length} failure lines). Nothing was written but ${SEED_MANIFEST_ASSET}; the published asset is untouched.`)
    return
  }

  writeFileSync(resolve(OUT_DIR, 'season-seed.json'), indexJson)
  writeFileSync(resolve(OUT_DIR, 'season-seed-episodes.json'), episodesJson)
  writeFileSync(resolve(OUT_DIR, SEED_INDEX_ASSET), indexGz)
  writeFileSync(resolve(OUT_DIR, SEED_EPISODES_ASSET), episodesGz)
  log(`gate passed; wrote ${OUT_DIR}`)
}

await main()
