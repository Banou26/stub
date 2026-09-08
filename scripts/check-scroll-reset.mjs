// A page somebody navigated to starts at the top; the modal over the home page leaves the page alone.
//
// A single page app moves nothing on its own: wouter swaps the route and the document keeps whatever
// scroll it had, so "Current season" clicked 1,200px down the home page opened the season listing
// 1,200px down. This drives every kind of navigation the app has against the dev server and reads
// `scrollY` after each, with a CONTROL for every claim in the other direction: a modal opened and
// closed over a scrolled home page has to leave it where it was, and a `replaceState` on the same
// page (what the search filters and the header's typing do) has to move nothing. Without those a
// check that reset on every navigation would pass here and break the modal.
//
// The last section emulates the ONE platform where the overlay's unlock restores the position it
// captured (floating-ui's iOS branch, `position: fixed` on the body): a reset that ran before the
// unlock would be undone there and nothing on a desktop would ever show it.
//
//   npm run dev            # serves on 4560
//   node scripts/check-scroll-reset.mjs
//
// Run it from INSIDE the repo: an ESM script resolves bare specifiers against its own location.
// Before the fix (2026-09-08) this reports 7 failures and every control passes; after, 0.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const ORIGIN = process.env.STUB_ORIGIN ?? 'http://localhost:4560'
const LISTING = '/search?season=FALL&year=2026'
/** How far down a listing is scrolled before navigating. The home page is shorter, so there it is as far as it goes. */
const DOWN = 1_200
/** A scroll position that did not move, within the pixel or two a reflow (the overlay's scrollbar padding) costs. */
const near = (a, b) => Math.abs(a - b) <= 4

const chromePath = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (!existsSync('/etc/NIXOS')) return undefined
  for (const bin of ['google-chrome-stable', 'chromium']) {
    try { return execFileSync('which', [bin], { encoding: 'utf-8' }).trim() } catch {}
  }
  return undefined
}

let failures = 0
const ok = (label, detail = '') => console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`)
const bad = (label, detail = '') => { failures++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`) }
const check = (condition, label, detail) => condition ? ok(label, detail) : bad(label, detail)
const note = (label, detail = '') => console.log(`  note  ${label}${detail ? `  (${detail})` : ''}`)

const until = async (read, want, timeout = 20_000) => {
  const started = Date.now()
  let last
  while (Date.now() - started < timeout) {
    last = await Promise.resolve().then(read)
    if (want(last)) return last
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return last
}

const scrollY = page => page.evaluate(() => Math.round(window.scrollY))
const overlays = page => page.evaluate(() => document.querySelectorAll('[data-party-scroll]').length)
const path = page => new URL(page.url()).pathname

/** Two frames and a beat: a reset scheduled for the next frame has run, and so has anything undoing it. */
const settle = async page => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForTimeout(150)
}

/**
 * A page with something below the fold to scroll into: the cards have arrived and the document is
 * taller than the window. Returns how far down it can go, since the home page (a theater and one row
 * of cards, 354px of room at 1280x720 on 2026-09-08) is a lot shorter than a listing.
 */
const loaded = async (page, need = 150) => {
  await page.locator('a[href^="/media/"]').first().waitFor({ timeout: 60_000 })
  const room = await until(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), room => room > need, 60_000)
  if (room <= need) throw new Error(`the page never grew past ${need}px of room (${room}px)`)
  return Math.min(DOWN, room)
}

/**
 * A listing keeps arriving for seconds, and while cards are inserted above the fold the browser's
 * scroll anchoring walks the position down with them (measured 2026-09-08: 1,200px became 4,530px
 * and then 9,340px over three seconds of loading). A position read on a page still growing is the
 * loading's doing, so every scroll here waits for the height to hold still first.
 */
const steady = async (page, hold = 1_500, timeout = 60_000) => {
  const started = Date.now()
  let height = -1
  let since = Date.now()
  while (Date.now() - started < timeout) {
    const now = await page.evaluate(() => document.documentElement.scrollHeight)
    if (now !== height) { height = now; since = Date.now() }
    else if (Date.now() - since >= hold) return height
    await page.waitForTimeout(100)
  }
  throw new Error(`the page never held still (${height}px and counting)`)
}

