/**
 * Corpus for the JustWatch Netflix season-number measurement in
 * scripts/measure-justwatch-nf-seasons.probe.ts.
 *
 *   node scripts/measure-justwatch-nf-seasons.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-justwatch-nf-seasons.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * THE QUESTION. `providerContentId` scopes a Netflix handle by JustWatch's own season NUMBER, so
 * JustWatch mints `nf:<netflixTitleId>-<jwSeasonNumber>`. unOGS mints `nf:<netflixTitleId>-<n>` too,
 * but its `n` is NETFLIX's season number, read off Netflix's own episode data. Those two only name the
 * same run if the two services agree about what a season is, and the note that prompted this says they
 * do not: Kengan Ashura is 3 seasons on Netflix and 2 on JustWatch.
 *
 * When they disagree, JustWatch's handle either clusters with nothing, or worse, clusters with the
 * unOGS handle for a DIFFERENT run of the same show, which `upsertMedia` unions permanently.
 *
 * WHAT IT COLLECTS, both sides, per show:
 *   JUSTWATCH  every season it lists, by number, and the Netflix title id off its Netflix offer.
 *   NETFLIX    every season unOGS lists for that same title id, by number and episode count.
 *
 * IT CHECKPOINTS AND RESUMES. A 45 minute fetch that wrote nothing because the upstream was having a
 * bad day cost a whole measurement on 2026-09-04, so this saves every few shows and skips what is
 * already on disk. It also records FAILURES separately: a corpus quietly holding only the shows a
 * degraded api felt like serving is a biased sample that looks like a complete one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/justwatch-nf-season-pool.json', import.meta.url).pathname
const PARTIAL = `${OUT}.partial`

// Multi-season shows Netflix is likely to carry. Franchises only: a single-season show cannot show a
// numbering disagreement and would dilute the rate with guaranteed passes.
const SHOWS = [
  'Kengan Ashura', 'Baki', 'Aggretsuko', 'Castlevania', 'BEASTARS', 'The Dragon Prince',
  'Kakegurui', 'Great Pretender', 'Record of Ragnarok', 'Ultraman', 'Sword Art Online',
  'Seven Deadly Sins', 'Hunter x Hunter', 'JoJo Bizarre Adventure', 'Demon Slayer',
  'Attack on Titan', 'Violet Evergarden', 'Blue Exorcist', 'Cells at Work', 'Tokyo Revengers',
  'Dorohedoro', 'B The Beginning', 'She Ra and the Princesses of Power', 'Voltron Legendary Defender',
  'Kipo and the Age of Wonderbeasts', 'DOTA Dragons Blood', 'Love Death and Robots',
  'Neo Yokio', 'Yasuke', 'Spriggan', 'Komi Cant Communicate', 'Rilakkuma', 'Levius',
  'Saint Seiya', 'The Way of the Househusband', 'Hero Mask', 'Eden', '7 Seeds',
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8'))
  : existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, 'utf8'))
  : { shows: [], failed: [] }

if (existsSync(OUT) && !state.failed.length) {
  console.log(`already have ${OUT} (${state.shows.length} shows)`)
  process.exit(0)
}
const done = new Set(state.shows.map(s => s.query))
const retry = new Set(state.failed)
state.failed = []

/* --------------------------------------------------------------- JustWatch */

const JW_QUERY = `
query S($f: TitleFilter!, $country: Country!, $language: Language!, $first: Int!) {
  popularTitles(country: $country, filter: $f, first: $first, sortBy: POPULAR, sortRandomSeed: 0) {
    edges { node {
      objectId objectType
      content(country: $country, language: $language) { title }
      offers(country: $country, platform: WEB, filter: { bestOnly: true }) {
        monetizationType standardWebURL package { shortName }
      }
      ... on Show { seasons { objectId content(country: $country, language: $language) { seasonNumber } } }
    } }
  }
}`

const justwatch = async query => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: JW_QUERY, variables: { f: { searchQuery: query }, country: 'US', language: 'en', first: 5 } })
    }).catch(() => undefined)
    const body = await res?.json().catch(() => undefined)
    if (body?.data?.popularTitles) return body.data.popularTitles.edges.map(e => e.node)
    await sleep(1200 * (attempt + 1))
  }
  return undefined
}

/** the affiliate unwrap the extractor does, then the netflix title id */
const netflixIdOf = node => {
  for (const offer of node.offers ?? []) {
    if (!['FLATRATE', 'FLATRATE_AND_BUY', 'FREE', 'ADS'].includes(offer.monetizationType)) continue
    if (!['nfx', 'nfa'].includes(offer.package?.shortName)) continue
    let url = offer.standardWebURL ?? ''
    try {
      const parsed = new URL(url)
      url = parsed.searchParams.get('u') ?? parsed.searchParams.get('r') ?? url
    } catch {}
    const id = /netflix\.com\/(?:[a-z-]+\/)?title\/(\d+)/.exec(url)?.[1]
    if (id) return id
  }
  return undefined
}

/* -------------------------------------------------------------------- unOGS */

const tokenRes = await fetch('https://unogs.com/api/user', {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
  },
  body: 'user_name=anonymous',
}).then(r => r.json()).catch(() => undefined)
const token = tokenRes?.token?.access_token
if (!token) throw new Error(`uNoGS token fetch failed: ${JSON.stringify(tokenRes).slice(0, 200)}`)
console.log(`uNoGS anonymous token acquired (${token.length} chars)`)

const unogs = async path => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://unogs.com/api${path}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        REFERRER: 'http://unogs.com',
        referer: 'http://unogs.com',
      },
    }).catch(() => undefined)
    const body = await res?.json().catch(() => undefined)
    if (body !== undefined) return body
    await sleep(1500 * (attempt + 1))
  }
  return undefined
}

const save = () => {
  mkdirSync(dirname(PARTIAL), { recursive: true })
  writeFileSync(PARTIAL, JSON.stringify(state, null, 2))
}

let n = 0
for (const query of SHOWS) {
  if (done.has(query) && !retry.has(query)) continue
  const nodes = await justwatch(query)
  if (!nodes) { state.failed.push(query); continue }
  const node = nodes.find(x => x.objectType === 'SHOW' && (x.seasons ?? []).length && netflixIdOf(x))
  if (!node) { state.shows.push({ query, skipped: 'no netflix-carrying show node' }); continue }

  const nfId = netflixIdOf(node)
  const detail = await unogs(`/title/episodes?netflixid=${nfId}`)
  const netflixSeasons = Array.isArray(detail)
    ? detail.map(s => ({ season: s.season, episodes: (s.episodes ?? []).length }))
    : undefined

  state.shows.push({
    query,
    jwTitle: node.content?.title ?? null,
    jwObjectId: node.objectId,
    netflixId: nfId,
    jwSeasons: (node.seasons ?? []).map(s => s.content?.seasonNumber).filter(x => x != null).sort((a, b) => a - b),
    netflixSeasons: netflixSeasons ?? null,
  })

  if (++n % 4 === 0) { save(); process.stdout.write(`\r${state.shows.length} shows, ${state.failed.length} failures`) }
  await sleep(900)
}

save()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(state, null, 2))
const usable = state.shows.filter(s => s.netflixSeasons?.length && s.jwSeasons?.length).length
console.log(`\nwrote ${state.shows.length} shows (${usable} with BOTH season lists) to ${OUT}`)
console.log(`${state.failed.length} were refused by an api and are NOT in the sample`)
