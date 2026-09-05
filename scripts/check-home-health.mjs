/**
 * Does the home page still render its season listing when the seed asset is absent?
 *
 * The seeded half of the offline source fetches a release asset that does not exist until the first
 * scheduled walk publishes one. Every failure path is meant to leave the BUNDLED answer standing, so
 * before the first publish the page must look exactly as it did. This reads the card count and the
 * time the first card appears, and fails if the listing is empty.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()
const seedRequests = []
page.on('request', request => { if (/season-seed/.test(request.url())) seedRequests.push(request.url()) })
const started = Date.now()
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
let firstAt
for (let waited = 0; waited < 30000; waited += 500) {
  await page.waitForTimeout(500)
  const count = await page.evaluate(() => document.querySelectorAll('a[href*="/media/ag:"]').length)
  if (count > 0) { firstAt = Date.now() - started; break }
}
await page.waitForTimeout(10000)
const cards = await page.evaluate(() => document.querySelectorAll('a[href*="/media/ag:"]').length)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
await browser.close()

console.log(`${ORIGIN}  ${version}`)
console.log(`first card at ${firstAt ?? 'never'}${firstAt ? 'ms' : ''}, ${cards} cards after 10s more`)
console.log(`season-seed requests seen from the page: ${seedRequests.length}${seedRequests.length ? ' ' + seedRequests[0] : ' (the asset ride the relay, so zero here is expected)'}`)
if (!cards) {
  console.log('FAIL: the listing is empty, so the seeded half broke the bundled answer')
  process.exit(1)
}
console.log('PASS: the bundled listing renders with no seed published')
