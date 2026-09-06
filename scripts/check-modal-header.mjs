// The header has to stay reachable over the media modal, so a follower in a watch party can reach the
// party pill and stop following while the host has a modal open.
//
// A stacking order is not something a unit test can hold, so this drives the real page and asks the
// document what is on top, WITH A CONTROL: the same measurement at the old z-index must fail. A check
// that cannot produce the failure would pass on any CSS at all.
//
// Usage:
//   npm run dev            # serves on 4560
//   node scripts/check-modal-header.mjs
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ORIGIN = process.env.STUB_ORIGIN ?? 'http://localhost:4560'
const chrome = process.env.STUB_CHROME ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })

/** Open a media modal and ask whether the header's own search box is the thing at its own centre. */
const reachableOverTheModal = async (headerZ) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('a[href^="/media/"]').first().click({ timeout: 60_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-party-scroll]').length > 0, null, { timeout: 30_000 })
  const result = await page.evaluate(z => {
    // The FKN platform parks fixed iframes at the top of the stacking order for its own surfaces.
    // They are neither the modal nor stub's, and they are not what this measures, so they are set
    // aside; without this the answer is "an FKN iframe" whatever stub's own css says.
    const parked = [...document.body.children].filter(el => el.tagName === 'IFRAME' && getComputedStyle(el).position === 'fixed')
    for (const frame of parked) frame.style.display = 'none'
    const header = document.querySelector('header')
    if (z) header.style.zIndex = String(z)
    const input = header.querySelector('input')
    const box = input.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2))
    return { reachable: hit === input, headerZ: getComputedStyle(header).zIndex }
  }, headerZ)
  await page.close()
  return result
}

const asShipped = await reachableOverTheModal(null)
const control = await reachableOverTheModal(100)
await browser.close()

const lines = [
  [asShipped.reachable, `the header is reachable over the modal (z ${asShipped.headerZ})`],
  [!control.reachable, 'and the control at the old z-index 100 is covered, so this can see a regression'],
]
for (const [ok, what] of lines) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
if (!lines.every(([ok]) => ok)) { console.log('\nthe modal covers the header, or the check can no longer tell'); process.exit(1) }
console.log('\nthe header stays reachable over the media modal')
