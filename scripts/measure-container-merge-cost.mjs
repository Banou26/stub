/**
 * What a CONTAINER classification would cost, measured on a deployed build rather than argued about.
 *
 *   node scripts/measure-container-merge-cost.mjs https://anime.fkn.app
 *
 * THE QUESTION. A bare `cr:<series>` names a Crunchyroll SERIES and a bare `nf:<digits>` names a
 * Netflix TITLE. Neither names a run, so classifying them CONTAINER stops the fuzzy title merge from
 * unioning them into a cour's cluster. That is the fix for the Mushoku season 1 + season 3 weld
 * (scripts/reproduce-season-weld.mjs), and it is not free: most anime are ONE season, and for those
 * the same union is correct and is how the Crunchyroll play button reaches the page.
 *
 * So this counts the population the change touches and splits it into the two halves:
 *
 *   AFFECTED   a cluster holding a bare show-level id alongside a member from another origin. This
 *              union only exists because something asserted sameness, so it is what the change stops.
 *   WELDED     of those, the ones ALREADY carrying two disagreeing ids of one origin, which is a
 *              cluster the change repairs rather than costs.
 *   CLEAN      the remainder: a merge that looks correct today and would be demoted to PART_OF, so
 *              the link survives on the page while the identity claim does not.
 *
 * A prefix extension is not a weld: `cr:X` and `cr:X-Y` are the series and one of its seasons, which
 * is the very pair PART_OF is for. `scripts/check-welds.mjs` excludes it for the same reason.
 *
 * SEARCH ONLY, one page load. No media page is opened, so nothing runs getMedia and no source mints
 * a handle: every cluster read here was formed by the fuzzy title merge alone, which is the path under
 * test. The store lives in the page's worker and a reload wipes it, so navigation is client side.
 *
 * The control is the cluster count. A run that reads fewer than MIN_CLUSTERS looked at nothing and
 * says so rather than reporting a comfortable zero.
 *
 * Headless and muted: it reads the DOM and nothing else.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const MIN_CLUSTERS = 20

// a spread of one-season and many-season franchises, so the exchange rate is not measured on one half
const QUERIES = [
  'Mushoku Tensei', 'Frieren', 'Bocchi the Rock', 'Attack on Titan', 'Demon Slayer',
  'Spy x Family', 'Chainsaw Man', 'Oshi no Ko', 'Vinland Saga', 'Jujutsu Kaisen',
  'Konosuba', 'Re:Zero', 'Dr. Stone', 'Mob Psycho', 'Odd Taxi', 'Sakamoto Days',
]

/** a show-level id: crunchyroll series with no season guid, netflix title with no season suffix */
const isShowLevel = uri => /^cr:[^-]+$/.test(uri) || /^nf:\d+$/.test(uri)
const membersOf = ag => ag.replace(/^ag:\(|\)$/g, '').split(',').filter(Boolean)
const originOf = uri => uri.slice(0, uri.indexOf(':'))
const idOf = uri => uri.slice(uri.indexOf(':') + 1)
const isPrefixExtension = (a, b) => a.startsWith(`${b}-`) || b.startsWith(`${a}-`)

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
console.log(`${ORIGIN}  ${version}\n`)

const clusters = new Set()
for (const query of QUERIES) {
  await page.evaluate(url => {
    history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, '/search/' + encodeURIComponent(query))
  await page.waitForTimeout(9000)
  for (const href of await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')))
  )) clusters.add(href.replace('/media/', ''))
  process.stdout.write(`  ${query}: ${clusters.size} clusters so far\n`)
}
await browser.close()

let affected = 0, welded = 0, clean = 0
const affectedClusters = []
const examples = { welded: [], clean: [] }

for (const ag of clusters) {
  const members = membersOf(ag)
  const shown = members.filter(isShowLevel)
  if (!shown.length) continue
  // a lone show-level id in a cluster of its own was never merged with anything, so nothing changes
  if (!members.some(m => !shown.includes(m))) continue
  affected++
  affectedClusters.push(ag)

  const byOrigin = new Map()
  for (const m of members) {
    const list = byOrigin.get(originOf(m)) ?? []
    list.push(idOf(m))
    byOrigin.set(originOf(m), list)
  }
  const hasWeld = [...byOrigin.values()].some(ids =>
    ids.some((a, i) => ids.slice(i + 1).some(b => !isPrefixExtension(a, b)))
  )
  if (hasWeld) { welded++; if (examples.welded.length < 3) examples.welded.push(ag) }
  else { clean++; if (examples.clean.length < 3) examples.clean.push(ag) }
}

