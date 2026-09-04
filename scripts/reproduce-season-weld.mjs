/**
 * Reproduce the Mushoku Tensei season 1 + season 3 weld on a deployed build, and separate the SEED
 * from the RATCHET.
 *
 *   node scripts/reproduce-season-weld.mjs https://anime.fkn.app
 *
 * WHY TWO ARMS. `scripts/check-welds.mjs` finds the weld but not where it came from: by the time it
 * looks, eight searches and two dozen media pages have been opened. These arms cut that down until only
 * the step that matters is left.
 *
 *   ARM A  SEARCH ONLY. No media page is opened, so no source runs getMedia and nothing is minted by
 *          the media path. Measured 2026-09-05 and this is the finding: season 1's cluster ALREADY
 *          holds the bare `cr:G24H1N3MP` and the bare `nf:80987039` straight out of search.
 *
 *              S1  ag:(anilist:108465,cr:G24H1N3MP,kitsu:42323,mal:39535,nf:80987039,tvmaze:52279)
 *              S3  ag:(anilist:178789,kitsu:49002,mal:59193,offline:mal-59193)
 *
 *          Two show-level ids, linked SAME_AS, in a cour's cluster. Membership of an `ag:` uri means
 *          SAME_AS by construction: a PART_OF handle rides a directed edge and never appears there.
 *
 *   ARM B  then open those AGGREGATED uris. The two clusters become one, twenty members, with seven
 *          origins each holding two disagreeing ids.
 *
 * WHAT THAT SEPARATES. The seed is on the SEARCH path and the ratchet is on the media path.
 * `buildHandlesFromUri` and `mergeHandles` are both gated on `isAggregatedUri`, so opening a BARE uri
 * never engages the re-assert path: an earlier version of this file opened `/media/anilist:108465`
 * directly, found nothing, and would have reported the weld gone. Opening the `ag:(...)` uri that
 * search actually links to is what reproduces it.
 *
 * ONE PAGE LOAD PER ARM. The store lives in the page's worker and a reload wipes it, so navigation is
 * client side.
 *
 * Headless and muted: it reads the DOM and nothing else.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

const S1 = 'anilist:108465'
const S3 = 'anilist:178789'
/** the two show-level ids that do the welding, neither of which names a run */
const SHOW_LEVEL = ['cr:G24H1N3MP', 'nf:80987039']

const membersOf = ag => ag.replace(/^ag:\(|\)$/g, '').split(',').filter(Boolean)

const session = async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
  const page = await browser.newPage()
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  const clusters = new Set()
  const collect = async () => {
    for (const href of await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')))
    )) clusters.add(href.replace('/media/', ''))
  }
  const go = async path => {
    await page.evaluate(url => {
      history.pushState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    await page.waitForTimeout(11000)
    await collect()
  }
  return { browser, page, clusters, go }
}

const version = await (async () => {
  const { browser, page } = await session()
  const v = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
  await browser.close()
  return v
})()
console.log(`${ORIGIN}  ${version}\n`)

/* ------------------------------------------------------------------ ARM A */

const a = await session()
await a.go('/search/' + encodeURIComponent('Mushoku Tensei'))
const seasonClusters = [...a.clusters].filter(ag => {
  const m = membersOf(ag)
  return m.includes(S1) || m.includes(S3)
})
console.log(`ARM A, search only: ${a.clusters.size} clusters, ${seasonClusters.length} holding a Mushoku season`)
for (const ag of seasonClusters) console.log(`   ${ag}`)

const seeded = seasonClusters.filter(ag => SHOW_LEVEL.some(id => membersOf(ag).includes(id)))
console.log(
  seeded.length
    ? `\n   SEED: ${seeded.length} of those already hold a SHOW-level id, minted on the search path`
    : '\n   no show-level id in either cluster out of search'
)
await a.browser.close()

/* ------------------------------------------------------------------ ARM B */

const b = await session()
await b.go('/search/' + encodeURIComponent('Mushoku Tensei'))
for (const ag of [...b.clusters].filter(ag => membersOf(ag).some(m => m === S1 || m === S3))) await b.go('/media/' + ag)

const welded = [...b.clusters].filter(ag => {
  const m = membersOf(ag)
  return m.includes(S1) && m.includes(S3)
})
console.log(`\nARM B, then opening those aggregated uris: ${b.clusters.size} clusters`)
for (const ag of welded) console.log(`   WELD ${ag}`)
await b.browser.close()

// The control is ARM A finding both seasons at all. If search stops returning them, ARM B has nothing
// to open and a quiet run says only that the corpus moved.
if (!seasonClusters.length) {
  console.log('\nCONTROL FAILED: search returned no Mushoku season, so neither arm looked at anything')
  process.exit(2)
}
console.log(welded.length ? `\n${welded.length} weld reproduced` : '\nno weld reproduced')
process.exit(welded.length ? 1 : 0)
