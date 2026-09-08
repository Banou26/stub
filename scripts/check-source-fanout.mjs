// A page opened knowing ONE source ends up knowing all of them, on the FIRST load.
//
// A relation card names a work by the single source that mentioned it, so clicking one opens
// `ag:(anilist:166873)` and the store has to fan out from there. The failure this guards is not an
// error: the cluster simply settles one source short, and the missing source appears only if you
// reload, because the address bar by then already carries the id it needed.
//
// anizip is the case that exposed it, and it is the shape worth guarding rather than the name: it
// PUBLISHES under `anizip:` and is ADDRESSABLE by anidb and mal, so its own origin cannot appear in
// the cluster until it has already answered. A fan-out that re-asks sources by the origin they
// publish under can never reach it. See src/sources/supported.ts.
//
// THE CONTROL is the reload. Whatever a cold first load reaches, a reload of the settled address must
// reach the same set: if the reload finds MORE, the first load stopped early and that is the bug.
// Without it a run that simply failed to reach anizip twice would look consistent and pass.
//
//   npm run dev            # serves on 4560
//   node scripts/check-source-fanout.mjs
//
// Run it from INSIDE the repo: an ESM script resolves bare specifiers against its own location.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const ORIGIN = process.env.STUB_ORIGIN ?? 'http://localhost:4560'
/** One source, the shape a relation card links to. Its cluster is known to reach six. */
const NARROW = process.env.STUB_MEDIA ?? '/media/ag:(anilist:166873)'
/** Must be reached from NARROW alone. It is addressable by mal and anidb and publishes its own id. */
const LATE_SOURCE = 'anizip'

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

/** Load a uri and wait for the address to stop growing, then report the origins it names. */
const settle = async (page, path) => {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' })
  let last = ''
  let still = 0
  for (let attempt = 0; attempt < 70 && still < 6; attempt++) {
    await page.waitForTimeout(700)
    const now = decodeURIComponent(new URL(page.url()).pathname)
    if (now === last) still += 1
    else { still = 0; last = now }
  }
  const inside = last.match(/\(([^)]*)\)/)?.[1] ?? ''
  return { path: last, origins: [...new Set(inside.split(',').filter(Boolean).map(uri => uri.split(':')[0]))].sort() }
}

const main = async () => {
  console.log(`[source fanout] ${ORIGIN}`)
  const browser = await chromium.launch({ headless: true, executablePath: chromePath(), args: ['--mute-audio'] })

  // a COLD context, so nothing survives from a previous run's store or cache
  const cold = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const first = await settle(await cold.newPage(), NARROW)
  await cold.close()

  console.log(`\nopened knowing one source  (${NARROW})`)
  check(first.origins.length > 1, 'the cluster grew past the one source it was opened with', first.origins.join(', '))
  check(first.origins.includes(LATE_SOURCE), `and reached ${LATE_SOURCE}, which is addressable by ids it does not publish`, first.origins.join(', '))

  // THE CONTROL: reload the settled address. It must find nothing new.
  const warm = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const again = await settle(await warm.newPage(), first.path)
  await warm.close()

  console.log('\nCONTROL: reloading the settled address finds nothing the first load missed')
  const extra = again.origins.filter(origin => !first.origins.includes(origin))
  check(extra.length === 0, 'the reload adds no source', extra.length ? `first load missed ${extra.join(', ')}` : `${again.origins.length} both times`)
  check(again.origins.length >= first.origins.length, 'and loses none either', `${first.origins.length} then ${again.origins.length}`)

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nall good')
  process.exit(failures ? 1 : 0)
}

main().catch(error => { console.error(error); process.exit(2) })