/** Set and confirm, since a scroll that did not take is the failure this file exists to see. */
const scrollDown = async (page, y) => {
  await steady(page)
  await page.evaluate(y => { window.scrollTo({ top: y, behavior: 'instant' }) }, y)
  const at = await scrollY(page)
  if (Math.abs(at - y) > 5) throw new Error(`asked for ${y}px and the page sits at ${at}px`)
  return at
}

/** Read twice: right after the navigation settles, and after anything late (data, a restore) has had its say. */
const landed = async page => {
  await settle(page)
  const first = await scrollY(page)
  await page.waitForTimeout(1_500)
  const later = await scrollY(page)
  return { first, later, text: `${first}px then ${later}px` }
}

const openModal = async page => {
  await page.locator('a[href^="/media/"]').first().click()
  const count = await until(() => overlays(page), n => n > 0)
  if (!count) throw new Error('no modal opened')
}

/** The overlay closes itself when IT is what was clicked, so a click well outside the centred box. */
const closeModal = async page => {
  await page.mouse.click(8, 400)
  const count = await until(() => overlays(page), n => n === 0)
  if (count) throw new Error('the modal did not close')
}

const main = async () => {
  console.log(`[scroll reset] ${ORIGIN}`)
  const browser = await chromium.launch({ headless: true, executablePath: chromePath(), args: ['--mute-audio'] })
  const fresh = async options => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options })
    const page = await context.newPage()
    return { page, close: () => context.close() }
  }

  {
    console.log('\na link to another page starts it at the top')
    const { page, close } = await fresh()
    await page.goto(`${ORIGIN}/`)
    const y = await loaded(page)
    await scrollDown(page, y)
    await page.getByRole('link', { name: 'Current season' }).click()
    await page.waitForURL(url => url.pathname === '/search')
    const at = await landed(page)
    check(at.first === 0 && at.later === 0, 'Current season opens the listing at the top', at.text)

    // the browser's own restore on the way back: reported, not judged, since it is the browser's
    await scrollDown(page, 800)
    await page.goBack()
    await page.waitForURL(url => url.pathname === '/')
    const back = await landed(page)
    note('back to the home page, which the browser places', back.text)
    await close()
  }

  {
    console.log('\nCONTROL: the modal rides over the home page, which stays where it was')
    const { page, close } = await fresh()
    await page.goto(`${ORIGIN}/`)
    const y = await loaded(page)
    await scrollDown(page, y)
    await openModal(page)
    const under = await landed(page)
    check(near(under.first, y) && near(under.later, y), 'opening a card leaves the page under it alone', `${y}px, then ${under.text}`)
    await closeModal(page)
    await page.waitForURL(url => url.pathname === '/')
    const after = await landed(page)
    check(near(after.first, y) && near(after.later, y), 'closing it brings the page back where it was', `${y}px, then ${after.text}`)
    await close()
  }

  {
    console.log('\nthe wordmark is "home, from the top", wherever it is clicked')
    const { page, close } = await fresh()
    await page.goto(`${ORIGIN}${LISTING}`)
    await scrollDown(page, await loaded(page, DOWN))
    await page.locator('header .logo').click()
    await page.waitForURL(url => url.pathname === '/')
    const fromListing = await landed(page)
    check(fromListing.first === 0 && fromListing.later === 0, 'from the listing', fromListing.text)

    const y = await loaded(page)
    await scrollDown(page, y)
    await page.locator('header .logo').click()
    const onHome = await landed(page)
    check(path(page) === '/' && onHome.first === 0 && onHome.later === 0, 'from the home page itself, where the url does not even change', onHome.text)

    await scrollDown(page, y)
    await openModal(page)
    await page.locator('header .logo').click()
    await until(() => overlays(page), n => n === 0)
    const fromModal = await landed(page)
    check(path(page) === '/' && fromModal.first === 0 && fromModal.later === 0, 'from inside a modal, which closes', fromModal.text)
    await close()
  }

  {
    console.log('\nthe search box: a submitted search is a new page, typing is not')
    const { page, close } = await fresh()
    await page.goto(`${ORIGIN}${LISTING}`)
    // Anchoring off for this section only: a listing a source is still answering inserts cards above
    // the fold for a while (370px of drift in the 1.5s after a control here, 2026-09-08, on a page that
    // had held still for 1.5s before it), and what the controls below claim is that a REPLACE moves
    // nothing, which the growth would otherwise hide. The resets are not affected: at the top there
    // is nothing above the fold to anchor to.
    await page.addStyleTag({ content: 'html, body { overflow-anchor: none }' })
    await scrollDown(page, await loaded(page, DOWN))
    // The shape the filters and the header's typing use: a replace on the same page, which moves
    // nothing. The url is kept IDENTICAL (a fresh state object is what makes it a navigation), because
    // a changed query string re-subscribes the listing, which empties and refills, and the page
    // shrinking under the scroll clamps it: that is the listing's own doing and would read as a reset.
    await page.evaluate(() => history.replaceState({ probe: 1 }, '', location.href))
    const replaced = await landed(page)
    check(near(replaced.first, DOWN) && near(replaced.later, DOWN), 'CONTROL: a replace on the same page leaves it alone', replaced.text)
    // and a push to the same url is the page asked for again
    await page.evaluate(() => history.pushState({ probe: 2 }, '', location.href))
    const repushed = await landed(page)
    check(repushed.first === 0 && repushed.later === 0, 'the same page pushed again starts at the top', repushed.text)

    await scrollDown(page, DOWN)
    const box = page.getByRole('textbox', { name: 'Search', exact: true })
    await box.fill('naruto')
    await box.press('Enter')
    await page.waitForURL(url => url.search.includes('naruto'))
    const submitted = await landed(page)
    check(submitted.first === 0 && submitted.later === 0, 'a search submitted from the listing starts at the top', submitted.text)
    await close()
  }

  {
    console.log('\nbookkeeping in the same frame does not swallow the reset')
    const { page, close } = await fresh()
    await page.goto(`${ORIGIN}${LISTING}`)
    await scrollDown(page, await loaded(page, DOWN))
    // The shape plugin-url.ts produces: it rewrites the url with a same-page `replaceState` whenever
    // the enabled plugins change or a pop lands, which can fall in the same frame as a navigation.
    // That replace keeps the position, and a listener that cancels on every navigation rather than
    // only when it schedules would drop the push's reset on the floor.
    await page.evaluate(() => {
      history.pushState(null, '', '/settings')
      history.replaceState({ bookkeeping: 1 }, '', location.href)
    })
    await page.waitForURL(url => url.pathname === '/settings')
    const kept = await landed(page)
    check(kept.first === 0 && kept.later === 0, 'a same-page replace right after a push leaves its reset standing', kept.text)
    await close()
  }

  {
    console.log('\nwhere the overlay\'s unlock restores the position it captured (the iOS branch)')
    const { page, close } = await fresh()
    // floating-ui reads userAgentData.platform first, then navigator.platform
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined })
      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' })
    })
    await page.goto(`${ORIGIN}/`)
    await scrollDown(page, await loaded(page))
    await openModal(page)
    const fixed = await page.evaluate(() => getComputedStyle(document.body).position)
    check(fixed === 'fixed', 'CONTROL: the overlay took the branch that restores on unlock', `body is ${fixed}`)
    await page.locator('header .logo').click()
    await until(() => overlays(page), n => n === 0)
    const fromModal = await landed(page)
    check(path(page) === '/' && fromModal.first === 0 && fromModal.later === 0, 'the wordmark from inside a modal still lands at the top', fromModal.text)
    await close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nall good')
  process.exit(failures ? 1 : 0)
}

main().catch(error => { console.error(error); process.exit(2) })
