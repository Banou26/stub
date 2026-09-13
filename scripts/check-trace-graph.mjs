/**
 * Does the trace panel's graph actually DRAW, in a real browser?
 *
 * It exists because the unit suite structurally cannot answer that. `@xyflow/react` derives every
 * edge from measured handle boxes, and the component tests run under linkedom, which has no box
 * model: there the graph renders its nodes and NO edges, whatever the code does
 * (tests/unit/components/xyflow-env.test.tsx pins exactly that). So the one question this script
 * asks is the one no test can: nodes, edges, their paths, and the legend, on the built app.
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-trace-graph.mjs
 *
 * Env: URI (the cluster to trace), SETTLE_MS (how long to wait for the sources to warm),
 * CHROME_PATH (defaults to whatever `which google-chrome-stable` finds, the same as
 * check-netflix-episodes.mjs, because playwright's own bundled chromium is a version behind the one
 * in the nix store and fails with "Executable doesn't exist").
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json' }
const fileFor = (pathname) => {
  const candidate = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  try { if (statSync(candidate).isFile()) return candidate } catch {}
  return extname(pathname) ? undefined : join(ROOT, 'index.html')
}
const server = createServer((request, response) => {
  const file = fileFor(decodeURIComponent(request.url.split('?')[0]))
  if (!file) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
})
await new Promise(resolve => server.listen(0, resolve))
const origin = `http://localhost:${server.address().port}`

const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('pageerror', e => errors.push(String(e?.message ?? e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })

const uri = process.env.URI ?? 'ag:(anilist:178789,anizip:18727,cr:G24H1N3MP-GS00374452,jw:222366-490814,kitsu:49002,mal:59193,offline:mal-59193)'
await page.goto(`${origin}/debug/trace?uri=${encodeURIComponent(uri)}&graph=1`, { waitUntil: 'domcontentloaded' })

const deadline = Date.now() + Number(process.env.SETTLE_MS ?? 90_000)
let shot = {}
while (Date.now() < deadline) {
  await page.waitForTimeout(3_000)
  shot = await page.evaluate(() => ({
    graphBox: Boolean(document.querySelector('[data-trace-graph]')),
    nodes: document.querySelectorAll('.react-flow__node').length,
    edges: document.querySelectorAll('.react-flow__edge').length,
    edgePaths: document.querySelectorAll('.react-flow__edge-path, [data-trace-graph] .edge').length,
    crosses: document.querySelectorAll('[data-trace-graph] .cross-mark').length,
    kinds: [...document.querySelectorAll('[data-node]')].map(n => n.getAttribute('data-kind')),
    legend: document.querySelectorAll('[data-trace-graph] .legend div').length,
    firstEdgeD: document.querySelector('[data-trace-graph] .edge')?.getAttribute('d') ?? null,
  }))
  if (shot.nodes > 0 && shot.edges > 0) break
}
const tally = {}
for (const k of shot.kinds ?? []) tally[k] = (tally[k] ?? 0) + 1
console.log(JSON.stringify({ ...shot, kinds: tally }, null, 1))
console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 4) : 'none')
await browser.close()
server.close()

// a graph that drew no node at all is a failure and has to exit non-zero, or this script joins the
// long list of checks in this repo that reported success while measuring nothing
if (!shot.graphBox || !shot.nodes) {
  console.log('FAIL: the panel drew no graph')
  process.exitCode = 1
}