console.log(`\n${clusters.size} clusters read over ${QUERIES.length} searches`)
if (clusters.size < MIN_CLUSTERS) {
  console.log(`CONTROL FAILED: under ${MIN_CLUSTERS} clusters, so this run looked at nothing`)
  process.exit(2)
}
console.log(`
  affected   ${affected}\t clusters where a bare show-level id sits with another origin
    welded   ${welded}\t of those ALREADY carry two disagreeing ids of one origin  (change REPAIRS)
    clean    ${clean}\t of those look correct today                                (change DEMOTES to PART_OF)
`)
for (const ag of examples.welded) console.log(`  WELDED  ${ag}`)
for (const ag of examples.clean) console.log(`  CLEAN   ${ag}`)

/* ------------------------------------------------------- what the demotion actually costs */

// A demoted link still renders, but only a SAME_AS member contributes episodes, so the play button
// follows the identity claim. The claim is only worth keeping if nothing else supplies it, and each
// of these sources has a PRECISE path of its own: crunchyroll matches a season on title plus air date
// inside 45 days, unogs resolves a season number and scopes the uri to it. If that path mints a
// season-scoped handle when the page opens, the demotion costs a search-result merge and no playback.
//
// So: open each affected cluster and count whether a season-scoped id of the same origin arrives.
const scoped = uri => /^cr:[^-]+-.+$/.test(uri) || /^nf:\d+-\d+$/.test(uri)

const b = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const p2 = await b.newPage()
await p2.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
await p2.waitForTimeout(6000)

let recovered = 0, lost = 0, controlLeak = 0
const lostExamples = []
for (const ag of affectedClusters) {
  await p2.evaluate(url => {
    history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, '/media/' + ag)
  await p2.waitForTimeout(11000)
  const after = await p2.evaluate(() =>
    [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')).replace('/media/', ''))
  )
  // the cluster this one GREW INTO, not merely some cluster on the page: after a merge the aggregated
  // uri is a different string, so it is found by the members it kept rather than by its name
  const kept = new Set(membersOf(ag))
  const grown = after.filter(a => membersOf(a).some(m => kept.has(m))).flatMap(membersOf)

  const wantOrigins = new Set(membersOf(ag).filter(isShowLevel).map(originOf))
  const got = [...wantOrigins].filter(o => grown.some(m => originOf(m) === o && scoped(m)))
  if (got.length === wantOrigins.size) recovered++
  else { lost++; if (lostExamples.length < 5) lostExamples.push(`${ag}  missing scoped: ${[...wantOrigins].filter(o => !got.includes(o)).join(',')}`) }

  // THE CONTROL. anilist is per-run by construction and mints no season-scoped shape at all, so
  // asking the same question about it MUST come back empty. A run where this rises above zero is
  // reading something other than what it thinks, and a run where the arm above scores 100% while
  // this one also does has proved only that the predicate matches everything.
  if (grown.some(m => originOf(m) === 'anilist' && scoped(m))) controlLeak++
  process.stdout.write(`  opened ${recovered + lost}/${affectedClusters.length}\r`)
}
await b.close()

console.log(`\n\nOpening each affected cluster, does the source's own precise path mint a season-scoped id?
  recovered  ${recovered}\t every show-level origin also produced a season-scoped id, so the demotion costs no playback
  lost       ${lost}\t no season-scoped id arrived, so the demoted link is all that survives
`)
for (const e of lostExamples) console.log(`  LOST  ${e}`)

console.log(
  controlLeak === 0
    ? `\n  control ok: 0 clusters reported a season-scoped anilist id, which is a shape anilist never mints`
    : `\n  CONTROL FAILED: ${controlLeak} clusters reported a season-scoped anilist id, so the predicate matches too much`
)
if (controlLeak) process.exit(2)
