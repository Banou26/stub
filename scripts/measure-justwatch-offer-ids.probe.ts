/**
 * Whether a JustWatch offer's provider id identifies ONE title, driven through the repo's own
 * `PACKAGE_ORIGIN_MAP` and `extractContentId` rather than a copy of them.
 *
 *   node scripts/measure-justwatch-offer-ids.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-justwatch-offer-ids.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no measurement.
 *
 * THE METRIC. `buildOffersAsHandles` turns each offer into a handle `<origin>:<contentId>`, and
 * `upsertMedia` links it, which is a union-find union with NO inverse. So if two DIFFERENT JustWatch
 * titles yield the same `<origin>:<contentId>`, their clusters merge permanently for the session.
 * That count is the whole measurement, and the target is zero.
 *
 * THREE ARMS, because the middle one is the point. `was` is what shipped before 2026-09-01: two of its
 * ten packages had been renamed by their services, so it welded nothing only because it never minted a
 * handle for them at all, silently dropping 119 offers. `mapped-only` is the tempting half fix, naming
 * the live packages while still reading the old url shapes, and it is WORSE than doing nothing: HBO
 * Max series urls are /video/watch/<uuid>, so its `parts[1]` is the literal string "watch" and every
 * HBO title collapses onto one handle. `now` is both halves.
 *
 * THE CONTROL is therefore `mapped-only`, asserted to STILL WELD. A rig that cannot express the
 * failure reports success unconditionally; if that arm ever goes quiet, the corpus has stopped
 * reaching the providers whose urls moved and the pass on the live function means nothing.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { PACKAGE_ORIGIN_MAP, extractContentId } from '../src/sources/justwatch/id'

type Offer = { shortName: string, clearName: string, monetizationType: string, standardWebURL: string | null }
type Title = { jwId: string, objectType: string, title: string, offers: Offer[] }

const POOL = new URL('../node_modules/.cache/justwatch-offer-pool.json', import.meta.url).pathname
const { titles } = JSON.parse(readFileSync(POOL, 'utf8')) as { titles: Title[] }

/** What `buildOffersAsHandles` keeps: the monetization types that become a handle. */
const KEPT = ['FLATRATE', 'FLATRATE_AND_BUY', 'FREE', 'ADS']

/** The affiliate unwrap the extractor does before reading the url. */
const realUrl = (affiliate: string): string => {
  try {
    const url = new URL(affiliate)
    return url.searchParams.get('u') ?? url.searchParams.get('r') ?? affiliate
  } catch { return affiliate }
}

/** extractContentId as it stood before 2026-09-01, kept verbatim as the control. */
const wasExtractContentId = (url: string): string | undefined => {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace('www.', '')
    const parts = pathname.split('/').filter(Boolean)
    if (host === 'netflix.com') return parts[1]
    if (host === 'crunchyroll.com' && parts[0] === 'series') return parts[1]
    if (host.startsWith('amazon.')) return parts.at(-1)
    if (host === 'hulu.com') {
      const last = parts.at(-1)
      return last?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] ?? last
    }
    if (host === 'disneyplus.com' || host === 'tv.apple.com') return parts[2]
    if (host === 'peacocktv.com') return parts.at(-1)
    if (host === 'paramountplus.com') return parts[1]
    if (host === 'play.hbomax.com' || host === 'hbomax.com') return parts[1]
  } catch {}
  return undefined
}

/** The map as it stood before 2026-09-01, with hbm and pmp both long dead. */
const WAS_MAP: Record<string, string> = {
  cru: 'cr', nfx: 'nf', dnp: 'disney', amp: 'amazon', atp: 'appletv',
  hlu: 'hulu', hbm: 'hbo', pcp: 'peacock', pmp: 'paramount', fuv: 'fubo',
}

type Arm = { map: Record<string, string>, extract: (url: string) => string | undefined }

