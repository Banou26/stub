// Drives a watch-together party across two real browser contexts: a host that creates one, a guest
// that opens the invite link, and the guest following the host from page to page and down the page.
// The rooms api behind it is the live one (the broker holds the socket, so a localhost app works),
// which is also why this cannot be a unit test.
//
// Headless and MUTED. Navigation and scrolling, not a media transfer. Playback sync is NOT driven
// here: it needs a source's player, which needs a signed-in session on that source, so its logic is
// pinned in tests/unit/party/playback.test.ts and the bridge is read by hand.
//
//   npm run dev            # serves on 4560
//   node scripts/check-party.mjs
//
// Run it from INSIDE the repo: an ESM script resolves bare specifiers against its own location.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const ORIGIN = process.env.STUB_ORIGIN ?? 'http://localhost:4560'

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

const pathOf = page => { const url = new URL(page.url()); return url.pathname + url.search }

/** Poll until `read` answers something `want` accepts, or the budget runs out. Returns the last reading. */
const until = async (read, want, timeout = 20_000) => {
  const started = Date.now()
  let last
  while (Date.now() - started < timeout) {
    last = await read()
    if (want(last)) return last
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return last
}

const widget = page => page.getByRole('button', { name: /Watch together|Hosting|Following|Joining|Party/ })

const run = async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath(), args: ['--mute-audio'] })
  const host = await browser.newContext().then(context => context.newPage())
  const guest = await browser.newContext().then(context => context.newPage())
  for (const [name, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', error => bad(`an uncaught page error on the ${name}`, String(error).slice(0, 160)))
  }

  console.log(`\n[party] ${ORIGIN}`)

  console.log('\nthe host starts a party')
  await host.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await host.getByRole('button', { name: 'Watch together' }).waitFor({ timeout: 20_000 })
  // Clicked until it takes. The broker's docked bar lands a moment after the page and pushes the
  // header down, so a click issued the instant the button exists can land where it no longer is.
  let hosting = ''
  for (let attempt = 0; attempt < 4 && !/Hosting|Joining/.test(hosting); attempt++) {
    await host.getByRole('button', { name: 'Watch together' }).click().catch(() => {})
    hosting = await until(() => widget(host).innerText().catch(() => ''), text => /Hosting|Joining/.test(text), 4_000)
  }
  hosting = await until(() => widget(host).innerText().catch(() => ''), text => /Hosting/.test(text), 30_000)
  check(/Hosting/.test(hosting), 'the widget reads Hosting', hosting.replace(/\s+/g, ' '))
  if (!/Hosting/.test(hosting)) {
    console.log('\nRIG BLIND: no party was created, so nothing below can be measured')
    await browser.close()
    process.exit(2)
  }
  await widget(host).click()
  const link = await host.getByRole('textbox', { name: 'Invite link' }).inputValue()
  check(/\/party#[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/.test(link), 'the invite is a link with the key in the fragment', link.replace(/#.*/, '#…'))
  await host.keyboard.press('Escape')

  console.log('\nthe guest opens the link and lands where the host is')
  await guest.goto(link, { waitUntil: 'domcontentloaded' })
  const landed = await until(() => pathOf(guest), path => path === '/', 30_000)
  check(landed === '/', 'the guest was moved to the host’s page', landed)
  const following = await until(() => widget(guest).innerText().catch(() => ''), text => /Following/.test(text))
  check(/Following/.test(following), 'the guest’s widget reads Following', following.replace(/\s+/g, ' '))
  const hostCount = await until(() => widget(host).innerText().catch(() => ''), text => /2/.test(text))
  check(/2/.test(hostCount), 'the host sees two in the party', hostCount.replace(/\s+/g, ' '))

  console.log('\nthe guest follows the host to a search')
  await host.goto(`${ORIGIN}/search?season=FALL&year=2026`, { waitUntil: 'domcontentloaded' })
  const followed = await until(() => pathOf(guest), path => path.startsWith('/search?'))
  check(followed === '/search?season=FALL&year=2026', 'the guest is on the same search, filters included', followed)

  console.log('\nand down the page')
  await host.locator('.grid > .card').first().waitFor({ timeout: 45_000 }).catch(() => {})
  await guest.locator('.grid > .card').first().waitFor({ timeout: 45_000 }).catch(() => {})
  await host.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
  const scrolled = await until(() => guest.evaluate(() => window.scrollY), y => y > 100, 10_000)
  check(scrolled > 100, 'the guest scrolled too', `${Math.round(scrolled)}px`)

  console.log('\na guest going its own way stays there, and comes back on Catch up')
  // A client-side move, the way a person wanders: a full load would rebuild the guest's store and
  // read as a returning follower, which is the next section.
  await guest.getByRole('link', { name: 'Settings' }).click()
  await until(() => pathOf(guest), path => path === '/settings')
  check(pathOf(guest) === '/settings', 'the guest wandered to settings', pathOf(guest))
  await new Promise(resolve => setTimeout(resolve, 12_000))
  check(pathOf(guest) === '/settings', 'and a heartbeat later is still there: a wandered guest is not yanked back', pathOf(guest))
  check(pathOf(host).startsWith('/search'), 'while the host stayed put', pathOf(host))
  await guest.getByRole('button', { name: /Following/ }).click()
  await guest.getByRole('button', { name: 'Catch up' }).click()
  const back = await until(() => pathOf(guest), path => path.startsWith('/search'))
  check(back === '/search?season=FALL&year=2026', 'Catch up brings the guest back', back)

  console.log('\nbut the host moving wins over a wandered guest')
  await guest.getByRole('link', { name: 'Settings' }).click()
  await until(() => pathOf(guest), path => path === '/settings')
  await host.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  const dragged = await until(() => pathOf(guest), path => path === '/')
  check(dragged === '/', 'the guest followed the host home', dragged)

  console.log('\na guest that reloads lands back where the party is')
  // The gap this was written for: a reload rejoins inside the api's hold, so the host hears no
  // `joined` and sends no snapshot for it. The host's heartbeat is what reaches a rebuilt store.
  await host.goto(`${ORIGIN}/search?season=FALL&year=2026`, { waitUntil: 'domcontentloaded' })
  await until(() => pathOf(guest), path => path.startsWith('/search'))
  await guest.goto(`${ORIGIN}/settings`, { waitUntil: 'domcontentloaded' })
  const returned = await until(() => pathOf(guest), path => path.startsWith('/search'), 30_000)
  check(returned === '/search?season=FALL&year=2026', 'the reloaded guest was brought back', returned)
  const stillFollowing = await until(() => widget(guest).innerText().catch(() => ''), text => /Following/.test(text))
  check(/Following/.test(stillFollowing), 'and is still following', stillFollowing.replace(/\s+/g, ' '))

  console.log('\nCONTROL: a broken link is refused on the page, not in the broker')
  const stray = await browser.newContext().then(context => context.newPage())
  await stray.goto(`${ORIGIN}/party#not-an-invite`, { waitUntil: 'domcontentloaded' })
  const broken = await until(() => stray.locator('.status').innerText().catch(() => ''), text => /broken/i.test(text))
  check(/broken/i.test(broken), 'the page says the link is broken', broken)
  await stray.close()

  console.log('\nthe host ending the party ends it for the guest')
  // Dispatched rather than clicked: the broker's bar (a fixed iframe above everything) reveals itself
  // over the header for a moment after another tab is opened and closed, which is what the control
  // above just did, and a hit-tested click then lands on the bar. What this section measures is the
  // party ending, not the header's stacking, so the click goes straight to the button.
  await widget(host).dispatchEvent('click')
  await host.getByRole('button', { name: 'End party' }).waitFor({ timeout: 10_000 })
  await host.getByRole('button', { name: 'End party' }).dispatchEvent('click')
  const over = await until(() => widget(guest).innerText().catch(() => ''), text => /Party over/.test(text), 30_000)
  check(/Party over/.test(over), 'the guest’s widget reads Party over', over.replace(/\s+/g, ' '))
  const why = await guest.locator('[role="dialog"] .title').innerText().catch(() => '')
  check(/host left/i.test(why), 'and says the host left', why)

  await browser.close()
  console.log(failures ? `\n${failures} failed\n` : '\nall good\n')
  process.exit(failures ? 1 : 0)
}

run().catch(error => { console.error(error); process.exit(1) })
