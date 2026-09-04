import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
const chrome = execFileSync('which', ['google-chrome-stable'], { encoding: 'utf-8' }).trim()
const b = await chromium.launch({ headless: true, executablePath: chrome, args: ['--mute-audio'] })
const p = await b.newPage()

// ONE page load only: the store lives in the page's worker and a full reload wipes it, so every
// subsequent navigation has to be client side or nothing accumulates.
await p.goto('https://anime.fkn.app/', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)

const go = async (path) => {
  await p.evaluate(url => {
    history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await p.waitForTimeout(11000)
}

// open the pages that MINT the handles. Nothing welds on a listing page: kitsu only fetches streaming
// links in getMedia, which is the media path.
const WATCHED = ['kitsu:794', 'kitsu:795', 'anilist:108465', 'anilist:178789']
for (const uri of WATCHED) await go('/media/' + uri)

// then read clusters off a listing, which renders `ag:(...)` hrefs, and an ag uri IS the cluster
const agUris = new Set()
for (const q of ['Dragon Ball Z Movie', 'Mushoku Tensei']) {
  await go('/search/' + encodeURIComponent(q))
  for (const h of await p.evaluate(() => [...document.querySelectorAll('a[href*="/media/ag:"]')].map(a => decodeURIComponent(a.getAttribute('href')))))
    agUris.add(h.replace('/media/', ''))
}

console.log(`collected ${agUris.size} clusters`)
// THE CONTROL. If a watched uri appears in NO cluster, the sweep never looked at it and a report of
// "no welds" is a report about the sweep, not about the store.
for (const w of WATCHED) {
  const seen = [...agUris].filter(ag => ag.replace(/^ag:\(|\)$/g, '').split(',').includes(w))
  console.log(`  ${w.padEnd(18)} appears in ${seen.length} cluster(s)`)
}
console.log('sample clusters:')
for (const ag of [...agUris].slice(0, 4)) console.log('   ' + ag.slice(0, 120))
let found = 0
for (const ag of agUris) {
  const members = ag.replace(/^ag:\(|\)$/g, '').split(',')
  const hits = WATCHED.filter(w => members.includes(w))
  if (hits.length > 1) { found++; console.log(`  WELD ${hits.join(' + ')}\n    in ${ag}`) }
}
console.log(found ? `${found} weld(s)` : 'no two watched uris share a cluster')
await b.close()
