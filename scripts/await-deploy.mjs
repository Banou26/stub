/**
 * Block until a commit is the one anime.fkn.app is serving, then exit 0.
 *
 *   node scripts/await-deploy.mjs 0a59b41
 *
 * The footer renders `v0.0.17 <7-char sha>`, which is the only observable for which build is live.
 * Exits 1 rather than looping forever, so a caller chained with && stops instead of hanging.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const want = process.argv[2]
if (!want) { console.log('usage: node scripts/await-deploy.mjs <7-char sha>'); process.exit(1) }
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()

for (let attempt = 0; attempt < 40; attempt++) {
  const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
  const page = await browser.newPage()
  await page.goto('https://anime.fkn.app/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const live = await page.evaluate(() => document.body.innerText.match(/v[\d.]+ ([0-9a-f]{7})/)?.[1] ?? '')
  await browser.close()
  if (live === want) { console.log(`LIVE ${live} after ~${attempt * 20}s`); process.exit(0) }
  console.log(`  serving ${live || '(no version on page)'}, waiting for ${want}`)
  await new Promise(resolve => setTimeout(resolve, 20000))
}
console.log(`TIMED OUT: ${want} never went live`)
process.exit(1)
