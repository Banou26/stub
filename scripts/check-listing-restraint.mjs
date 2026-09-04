/**
 * Does the root request context actually reach a source and change what it spends?
 *
 *   node scripts/check-listing-restraint.mjs https://anime.fkn.app
 *
 * THE ONE CONSUMER, and therefore the whole observable. justwatch's `mediaPage` maps every search hit
 * through `normalizeMedia` -> `buildOffersAsHandles`, and a film result with a Crunchyroll offer used
 * to call `resolveEpisodeToSeriesId` (justwatch/extractor.ts:305) to turn a /watch/ url into a series
 * id. That is a Crunchyroll token plus a CMS request PER RESULT, and nothing on a results page reads
 * the id it produces. With a context saying MEDIA_PAGE, the offer keeps its url and skips the call.
 *
 * WHAT THAT LOOKS LIKE FROM OUTSIDE. The id justwatch minted was a `cr:<series>-<season>` handle, and a
 * SAME_AS handle joins the cluster, so it appears in the `ag:(...)` uri the page links to. So:
 *
 *   LISTING   search a film. No `cr:` id contributed by justwatch's offer path.
 *   DETAIL    open that film's page. The id comes back, because a detail view is what it is for.
 *
 * THE CONTROL IS THE DETAIL ARM, and it is not optional. A listing arm that finds nothing proves the
 * context worked OR that the reader is broken, that justwatch returned no film, that the offer had no
 * Crunchyroll link, or that the deploy never landed. Only the detail arm finding the SAME id turns the
 * listing's silence into evidence. A run where BOTH arms are empty reports that it measured nothing.
 *
 * ONE FRESH SESSION PER FILM, and that is not a detail. The store lives in the page's worker and
 * accumulates across client-side navigations, so a session that searched five titles reports the union
 * of all five. The first version of this file did exactly that and reported the SAME sixteen Mushoku
 * Tensei ids for "Your Name" and for "Jujutsu Kaisen 0", neither of which has anything to do with
 * either. A reload wipes the store, which is the isolation this needs.
 *
 * Headless and muted: it reads the DOM and nothing else.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

// films, because `showRequiresSeason` already refuses every series result on the justwatch search path,
// so a film is the only kind whose offers reach the Crunchyroll branch at all
const FILMS = ['A Silent Voice', 'Suzume', 'Your Name', 'Jujutsu Kaisen 0', 'Belle']

const membersOf = ag => ag.replace(/^ag:\(|\)$/g, '').split(',').filter(Boolean)

// ATTRIBUTION, and without it this file counts the wrong source. justwatch's offer path can only ever
// produce a TWO SEGMENT id, because it builds one with `crunchyrollId(resolved.seriesId,
// resolved.seasonId)` (justwatch/extractor.ts:306). A BARE `cr:<series>` is Crunchyroll's own search
// row, minted per hit by its `mediaPage` resolver (crunchyroll/extractor.ts:443), and has nothing to do
// with the path under test. Counting both reported `cr:GRDV0019R` against justwatch on 2026-09-05.
//
// On a LISTING that makes two segments decisive: crunchyroll's own two-segment ids come from
// `getMedia`, which only runs on the media path, and the other producers of them (anilist and kitsu via
// resolveSeason) do not run on a listing either. So a two-segment cr id in a search result is
// justwatch's, and nobody else's.
const scopedCrIds = uris => uris.filter(uri => /^cr:[^-]+-.+$/.test(uri))
const bareCrIds = uris => uris.filter(uri => /^cr:[^-]+$/.test(uri))

const session = async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
  const page = await browser.newPage()
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const go = async (path, settle) => {
    await page.evaluate(url => {
      history.pushState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    await page.waitForTimeout(settle)
    return page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')).replace('/media/', ''))
    )
  }
  return { browser, page, go }
}

let listingCr = 0, detailCr = 0, searched = 0
const detailFound = []
let version = '(none)'

for (const film of FILMS) {
  const run = await session()
  if (version === '(none)') {
    version = await run.page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
    console.log(`${ORIGIN}  ${version}\n`)
  }

  const clusters = await run.go('/search/' + encodeURIComponent(film), 14000)
  if (!clusters.length) { console.log(`  ${film}: no results`); await run.browser.close(); continue }
  searched++
  const listingMembers = [...new Set(clusters.flatMap(membersOf))]
  const listingHits = scopedCrIds(listingMembers)
  const bare = bareCrIds(listingMembers)
  listingCr += listingHits.length
  console.log(`  ${film}: ${clusters.length} clusters, ${listingHits.length} season-scoped cr id(s) on the LISTING${listingHits.length ? ' -> ' + listingHits.join(',') : ''}${bare.length ? `   (${bare.length} bare, crunchyroll's own search rows: ${bare.join(',')})` : ''}`)

  // the control arm, in the SAME session so the store already holds the search: open the cluster and
  // ask the same question of a detail view, which is the context that should still spend the request
  const after = await run.go('/media/' + clusters[0], 25000)
  const detailHits = scopedCrIds([...new Set(after.flatMap(membersOf))])
  detailCr += detailHits.length
  if (detailHits.length) detailFound.push(`${film}: ${detailHits.join(',')}`)
  await run.browser.close()
}

console.log(`
  searched          ${searched}
  season-scoped cr ids on LISTING ${listingCr}\t want 0: the context said MEDIA_PAGE and the offer path stood down
  season-scoped cr ids on DETAIL  ${detailCr}\t THE CONTROL, must be > 0 or this run measured nothing
`)
for (const line of detailFound) console.log(`  DETAIL  ${line}`)

if (!searched) { console.log('\nCONTROL FAILED: no search returned anything, so neither arm looked'); process.exit(2) }
if (!detailCr) {
  console.log('\nCONTROL FAILED: no cr id appeared on ANY detail page either.')
  console.log('A listing count of 0 is therefore a fact about this reader, not about the context.')
  process.exit(2)
}
console.log(listingCr === 0 ? '\nthe listing stood down and the detail view still spends' : `\n${listingCr} cr id(s) still minted on a listing`)
process.exit(listingCr === 0 ? 0 : 1)
