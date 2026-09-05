/**
 * Does the homepage hero render before any live source answers?
 *
 * `theaterCandidates` (src/utils/theater.ts) keeps only media carrying BOTH titles and
 * shortDescriptions, and manami has no synopsis, so the hero sat empty on a cold load until AniList
 * or Jikan replied. Since 2026-09-06 the bundle carries MyAnimeList's synopsis and trailer for the
 * current season, fetched at build time, so the hero should paint immediately.
 *
 * Reads the hero's title and description within the first seconds, then again once settled. A hero
 * that is empty early and full later is the bug this exists to catch.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

// `.theater` is the hero's own class (src/router/home/theater.tsx), and the title and description are
// the two fields `theaterCandidates` selects on. A comma list of guesses is what NOT to use here: it
// matched the site nav first and reported the word "stub" for both states (2026-09-06).
const hero = page => page.evaluate(() => {
  const root = document.querySelector('.theater')
  const read = selector => (root?.querySelector(selector)?.textContent ?? '').trim().replace(/\s+/g, ' ')
  return {
    title: read('.title'),
    description: read('.short-description'),
    hasVideo: Boolean(root?.querySelector('iframe[src*="youtube"], video')),
  }
})

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()
const started = Date.now()
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })

let cold = { title: '', description: '' }
let coldAt
for (let waited = 0; waited < 6000; waited += 200) {
  await page.waitForTimeout(200)
  cold = await hero(page)
  if (cold.title && cold.description) { coldAt = Date.now() - started; break }
}
await page.waitForTimeout(14000)
const settled = await hero(page)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
await browser.close()

console.log(`${ORIGIN}  ${version}`)
console.log(`\nCOLD${coldAt ? ` at ${coldAt}ms` : ' (never filled within 6s)'}:\n  title: ${cold.title || '(empty)'}\n  desc:  ${(cold.description || '(empty)').slice(0, 90)}`)
console.log(`\nSETTLED:\n  title: ${settled.title || '(empty)'}\n  desc:  ${(settled.description || '(empty)').slice(0, 90)}`)
console.log(`\ntrailer playing cold: ${cold.hasVideo}, settled: ${settled.hasVideo}`)

if (!settled.title || !settled.description) {
  console.log('\nCONTROL FAILED: the hero is empty even settled, so the selector or the page is wrong')
  process.exit(2)
}
if (!coldAt) {
  console.log('\nFAIL: the hero was still empty after 6s and only filled once a live source answered')
  process.exit(1)
}
console.log('\nPASS: the hero painted from the bundle')
