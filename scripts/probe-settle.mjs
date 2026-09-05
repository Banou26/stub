import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
const chrome = process.env.CHROME_PATH ?? execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const page = await browser.newPage()
const started = Date.now()
const events = []
page.on('console', m => { const t = m.text(); if (/similarMedia|refused/.test(t)) events.push([Date.now()-started, 'console', t.slice(0,90)]) })
page.on('worker', w => w.on('console', m => { const t = m.text(); if (/similarMedia/.test(t)) events.push([Date.now()-started, 'worker', t.slice(0,90)]) }))
page.on('response', r => { const u = r.url(); if (/fkn|relay|graphql/.test(u)) events.push([Date.now()-started, 'net', r.status()+' '+u.slice(0,60)]) })
await page.goto('https://anime.fkn.app/', { waitUntil: 'domcontentloaded' })
const top = () => page.evaluate(() => [...document.querySelectorAll('.media-section a[href*="/media/"], a[href*="/media/ag:"]')].map(a => (a.textContent||'').trim()).filter(Boolean).slice(0,10))
let last = ''
const changes = []
for (let t = 0; t < 22000; t += 250) {
  await page.waitForTimeout(250)
  const now = (await top()).join(' | ')
  if (now && now !== last) { changes.push([Date.now()-started, now.slice(0,120)]); last = now }
}
console.log(`TOP-10 CHANGED ${changes.length} TIMES`)
for (const [at, list] of changes) console.log(`  +${(at/1000).toFixed(1)}s  ${list}`)
console.log(`\nnetwork+console events: ${events.length}`)
const byBucket = {}
for (const [at] of events) { const b = Math.floor(at/2000)*2; byBucket[b] = (byBucket[b]??0)+1 }
console.log('events per 2s bucket:', JSON.stringify(byBucket))
console.log('\nlast 6 worker lines:'); for (const e of events.filter(e=>e[1]!=='net').slice(-6)) console.log(`  +${(e[0]/1000).toFixed(1)}s ${e[2]}`)
await browser.close()
