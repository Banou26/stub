/**
 * Whether a film's page still carries a Crunchyroll link that names the SERIES, run against a deployed
 * origin. Not a test: it drives the live site, so it lives here and is run by hand.
 *
 *   node scripts/check-film-weld.mjs https://anime.fkn.app
 *
 * WHAT IT LOOKS AT, and why not the url. `streamHandles` runs in kitsu's `getMedia`, so a film's
 * crunchyroll handle is minted when its page is opened, and the source row it produces renders the
 * link verbatim in the html. The route keeps the uri that was asked for, so watching the address bar
 * proves nothing: an earlier version of this file did exactly that and reported no weld against the
 * UNFIXED build, which is a check that cannot produce a positive.
 *
 * THE CONTROL IS THE SECOND FILM. Koe no Katachi's link is netflix.com/title/80223226, which names the
 * film itself and must survive. A run where both films go quiet has lost the page, not fixed the bug.
 *
 * Headless and muted on purpose: it reads the DOM and nothing else, so it has no business taking a
 * window or making a sound on the owner's machine.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

const CASES = [
  {
    uri: 'kitsu:794',
    name: 'Dragon Ball Z Movie 01, one of fifteen films on one /series/ page',
    marker: 'crunchyroll.com/series/GQWH0M1GG',
    want: 'gone',
  },
  {
    uri: 'kitsu:10028',
    name: 'Koe no Katachi, whose netflix link names the film itself',
    marker: 'netflix.com/title/80223226',
    want: 'kept',
  },
]

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(no version on page)')
console.log(`${ORIGIN}  ${version}\n`)

let bad = 0
for (const { uri, name, marker, want } of CASES) {
  await page.goto(`${ORIGIN}/media/${uri}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(12000)
  const found = await page.evaluate(m => document.documentElement.outerHTML.includes(m), marker)
  const ok = want === 'kept' ? found : !found
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'BAD '} ${uri}  ${name}`)
  console.log(`       ${marker}  ${found ? 'PRESENT' : 'absent'}   (wanted ${want})`)
}

console.log(`\n${bad === 0 ? 'both cases as wanted' : `${bad} case(s) wrong`}`)
await browser.close()
process.exit(bad ? 1 : 0)