const run = (arm: Arm) => {
  // origin:id -> the distinct JustWatch titles that claim it
  const holders = new Map<string, Set<string>>()
  const assignedPerOrigin = new Map<string, number>()
  let dropped = 0

  for (const title of titles) {
    const seen = new Set<string>()
    for (const offer of title.offers) {
      if (!KEPT.includes(offer.monetizationType)) continue
      if (seen.has(offer.shortName)) continue
      seen.add(offer.shortName)

      const origin = arm.map[offer.shortName]
      if (!origin) continue
      const id = offer.standardWebURL ? arm.extract(realUrl(offer.standardWebURL)) : undefined
      // crunchyroll /watch/ urls are resolved by a separate episode path in the extractor, so a miss
      // there is by design rather than a drop
      if (!id) { if (origin !== 'cr') dropped++; continue }

      assignedPerOrigin.set(origin, (assignedPerOrigin.get(origin) ?? 0) + 1)
      const key = `${origin}:${id}`
      if (!holders.has(key)) holders.set(key, new Set())
      holders.get(key)!.add(`${title.title} [jw:${title.jwId}]`)
    }
  }

  const collisions = [...holders.entries()].filter(([, held]) => held.size > 1)
  const welded = collisions.reduce((n, [, held]) => n + held.size - 1, 0)
  return { holders, collisions, welded, dropped, assignedPerOrigin }
}

test('a JustWatch offer id identifies one title, never two', () => {
  expect(titles.length).toBeGreaterThan(100)

  const was = run({ map: WAS_MAP, extract: wasExtractContentId })
  const halfway = run({ map: PACKAGE_ORIGIN_MAP, extract: wasExtractContentId })
  const now = run({ map: PACKAGE_ORIGIN_MAP, extract: extractContentId })
  const handles = (arm: ReturnType<typeof run>) => [...arm.assignedPerOrigin.values()].reduce((a, b) => a + b, 0)

  console.log(`\ncorpus  ${titles.length} JustWatch titles, ${titles.reduce((n, t) => n + t.offers.length, 0)} offers\n`)

  console.log('ARM            welds  handles  dropped   (a "weld" is one title collapsed onto another title\'s handle)')
  for (const [label, arm] of [['was', was], ['mapped-only', halfway], ['now', now]] as const) {
    console.log(`  ${label.padEnd(12)} ${String(arm.welded).padStart(5)}  ${String(handles(arm)).padStart(7)}  ${String(arm.dropped).padStart(7)}`)
  }

  console.log('\nWHAT NAMING THE LIVE PACKAGES WOULD WELD ON ITS OWN')
  for (const [key, held] of halfway.collisions.slice(0, 5)) {
    console.log(`  ${key}  <- ${held.size} titles: ${[...held].slice(0, 4).join('  +  ')}${held.size > 4 ? ' ...' : ''}`)
  }

  console.log('\nHANDLES PER ORIGIN')
  const origins = [...new Set([...was.assignedPerOrigin.keys(), ...now.assignedPerOrigin.keys()])].sort()
  for (const origin of origins) {
    console.log(`  ${origin.padEnd(10)} was ${String(was.assignedPerOrigin.get(origin) ?? 0).padStart(4)}   now ${String(now.assignedPerOrigin.get(origin) ?? 0).padStart(4)}`)
  }

  if (now.collisions.length) {
    console.log('\nSTILL WELDING')
    for (const [key, held] of now.collisions) {
      console.log(`  ${key}  <- ${[...held].slice(0, 6).join('  +  ')}`)
    }
  }

  // The control. `mapped-only` is the half fix, and it must still weld: if it ever stops, the corpus
  // no longer reaches the providers whose urls moved and the assertion below is answering nothing.
  expect(halfway.welded, 'control: naming the live packages without fixing the url shapes must still weld').toBeGreaterThan(0)

  // and the old arm's cost, which is the reason the map was touched at all
  expect(was.dropped, 'control: the pre-fix arm must still be dropping offers').toBeGreaterThan(0)

  expect(now.collisions.map(([key, held]) => `${key} <- ${[...held].join(' + ')}`)).toEqual([])
})
