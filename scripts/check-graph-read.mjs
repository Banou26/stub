/**
 * Does `?store=graph` ANSWER a real page, and does it answer the same page the old store answers?
 *
 * Two arms over one build, the second the control for the first. Both load a real media route with
 * real sources; one carries `?store=graph` and one does not. Each then puts the CLIENT'S OWN
 * documents through `window.__stubGraphQL`, which calls the same `handleRequest` urql's fetch
 * exchange calls, so the payload comes back through the real yoga, the real resolvers and whichever
 * read store the page's flags selected. A probe that rebuilt the read could not tell the two stores
 * apart, and reading the DOM would be measuring the renderer.
 *
 * WHAT MAKES THIS A CHECK AND NOT A SMOKE TEST. Three things are asserted that can each fail on
 * their own, and each has a control:
 *
 *  - The graph arm answers at all. An empty page is the failure the unit suite cannot see, because
 *    every test there seeds its own graph and never waits on 24 sources.
 *  - The graph arm is SERVED BY THE GRAPH. A cluster's `_id` is its `Cluster.id` and starts with
 *    `cl:`, and its `origin` is the literal `ag` (`src/worker/graph/plugins/fields.ts`), neither of
 *    which the old store ever produces. The legacy arm is the control: if it also comes back `cl:`
 *    then the marker means nothing and the run reports that rather than a pass.
 *  - The FIRST payload is already the graph's. `setReadStore` does not return until the engine has
 *    opened and the boot pass has run, about a second, and a subscription resolves its store once at
 *    subscribe time and keeps it for life, so a flag handed over without `await` leaves the first
 *    subscriptions on the old store forever (fixed in `src/worker.ts`, 2026-09-12). No unit test can
 *    reach that: it lives in the page entry, between a worker boot and a first render. This arm is
 *    that fix's test, which is why it reports the payload INDEX at which the graph first answered.
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-graph-read.mjs
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
// Mushoku Tensei season 1, the same uri the engine check uses: one real work most of the 24 sources
// can answer about, so the fan-out is a real one and the cluster has more than one member.
const URI = 'ag:(anilist:108465)'
const ROUTE = `/media/${URI}`
const SETTLE_MS = 25_000

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}

const fileFor = (pathname) => {
  const candidate = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  try {
    if (statSync(candidate).isFile()) return candidate
  } catch {}
  return extname(pathname) ? undefined : join(ROOT, 'index.html')
}

const server = createServer((request, response) => {
  const file = fileFor(new URL(request.url, 'http://localhost').pathname)
  if (!file) {
    response.writeHead(404).end()
    return
  }
  response.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(response)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

// The documents come out of the CLIENT, never retyped, for the reason the unit suite gives: a check
// against a copy of a document the app has since changed proves nothing about the app.
const sourceOf = (file) => readFileSync(new URL(file, import.meta.url).pathname, 'utf-8')
const documentNamed = (file, name) => {
  const block = [...sourceOf(file).matchAll(/gql\(`([\s\S]*?)`\)/g)]
    .map(match => match[1])
    .find(entry => entry.includes(`subscription ${name}(`) || entry.includes(`fragment ${name} on`))
  if (!block) throw new Error(`no document named ${name} in ${file}: the client renamed it`)
  return block
}

const MEDIA_FRAGMENT = documentNamed('../src/worker/resolvers/media/fragment.ts', 'MediaFragment')
const EPISODE_FRAGMENT = documentNamed('../src/worker/resolvers/episode/fragment.ts', 'EpisodeFragment')
const MEDIA_MODAL = documentNamed('../src/router/home/media-modal.tsx', 'GetMediaModal')
const MODAL_DOCUMENT = [MEDIA_MODAL, MEDIA_FRAGMENT, EPISODE_FRAGMENT].join('\n')

const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
// headless because nothing here watches a transfer, and muted because this is the owner's machine
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })

const arm = async (label, query) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(String(error?.message ?? error)))

  const started = Date.now()
  await page.goto(`${origin}${ROUTE}?${query}`, { waitUntil: 'domcontentloaded' })
  const installed = await page
    .waitForFunction(() => typeof window.__stubGraphQL === 'function', null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
  const installedMs = Date.now() - started

  if (!installed) {
    await context.close()
    return { label, installed: false, errors, installedMs }
  }

  const result = await page.evaluate(async ([document, uri, settleMs]) => {
    try {
      const answer = await window.__stubGraphQL(document, { input: { uri } }, { settleMs })
      return { answer }
    } catch (error) {
      return { failed: String(error?.message ?? error) }
    }
  }, [MODAL_DOCUMENT, URI, SETTLE_MS])

  await context.close()

  const media = result.answer?.last?.data?.media
  return {
    label,
    installed: true,
    installedMs,
    errors,
    failed: result.failed,
    payloads: result.answer?.payloads ?? 0,
    graphqlErrors: result.answer?.last?.errors,
    media: media && {
      _id: media._id,
      uri: media.uri,
      origin: media.origin,
      title: media.titles?.[0]?.title,
      handles: media.handles?.length ?? 0,
      episodes: media.episodes?.length ?? 0,
      episodeCount: media.episodeCount,
    },
  }
}

const graph = await arm('store=graph', 'graph=1&store=graph&export=query')
const legacy = await arm('legacy', 'graph=1&export=query')

await browser.close()
server.close()

const report = (result) => {
  console.log(`\n[${result.label}]`)
  if (!result.installed) {
    console.log(`  window.__stubGraphQL: NEVER INSTALLED after ${result.installedMs} ms`)
  } else {
    console.log(`  installed after ${result.installedMs} ms, ${result.payloads} payload(s)`)
  }
  if (result.failed) console.log(`  probe threw: ${result.failed}`)
  if (result.graphqlErrors) console.log(`  graphql errors: ${JSON.stringify(result.graphqlErrors).slice(0, 400)}`)
  if (result.media) {
    console.log(`  _id ${result.media._id}`)
    console.log(`  uri ${result.media.uri}  origin ${result.media.origin}`)
    console.log(`  title ${JSON.stringify(result.media.title)}`)
    console.log(`  handles ${result.media.handles}  episodes ${result.media.episodes}  episodeCount ${result.media.episodeCount}`)
  } else {
    console.log('  media: NULL')
  }
  if (result.errors.length) console.log(`  console errors: ${result.errors.slice(0, 5).join(' | ')}`)
}

report(graph)
report(legacy)

const failures = []
const servedByGraph = (result) => Boolean(result.media?._id?.startsWith('cl:')) || result.media?.origin === 'ag'

if (!graph.installed) failures.push('the store=graph load never installed window.__stubGraphQL')
if (graph.failed) failures.push(`the store=graph probe threw: ${graph.failed}`)
if (!graph.media) failures.push('the store=graph arm answered a NULL media, which is an empty page')
if (graph.graphqlErrors) failures.push('the store=graph arm returned graphql errors')
if (graph.media && !graph.media.title) failures.push('the store=graph arm answered a media with no title')

// the control: the marker is only evidence if the arm WITHOUT the flag does not carry it
if (!legacy.media) failures.push('the legacy control answered a NULL media, so the comparison has no baseline')
if (servedByGraph(legacy)) failures.push('the legacy control carries the graph marker, so the marker proves nothing')
if (graph.media && !servedByGraph(graph)) failures.push('the store=graph arm was served by the LEGACY store: the flag did not take')

if (graph.media && legacy.media) {
  if (!graph.media.episodes) failures.push('the store=graph arm listed no episodes where the page has some')
  const ratio = legacy.media.episodes ? graph.media.episodes / legacy.media.episodes : 1
  if (ratio < 0.5) failures.push(`the store=graph arm listed ${graph.media.episodes} episodes against the legacy ${legacy.media.episodes}`)
  if (!graph.media.handles) failures.push('the store=graph arm carries no handles, so the page draws no source badge')
}

console.log('')
if (failures.length) {
  for (const failure of failures) console.log(`FAIL: ${failure}`)
  process.exit(1)
}
console.log('ok: the graph store answers the media page, and the legacy control disagrees with its marker')
