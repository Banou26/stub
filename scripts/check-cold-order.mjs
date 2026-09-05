/**
 * What does a COLD "Current season" paint, before any live source answers?
 *
 * The listing sorts on popularity with a stable sort, so this reads the first cards within the first
 * second of a fresh load, when only the bundled offline rows exist. Since 2026-09-06 those rows carry
 * MyAnimeList's member count, fetched per season at build time, so the cold paint should already be
 * the order the settled page reaches.
 *
 * Control: the same read a few seconds later, once live sources have answered. If the two disagree
 * wildly the bundle is not doing its job; if the early read is empty the check measured nothing.
 *
 * COMPARED BY IDENTITY, NEVER BY TITLE. The cold cards carry manami's romaji ("Youjo Senki II") and
 * the settled ones the live sources' English ("Saga of Tanya the Evil II"), so a string comparison
 * reported 0 of 6 matching on a run whose first four cards were the same four shows in the same order
 * (2026-09-06). The catalogue ids inside each card's `ag:(...)` href are the same in both states.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.argv[2] ?? 'https://anime.fkn.app'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

/** each card as {label, ids}: the visible text for the report, the catalogue ids for the comparison */
const cards = page => page.evaluate(() =>
  [...document.querySelectorAll('.media-section a[href*="/media/"], a[href*="/media/ag:"]')]
    .map(a => ({
      label: (a.textContent ?? '').trim().replace(/\s+/g, ' '),
      ids: [...decodeURIComponent(a.getAttribute('href') ?? '').matchAll(/\b(mal|anilist|kitsu|anidb):([\w-]+)/g)].map(m => m[0]),
    }))
    .filter(card => card.ids.length)
    // a card renders as two anchors, an image and a title: keep one entry per SHOW, labelled by
    // whichever anchor carried the text, or the count is of anchors and reads twice as good as it is
    .reduce((kept, card) => {
      const seen = kept.find(other => other.ids.some(id => card.ids.includes(id)))
      if (!seen) kept.push(card)
      else if (!seen.label) seen.label = card.label
      return kept
    }, [])
    .slice(0, 6))

/** two cards are the same show when they share any catalogue id */
const same = (a, b) => a.ids.some(id => b.ids.includes(id))

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })

let cold = []
for (let waited = 0; waited < 8000; waited += 200) {
  await page.waitForTimeout(200)
  cold = await cards(page)
  if (cold.length) break
}
await page.waitForTimeout(12000)
const settled = await cards(page)
const version = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ [0-9a-f]{7}/)?.[0] ?? '(none)')
await browser.close()

console.log(`${ORIGIN}  ${version}`)
console.log('\nCOLD (first paint):')
for (const [at, card] of cold.entries()) console.log(`  ${at + 1}. ${card.label}`)
console.log('\nSETTLED (after 12s):')
for (const [at, card] of settled.entries()) console.log(`  ${at + 1}. ${card.label}`)

if (!cold.length) {
  console.log('\nCONTROL FAILED: nothing painted, so nothing was measured')
  process.exit(2)
}
if (!cold.some(card => card.ids.length)) {
  console.log('\nCONTROL FAILED: no card carried a catalogue id, so identity could not be compared')
  process.exit(2)
}
const inPlace = cold.filter((card, at) => settled[at] && same(card, settled[at])).length
const overlap = cold.filter(card => settled.some(other => same(card, other))).length
console.log(`\n${inPlace} of the first ${cold.length} cold cards are the SAME SHOW in the SAME POSITION once settled`)
console.log(`${overlap} of them are somewhere in the settled top ${settled.length}`)
process.exit(inPlace >= Math.min(3, cold.length) ? 0 : 1)
