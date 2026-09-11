/**
 * Does the built app reach the graph engine behind `?graph`, and leave it alone without it?
 *
 * Two arms, and the second is the control: with the flag the worker must open LadybugDB and fetch
 * the 22 MB engine the vite plugin emits, and without it neither may happen. A check that only ran
 * the first arm could not tell "the flag works" from "the engine loads unconditionally".
 *
 * Run it from inside the repo, against a `vp build` output:
 *   node_modules/.bin/vp build && node scripts/check-graph-engine.mjs
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

import { chromium } from 'playwright'

const ROOT = new URL('../build/', import.meta.url).pathname
const ENGINE = '/lbug_wasm_worker.js'
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
  // clean URLs: a route with no extension falls back to the app shell, as Pages does
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

const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })

/** Loads the app once in a clean context and records what it said and what it asked the server for. */
const arm = async (query, settleMs) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const logs = []
  const engineRequests = []
  page.on('console', message => logs.push(message.text()))
  page.on('response', response => {
    if (new URL(response.url()).pathname === ENGINE) engineRequests.push({ url: response.url(), status: response.status() })
  })

  const started = Date.now()
  await page.goto(`${origin}/${query}`, { waitUntil: 'domcontentloaded' })
  let ready
  for (let waited = 0; waited < settleMs; waited += 250) {
    await page.waitForTimeout(250)
    const line = logs.find(text => text.includes('graph: engine ready'))
    if (line) { ready = { line, at: Date.now() - started }; break }
  }
  if (!ready) await page.waitForTimeout(Math.max(0, settleMs - (Date.now() - started)))
  await context.close()
  return { ready, engineRequests, graphLogs: logs.filter(text => text.startsWith('graph:')) }
}

const failures = []

const on = await arm('?graph=1', 60000)
console.log(`with ?graph=1: ${on.ready ? `"${on.ready.line}" after ${on.ready.at} ms` : 'NO graph line in 60s'}`)
console.log(`  ${ENGINE} requests: ${on.engineRequests.map(entry => `${entry.status} ${entry.url}`).join(', ') || 'none'}`)
if (!on.ready) failures.push('the flagged load never logged "graph: engine ready"')
if (!on.engineRequests.some(entry => entry.status === 200)) failures.push(`the flagged load never fetched ${ENGINE} with a 200`)

// The control waits at least as long as the flagged arm took, so "nothing happened" is a result and
// not just a shorter wait.
const settle = Math.max(15000, (on.ready?.at ?? 0) * 2)
const off = await arm('', settle)
console.log(`without the flag, after ${settle} ms: graph lines ${off.graphLogs.length ? JSON.stringify(off.graphLogs) : 'none'}`)
console.log(`  ${ENGINE} requests: ${off.engineRequests.map(entry => `${entry.status} ${entry.url}`).join(', ') || 'none'}`)
if (off.graphLogs.length) failures.push('the unflagged load touched the graph')
if (off.engineRequests.length) failures.push(`the unflagged load fetched ${ENGINE}`)

await browser.close()
server.close()

if (failures.length) {
  for (const failure of failures) console.log(`FAIL: ${failure}`)
  process.exit(1)
}
console.log('PASS: the engine loads behind ?graph=1 and is untouched without it')
