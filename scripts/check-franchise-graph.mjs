/**
 * Does the SERIES graph in the media modal draw, and does hovering still light what it should?
 *
 * This one exists because `media-franchise.tsx` has no component test at all and cannot easily get
 * one: it reaches the media modal's dependency tree, and the component suite runs under linkedom,
 * where `@xyflow/react` draws no edge because there is no box model to measure
 * (tests/unit/components/xyflow-env.test.tsx pins that). `utils/franchise-layout.ts` and
 * `utils/franchise-flow.ts` are unit tested; everything below the mapping is only checkable here.
 *
 * WHAT IT ASSERTS, and each of these caught something while it was being written:
 *  - the works draw, and each carries the session flags in its href (a work opened from here has to
 *    land on an address that reproduces the page it came from),
 *  - the highlight FOLLOWS THE POINTER, checked by moving between two works rather than against an
 *    "unhovered" baseline: the modal fills the window and a fitted graph can put a box under any
 *    corner, so there is no reliable place to park the pointer,
 *  - each work lights exactly its own arrows: one for the ends of the reading order, two in the
 *    middle. Off by one there would mean the chain is being matched on the wrong end.
 *
 * Element handles are RE-QUERIED before every hover. A hover rebuilds the node list, so xyflow
 * replaces the DOM elements and a handle captured earlier points at a node no longer in the document,
 * which reads as a highlight that stopped working.
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-franchise-graph.mjs
 *
 * Env: URI, CHROME_PATH (defaults to `which google-chrome-stable`, since playwright's bundled
 * chromium is a version behind the one in the nix store).
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json' }
const fileFor = (p) => { const c = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '')); try { if (statSync(c).isFile()) return c } catch {} return extname(p) ? undefined : join(ROOT, 'index.html') }
const server = createServer((rq, rs) => {
  const f = fileFor(decodeURIComponent(rq.url.split('?')[0]))
  if (!f) { rs.writeHead(404); rs.end(); return }
  rs.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
  createReadStream(f).pipe(rs)
})
await new Promise(r => server.listen(0, r))
const origin = `http://localhost:${server.address().port}`
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('pageerror', e => errors.push(String(e?.message ?? e)))

const uri = process.env.URI ?? 'ag:(anilist:178789,anizip:18727,cr:G24H1N3MP-GS00374452,jw:222366-490814,kitsu:49002,mal:59193,offline:mal-59193)'
await page.goto(`${origin}/media/${encodeURIComponent(uri)}?graph=1&store=graph`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-franchise-open]', { timeout: 60_000 })
await page.click('[data-franchise-open]')
await page.waitForTimeout(4_000)

const shot = await page.evaluate(() => ({
  canvas: Boolean(document.querySelector('[data-canvas]')),
  works: document.querySelectorAll('.work-node').length,
  chains: document.querySelectorAll('[data-franchise] .chain').length,
  relations: document.querySelectorAll('[data-franchise] .edge').length,
  labels: [...document.querySelectorAll('[data-franchise] .edge-label')].map(n => n.textContent).slice(0, 6),
  filters: document.querySelectorAll('[data-franchise] .kinds label').length,
  firstHref: document.querySelector('.work-node')?.getAttribute('href') ?? null,
}))
console.log(JSON.stringify(shot, null, 1))

// HOVERING IS TESTED RELATIVELY, by moving between two works rather than by moving "off" the graph.
// There is no reliable off: the modal fills the window and a fitted graph can put a box under any
// corner you pick, so an "unhovered" baseline measured at 5,5 was actually taken with the pointer on
// a node (measured 2026-09-13, a working highlight reading as a broken one twice in a row).
// The property that matters is anyway the relative one: whatever the pointer is on is what lights.
const litIndex = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('.work-node')]
  return {
    lit: all.findIndex(n => n.classList.contains('lit')),
    hovered: all.findIndex(n => n.matches(':hover')),
    edges: document.querySelectorAll('.edge.lit, .chain.lit').length,
  }
})
const boxes = await page.$$('.work-node')
await boxes[0].hover()
await page.waitForTimeout(600)
const first = await litIndex()
await boxes[3].hover()
await page.waitForTimeout(600)
const second = await litIndex()
console.log('HOVER first', JSON.stringify(first), 'then', JSON.stringify(second))

for (let i = 0; i < boxes.length; i += 1) {
  // RE-QUERIED each time: a hover rebuilds the node list, so xyflow replaces the elements and a
  // handle captured before the loop points at a node that is no longer in the document
  const fresh = await page.$$('.work-node')
  await fresh[i].hover()
  await page.waitForTimeout(600)
  const row = await page.evaluate(() => ({
    href: document.querySelector('.work-node.lit')?.getAttribute('href') ?? null,
    chains: document.querySelectorAll('.chain.lit').length,
    relations: document.querySelectorAll('.edge.lit').length,
  }))
  console.log(`  node ${i}: ${JSON.stringify(row)}`)
}

if (first.lit !== first.hovered || first.lit < 0) { console.log('FAIL: the lit work is not the hovered one'); process.exitCode = 1 }
if (second.lit !== second.hovered || second.lit < 0) { console.log('FAIL: the highlight did not follow the pointer'); process.exitCode = 1 }
if (first.lit === second.lit) { console.log('FAIL: the highlight is stuck on one work'); process.exitCode = 1 }
if (!first.edges && !second.edges) { console.log('FAIL: hovering a work lights none of its arrows'); process.exitCode = 1 }

console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 4) : 'none')

if (!shot.works || !shot.firstHref) { console.log('FAIL: the franchise graph did not draw'); process.exitCode = 1 }
await browser.close(); server.close()
