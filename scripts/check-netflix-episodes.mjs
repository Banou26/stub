/**
 * Do Netflix episodes reach the PAGE, on each store, for each Mushoku Tensei season?
 *
 * The deliverable of the `containing`-ask work is not a green test, it is a source badge on a real
 * route, so this counts the one thing a user can see: episodes whose `handles[].node.origin` is
 * `nf`. Modelled on `scripts/check-graph-read.mjs` (static server over `build/`, headless muted
 * Chrome, the CLIENT'S OWN documents through `window.__stubGraphQL`, so the payload comes back
 * through the real yoga and whichever read store the flags selected).
 *
 * Two arms per route, the legacy one the control: a number that moves on both stores is the source
 * changing, and a number that moves on the graph alone is this work.
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-netflix-episodes.mjs
 *
 * Env: SETTLE_MS (per document), ROUTES (semicolon separated uris; an aggregated uri carries commas), CONSOLE=1 to dump the page's
 * similarMedia lines, which is how every stop in this chain was found.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
const DEFAULT_ROUTES = [
  ['s3', 'ag:(anilist:178789,anizip:18727,cr:G24H1N3MP-GS00374452,jw:222366-490814,kitsu:49002,mal:59193,offline:mal-59193)'],
  ['s1', 'ag:(anilist:108465)'],
  ['s2', 'ag:(anilist:127720)'],
]
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(';').map((uri, index) => [`r${index}`, uri])
  : DEFAULT_ROUTES
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 45_000)
const DUMP_CONSOLE = process.env.CONSOLE === '1'

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

// A PROBE, not the page: the client's own `EpisodeFragment` asks a handle node for its uri and
// nothing else, so it cannot express whether Netflix's own synopsis arrived (1d). This asks the same
// route for the fields that would carry one. The nf COUNT above is always read off the client's
// document; only the `described` column comes from here.
const PROBE_DOCUMENT = `
  subscription NetflixProbe($input: MediaInput!) {
    media(input: $input) {
      uri
      episodes {
        uri
        handles {
          node {
            uri
            origin
            episodeNumber
            titles { title }
            descriptions { description }
            thumbnails { url }
          }
        }
      }
    }
  }
`

const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
// headless because nothing here watches a transfer, and muted because this is the owner's machine
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })

const arm = async (label, uri, query) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const lines = []
  page.on('console', message => lines.push(message.text()))
  page.on('pageerror', error => lines.push(`pageerror: ${String(error?.message ?? error)}`))

  await page.goto(`${origin}/media/${uri}?${query}`, { waitUntil: 'domcontentloaded' })
  const installed = await page
    .waitForFunction(() => typeof window.__stubGraphQL === 'function', null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
  if (!installed) {
    await context.close()
    return { label, uri, installed: false, lines }
  }

  const result = await page.evaluate(async ([modal, probe, target, settleMs]) => {
    try {
      const answer = await window.__stubGraphQL(
        modal,
        { input: { uri: target }, descriptionInput: { type: 'HTML' } },
        { settleMs }
      )
      const detail = await window.__stubGraphQL(probe, { input: { uri: target } }, { settleMs: 8_000 })
      return { answer, detail }
    } catch (error) {
      return { failed: String(error?.message ?? error) }
    }
  }, [MODAL_DOCUMENT, PROBE_DOCUMENT, uri, SETTLE_MS])

  await context.close()

  const media = result.answer?.last?.data?.media
  const episodes = media?.episodes ?? []
  const originsOf = (episode) => (episode?.handles ?? []).map(handle => handle?.node?.origin).filter(Boolean)
  const counted = (want) => episodes.filter(episode => originsOf(episode).includes(want)).length
  return {
    label,
    uri,
    installed: true,
    failed: result.failed,
    media: media && {
      _id: media._id,
      uri: media.uri,
      handleUris: (media.handles ?? []).map(handle => `${handle.relation}:${handle.node?.uri}`),
    },
    episodes: episodes.length,
    nf: counted('nf'),
    // the controls: an origin that DOES reach the page on both stores, so a zero above is a zero
    // about Netflix and not about the probe
    cr: counted('cr'),
    anizip: counted('anizip'),
    // 1d's probe: Netflix's own season endpoint is the only thing that describes an nf episode
    nfDescribed: (result.detail?.last?.data?.media?.episodes ?? []).filter(episode =>
      (episode?.handles ?? []).some(handle =>
        handle?.node?.origin === 'nf' && (handle?.node?.descriptions ?? []).some(entry => (entry?.description ?? '').trim())
      )
    ).length,
    nfProbed: (result.detail?.last?.data?.media?.episodes ?? []).filter(episode =>
      (episode?.handles ?? []).some(handle => handle?.node?.origin === 'nf')
    ).length,
    // THE CONTROL for the column above: an origin that does describe its episodes. A probe that
    // reports zero for both is a broken probe, not a missing synopsis.
    crDescribed: (result.detail?.last?.data?.media?.episodes ?? []).filter(episode =>
      (episode?.handles ?? []).some(handle =>
        handle?.node?.origin === 'cr' && (handle?.node?.descriptions ?? []).some(entry => (entry?.description ?? '').trim())
      )
    ).length,
    lines,
  }
}

const rows = []
for (const [name, uri] of ROUTES) {
  const graph = await arm(`${name} graph`, uri, 'graph=1&store=graph&export=query')
  const legacy = await arm(`${name} legacy`, uri, 'graph=1&export=query')
  rows.push({ name, uri, graph, legacy })
}

await browser.close()
server.close()

const cell = (result) =>
  !result.installed ? 'NOT INSTALLED'
    : result.failed ? `THREW ${result.failed}`
      : !result.media ? 'NULL media'
        : `${result.nf} of ${result.episodes}`

console.log('')
console.log('| route | graph nf | legacy nf | graph cr | legacy cr | graph nf described | legacy nf described |')
console.log('| --- | --- | --- | --- | --- | --- | --- |')
for (const row of rows) {
  console.log(`| ${row.name} | ${cell(row.graph)} | ${cell(row.legacy)} | ${row.graph.cr} | ${row.legacy.cr} | ${row.graph.nfDescribed} of ${row.graph.nfProbed} (cr control ${row.graph.crDescribed}) | ${row.legacy.nfDescribed} of ${row.legacy.nfProbed} (cr control ${row.legacy.crDescribed}) |`)
}

for (const row of rows) {
  console.log(`\n[${row.name}] ${row.uri}`)
  for (const arm of [row.graph, row.legacy]) {
    console.log(`  ${arm.label}: _id ${arm.media?._id} cluster ${arm.media?.uri}`)
    console.log(`    handles: ${(arm.media?.handleUris ?? []).join(' ')}`)
    if (DUMP_CONSOLE) {
      const pattern = new RegExp(process.env.CONSOLE_GREP ?? 'DIAG|Netflix|netflix|nf:|unogs')
      const interesting = arm.lines.filter(line => pattern.test(line))
      for (const line of interesting.slice(0, 400)) console.log(`    | ${line}`)
    }
  }
}

const zeroed = rows.filter(row => row.graph.nf === 0)
console.log('')
if (zeroed.length) {
  console.log(`FAIL: ${zeroed.length} of ${rows.length} route(s) show no Netflix episode on the graph store: ${zeroed.map(row => row.name).join(' ')}`)
  process.exit(1)
}
console.log('ok: every route shows Netflix episodes on the graph store')
