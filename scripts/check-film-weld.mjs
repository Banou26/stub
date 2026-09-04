/**
 * Whether a film still CARRIES its provider links, run against a deployed origin. Not a test: it drives
 * the live site, so it lives here and is run by hand.
 *
 *   node scripts/check-film-weld.mjs https://anime.fkn.app
 *
 * THE CONTRACT THIS CHECKS INVERTED ON 2026-09-05, and the file is worth reading for that alone.
 *
 * It used to assert `crunchyroll.com/series/GQWH0M1GG` was ABSENT from a Dragon Ball Z film's page.
 * That was right for one day: the id names a collection of fifteen films, and while a handle could only
 * ever mean "is the same as", the only honest thing to do with it was drop it, so the link disappeared.
 *
 * A handle is now an EDGE carrying a relation, so the same link is kept as PART_OF: the film IS part of
 * that series, the url renders, and nothing is claimed. So the marker must be PRESENT, and this file
 * asserting its absence would have read as a regression when it is the opposite.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. It reads the rendered html of one page, so it can only answer
 * "is the link there". It CANNOT tell a PART_OF edge from a SAME_AS weld, because both put the same url
 * on the page. That half needs the cluster, which is a different observable:
 *
 *   node scripts/check-welds.mjs      reads `ag:(...)` hrefs, which ARE the cluster, and is proven to
 *                                    produce positives (it found the Mushoku S1+S3 weld on 2026-09-05)
 *
 * Splitting them is deliberate. One check that half-answers two questions is how the address-bar
 * version of this file came to report "no weld" against a build that welded.
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
    // kept as PART_OF: the film is part of that collection, and saying so costs nothing
    want: 'kept',
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
console.log(
  'NOTE: every case here wants the link KEPT, so this run cannot tell a PART_OF edge from a SAME_AS' +
  '\nweld: both put the same url on the page. It answers "did the links survive" and nothing else.' +
  '\nFor the weld itself: node scripts/check-welds.mjs'
)
await browser.close()
process.exit(bad ? 1 : 0)
