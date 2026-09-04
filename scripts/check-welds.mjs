/**
 * Find welds on a deployed build, by reading clusters straight out of the page.
 *
 *   node scripts/check-welds.mjs https://anime.fkn.app
 *
 * HOW A WELD IS VISIBLE AT ALL. `buildAggregatedIdentity` joins a cluster's sorted uris into
 * `ag:(<uri>,<uri>,...)`, and the router renders that as an href. So every `ag:` link on a page is a
 * complete cluster readout: the store, serialized, for free.
 *
 * There is no other way in. `src/urql.ts` points the client at `http://d/graphql` and overrides
 * `fetch` with an in-process `handleRequest`, so the worker has NO http endpoint to query, and the
 * client is not on `window`.
 *
 * WHAT COUNTS AS A WELD. Two ids of the SAME ORIGIN inside one cluster. Every media here is one
 * broadcast run, and an origin names one thing per run, so two of them is two runs claiming to be one.
 *
 * The one legitimate exception is a season-scoped id sitting beside the show-level id it extends:
 * `cr:G24H1N3MP` and `cr:G24H1N3MP-GS00374452`. `utils/uri.ts` calls that PREFIX EXTENSION and treats
 * it as specificity rather than disagreement, so it is excluded here on the same rule.
 *
 * ONE PAGE LOAD ONLY. The store lives in the page's worker and a full reload wipes it, so navigation is
 * client side. Welds also only FORM on a media page, because that is where a source fetches and mints
 * handles; a listing page alone accumulates nothing.
 *
 * Headless and muted: it reads the DOM and nothing else.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

const QUERIES = [
  'Mushoku Tensei', 'Dragon Ball Z Movie', 'Demon Slayer', 'One Piece Film',
  'Attack on Titan', 'JoJo Bizarre Adventure', 'Fate stay night', 'Monogatari',
]

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
console.log(`${ORIGIN}  ${version}\n`)

const go = async path => {
  await page.evaluate(url => {
    history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(10000)
}

const clusters = new Set()
const collect = async () => {
  for (const href of await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')))
  )) clusters.add(href.replace('/media/', ''))
}

await collect()
for (const query of QUERIES) {
  await go('/search/' + encodeURIComponent(query))
  await collect()
  // opening the first few results is what makes their sources mint handles at all
  const hrefs = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href*="/media/"]')].map(a => a.getAttribute('href')))].slice(0, 3)
  )
  for (const href of hrefs) { await go(href); await collect() }
}

const membersOf = ag => ag.replace(/^ag:\(|\)$/g, '').split(',').filter(Boolean)
const originOf = uri => uri.slice(0, uri.indexOf(':'))
const idOf = uri => uri.slice(uri.indexOf(':') + 1)
/** `<a>` against `<a>-<something>` is specificity, not disagreement. See utils/uri.ts mostSpecific. */
const extendsOther = (a, b) => a.startsWith(`${b}-`) || b.startsWith(`${a}-`)

const welds = []
for (const ag of clusters) {
  const byOrigin = new Map()
  for (const uri of membersOf(ag)) {
    const origin = originOf(uri)
    if (!byOrigin.has(origin)) byOrigin.set(origin, [])
    byOrigin.get(origin).push(idOf(uri))
  }
  for (const [origin, ids] of byOrigin) {
    if (ids.length < 2) continue
    const disagreeing = ids.filter(id => !ids.some(other => other !== id && extendsOther(id, other)))
    if (disagreeing.length > 1) welds.push({ origin, ids: disagreeing.sort(), ag })
  }
}

// A cluster GROWS during the sweep as more pages are opened, so the same weld is read several times
// off successively larger ag uris. Dedupe on the pair itself, not on the uri it was found in.
const unique = [...new Map(welds.map(weld => [`${weld.origin}\0${weld.ids.join(',')}`, weld])).values()]

console.log(`${clusters.size} clusters read`)
if (clusters.size < 10) {
  console.log(`CONTROL FAILED: only ${clusters.size} clusters seen, which is too few to say anything.`)
  await browser.close()
  process.exit(2)
}
console.log(`control: ${clusters.size} clusters is enough for a weld to have been visible\n`)

for (const weld of unique) {
  console.log(`WELD  ${weld.origin}: ${weld.ids.join(' + ')}`)
  console.log(`      in ${weld.ag.slice(0, 150)}${weld.ag.length > 150 ? '...' : ''}`)
}
console.log(unique.length ? `\n${unique.length} distinct weld(s)` : '\nno cluster holds two disagreeing ids of one origin')

await browser.close()
process.exit(unique.length ? 1 : 0)
