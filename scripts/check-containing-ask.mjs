/**
 * Does a run Netflix folded into a longer season get that season ATTACHED as its container?
 *
 * The deliverable of the `containing` half of 4.4 is not a green test: it is `nf:80987039-1` reaching
 * the season 1 and season 2 clusters as a container, with the `Ask` log saying `containing`. So this
 * drives the real route, then clicks the page's own trace link and reads the panel's own words.
 *
 * Modelled on `scripts/check-netflix-episodes.mjs`: static server over `build/`, headless muted
 * Chrome, the client's own documents through `window.__stubGraphQL`. The trace is read by CLIENT-SIDE
 * navigation inside the same document, because the graph is `:memory:` per worker and a fresh load
 * would show an empty one.
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-containing-ask.mjs
 *
 * Env: SETTLE_MS, ROUTES (semicolon separated uris), CONSOLE=1 to dump the similarMedia lines.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
const DEFAULT_ROUTES = [
  ['s1', 'ag:(anilist:108465)'],
  ['s2', 'ag:(anilist:127720)'],
  ['s3', 'ag:(anilist:178789,anizip:18727,cr:G24H1N3MP-GS00374452,jw:222366-490814,kitsu:49002,mal:59193,offline:mal-59193)'],
]
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(';').map((uri, index) => [`r${index}`, uri])
  : DEFAULT_ROUTES
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 45_000)
const DUMP_CONSOLE = process.env.CONSOLE === '1'

const TYPES = {
  '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.json': 'application/json', '.map': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
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

const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
// headless because nothing here watches a transfer, and muted because this is the owner's machine
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })

const arm = async (label, uri) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const lines = []
  page.on('console', message => lines.push(message.text()))
  page.on('pageerror', error => lines.push(`pageerror: ${String(error?.message ?? error)}`))

  // `export=query` for the probe, `export=answers` for the Ask log, `trace=1` for the panel's link:
  // three flags on one page, each publishing exactly one thing (utils/export-flag.ts)
  await page.goto(`${origin}/media/${uri}?graph=1&store=graph&trace=1&export=query&export=answers`, { waitUntil: 'domcontentloaded' })
  const installed = await page
    .waitForFunction(() => typeof window.__stubGraphQL === 'function', null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
  if (!installed) {
    await context.close()
    return { label, uri, installed: false, lines }
  }

  // the two reads are separate on purpose: a missing Ask hook must not cost the media read, which is
  // the half that says whether the container reached the page at all
  const read = await page.evaluate(async ([modal, target, settleMs]) => {
    try {
      const answer = await window.__stubGraphQL(modal, { input: { uri: target }, descriptionInput: { type: 'HTML' } }, { settleMs })
      return { media: answer?.last?.data?.media }
    } catch (error) {
      return { failed: String(error?.message ?? error) }
    }
  }, [MODAL_DOCUMENT, uri, SETTLE_MS])
  const asks = await page.evaluate(async () => {
    if (typeof window.__stubExportAsks !== 'function') return { failed: 'no __stubExportAsks on this page' }
    try {
      return { rows: await window.__stubExportAsks() }
    } catch (error) {
      return { failed: String(error?.message ?? error) }
    }
  })

  // THE PANEL'S OWN WORDS, reached by the page's own trace link: a fresh load would open a worker
  // whose graph is empty, since the engine is `:memory:`.
  let panel
  try {
    await page.click('[data-trace-link]', { timeout: 15_000 })
    await page.waitForSelector('text=/attach|cluster|nothing/i', { timeout: 20_000 })
    await page.waitForTimeout(2_000)
    panel = { url: page.url(), text: await page.innerText('body') }
  } catch (error) {
    panel = { failed: String(error?.message ?? error) }
  }

  await context.close()
  return { label, uri, installed: true, failed: read.failed, media: read.media, asks, panel, lines }
}

const rows = []
for (const [name, uri] of ROUTES) rows.push(await arm(name, uri))

await browser.close()
server.close()

const sectionOf = (text, heading) => {
  const lines = (text ?? '').split('\n')
  const start = lines.findIndex(line => line.trim().toLowerCase().startsWith(heading.toLowerCase()))
  return start === -1 ? [] : lines.slice(start, start + 40)
}

for (const row of rows) {
  console.log(`\n=== [${row.label}] ${row.uri}`)
  if (!row.installed) { console.log('  NOT INSTALLED'); continue }
  if (row.failed) console.log(`  READ THREW ${row.failed}`)
  const handles = (row.media?.handles ?? []).map(handle => `${handle.relation}:${handle.node?.uri}`)
  console.log(`  cluster ${row.media?.uri}`)
  console.log(`  handles ${handles.join(' ') || '(none)'}`)
  if (row.asks?.failed) console.log(`  ASKS ${row.asks.failed}`)
  const rows = row.asks?.rows
  for (const ask of (Array.isArray(rows) ? rows : rows?.asks ?? [])) {
    console.log(`  ask ${ask.origin} ${ask.showId}: ${ask.outcome} ${ask.reason}`)
  }
  if (process.env.PANEL_OUT) {
    writeFileSync(`${process.env.PANEL_OUT}/${row.label}.txt`, row.panel?.text ?? String(row.panel?.failed))
  }
  if (row.panel?.failed) console.log(`  PANEL ${row.panel.failed}`)
  else {
    console.log(`  panel ${row.panel.url}`)
    for (const heading of ['attachments', 'claims', 'asks']) {
      const section = sectionOf(row.panel.text, heading)
      if (section.length) console.log(section.map(line => `    | ${line}`).join('\n'))
    }
  }
  if (DUMP_CONSOLE) {
    const pattern = new RegExp(process.env.CONSOLE_GREP ?? 'similarMedia|containingMedia')
    for (const line of row.lines.filter(line => pattern.test(line)).slice(0, 200)) console.log(`    > ${line}`)
  }
}
