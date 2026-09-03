/**
 * Whether two runs of one show come back holding the same Crunchyroll handle, run against a deployed
 * origin. Not a test: it drives the live site, so it lives here and is run by hand.
 *
 *   node scripts/check-season-cr-weld.mjs https://anime.fkn.app
 *
 * WHAT IT LOOKS AT. Aggregated uris are rendered into the page as `/media/ag:(origin:id,...)` hrefs,
 * so every handle in a cluster is readable off the DOM. A `cr:` id appearing in TWO different clusters
 * is the weld: `upsertMedia` unions on a shared handle and `graph.link` has no inverse.
 *
 * THE CONTROL IS THE POSITIVE, AND IT IS DEMANDING ON PURPOSE. A run that renders one or two `cr:`
 * handles across eighty clusters has not looked at the phenomenon, it has just failed to reach it, so
 * anything under CR_FLOOR is reported as "could not see" rather than as clean.
 *
 * WHAT THIS CHECK HAS NOT MANAGED TO DO, as of 2026-09-04: reach the JustWatch crunchyroll path at all
 * on the deployed site. The pre-fix build rendered 2 cr handles over 82 clusters and no shared one, and
 * opening two `jw:<node>-<season>` uris directly rendered no crunchyroll url on either. So the weld
 * this file looks for is pinned by src/sources/justwatch/extractor.test.ts, which reproduces it
 * exactly, and is UNMEASURED in production. Do not read a clean run here as evidence of the fix.
 *
 * Headless and muted on purpose: it reads the DOM and nothing else, so it has no business taking a
 * window or making a sound on the owner's machine.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

// multi-season shows JustWatch carries a crunchyroll offer for: 24, 23, 16 and 5 seasons respectively
const QUERIES = ['Naruto Shippuden', 'One Piece', 'Dragon Ball Z', 'Demon Slayer']

/** below this the run has not reached the path, whatever it reports about welds */
const CR_FLOOR = 5

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(no version)')
console.log(`${ORIGIN}  ${version}\n`)

/** cr id -> the distinct clusters holding it */
const held = new Map()
let clusters = 0
for (const query of QUERIES) {
  await page.goto(`${ORIGIN}/search/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(16000)
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => a.getAttribute('href')))])
  clusters += hrefs.length
  for (const href of hrefs) {
    const uri = decodeURIComponent(href ?? '')
    for (const cr of uri.match(/cr:[^,)]+/g) ?? []) {
      if (!held.has(cr)) held.set(cr, new Set())
      held.get(cr).add(uri)
    }
  }
  console.log(`  "${query}" -> ${hrefs.length} clusters`)
}

const welds = [...held.entries()].filter(([, uris]) => uris.size > 1)
console.log(`\n${clusters} clusters seen, ${held.size} distinct cr handles among them`)
if (held.size < CR_FLOOR) {
  console.log(
    `CONTROL FAILED: ${held.size} cr handles rendered, under the floor of ${CR_FLOOR}.` +
    `\nThis run did not reach the crunchyroll path, so it can say nothing about a weld either way.`
  )
  await browser.close()
  process.exit(2)
}
console.log(`control: ${held.size} cr handles rendered, so a shared one would have been visible`)
for (const [cr, uris] of welds) {
  console.log(`\nWELD ${cr} is in ${uris.size} clusters:`)
  for (const uri of uris) console.log(`   ${uri.replace('/media/', '')}`)
}
console.log(welds.length ? `\n${welds.length} cr handle(s) shared across clusters` : '\nno cr handle is shared across two clusters')

await browser.close()
process.exit(welds.length ? 1 : 0)
