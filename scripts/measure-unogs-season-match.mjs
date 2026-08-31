/**
 * Corpus for the unOGS season-match measurement in scripts/measure-unogs-season-match.probe.ts.
 *
 * Fetches once into node_modules/.cache and is a no-op afterwards, the same shape as
 * scripts/fetch-title-corpus.mjs and scripts/measure-start-date-window.mjs.
 *
 *   node scripts/measure-unogs-season-match.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-unogs-season-match.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * WHAT IT COLLECTS, and why both halves are needed. unOGS resolves which of a Netflix series' seasons
 * is ours by EPISODE COUNT alone (`findMatchingSeason`, src/sources/unogs/extractor.ts:130-141, a
 * private duplicate of `pickSeasonByEpisodeCount` in src/sources/season.ts). To know whether that
 * assignment collides, the measurement needs the two things the running code has:
 *
 *   NETFLIX SIDE  every season of the series and how many episodes each holds, from unOGS itself.
 *   OUR SIDE      every RUN of the same show as stub models it, one media per cour, with the episode
 *                 count it would ask with and the title `parseSeasonNumber` would read an ordinal off.
 *
 * A collision is two of our runs receiving the identical `nf:<id>-<n>`, which `upsertMedia` unions and
 * `graph.link` cannot undo. That is the number this exists to produce.
 *
 * The anime side comes from AniList rather than the manami corpus because manami carries no episode
 * count per run in the shape needed and no reliable Netflix mapping either way; the franchise list is
 * therefore matched by TITLE, which is approximate and is exactly what the running code does too.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/unogs-season-pool.json', import.meta.url).pathname

if (existsSync(OUT)) {
  console.log(`already have ${OUT}`)
  process.exit(0)
}

// Multi-season anime likely to be on Netflix, chosen before any of them was measured so the sample is
// not selected on the answer. Franchises only: a single-run show cannot collide and would dilute the
// rate with guaranteed passes.
const FRANCHISES = [
  'Vinland Saga', 'Attack on Titan', 'Demon Slayer', 'BEASTARS', 'Naruto',
  'Fullmetal Alchemist Brotherhood', 'Hunter x Hunter', 'JoJo Bizarre Adventure',
  'Mob Psycho 100', 'One Punch Man', 'Haikyu', 'Black Clover', 'Dr Stone',
  'The Seven Deadly Sins', 'Violet Evergarden', 'Aggretsuko', 'Baki',
  'Kakegurui', 'Rilakkuma', 'Sword Art Online', 'Overlord', 'Re Zero',
  'Konosuba', 'Food Wars', 'Blue Exorcist', 'Fate Zero', 'Bungo Stray Dogs',
  'Ouran High School Host Club', 'Great Pretender', 'Devilman Crybaby',
  'Cells at Work', 'Komi Can t Communicate', 'Spriggan', 'Tokyo Revengers',
  'Record of Ragnarok', 'Yasuke', 'Levius', 'B The Beginning', 'Kengan Ashura',
  'Ultraman', 'Pacific Rim The Black', 'Trese', 'Eden', 'The Way of the Househusband',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/* ------------------------------------------------------------------- unOGS */

const tokenRes = await fetch('https://unogs.com/api/user', {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
  },
  body: 'user_name=anonymous',
}).then(r => r.json())
const token = tokenRes?.token?.access_token
if (!token) throw new Error(`uNoGS token fetch failed: ${JSON.stringify(tokenRes).slice(0, 200)}`)
console.log(`uNoGS anonymous token acquired (${token.length} chars)`)

// the same three headers the extractor sends. `search` refuses without BOTH referer spellings.
const unogs = async path => {
  for (let attempt = 0; attempt < 4; attempt++) {
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

/* ----------------------------------------------------------------- AniList */

const ANILIST = `
query ($search: String) {
  Page(perPage: 40) {
    media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA], sort: START_DATE) {
      id title { romaji english } startDate { year month day } episodes format
    }
  }
}`

const anilist = async search => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: ANILIST, variables: { search } }),
    }).catch(() => undefined)
    if (res?.status === 429) { await sleep(Number(res.headers.get('retry-after') ?? 60) * 1000); continue }
    const body = await res?.json().catch(() => undefined)
    if (body?.data?.Page) return body.data.Page.media ?? []
    await sleep(2000 * (attempt + 1))
  }
  return []
}

/* -------------------------------------------------------------------- pull */

const out = []
for (const franchise of FRANCHISES) {
  const search = await unogs(`/search?limit=50&offset=0&query=${encodeURIComponent(franchise)}&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`)
  const hits = (search?.results ?? []).filter(hit => hit.vtype === 'series')
  const hit = hits[0]
  if (!hit) { console.log(`  ${franchise}: no unOGS series hit`); await sleep(700); continue }

  const seasonsRaw = await unogs(`/title/episodes?netflixid=${hit.nfid}`)
  const seasons = Array.isArray(seasonsRaw)
    ? seasonsRaw.map(s => ({ seasonNumber: s.season, episodeCount: (s.episodes ?? []).length }))
    : []
  if (seasons.length < 2) { console.log(`  ${franchise}: ${seasons.length} unOGS season(s), skipped`); await sleep(700); continue }

  const runs = (await anilist(franchise)).map(m => ({
    id: m.id,
    title: m.title?.english ?? m.title?.romaji ?? '',
    romaji: m.title?.romaji ?? '',
    episodes: m.episodes,
    format: m.format,
    startDate: m.startDate?.year
      ? `${m.startDate.year}-${String(m.startDate.month ?? 1).padStart(2, '0')}-${String(m.startDate.day ?? 1).padStart(2, '0')}`
      : null,
  })).filter(run => run.episodes)

  out.push({ franchise, netflixId: hit.nfid, netflixTitle: hit.title, seasons, runs })
  console.log(`  ${franchise}: nf ${hit.nfid} seasons [${seasons.map(s => s.episodeCount).join(',')}], ${runs.length} anilist runs`)
  await sleep(900)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ fetched: FRANCHISES.length, series: out }))
console.log(`\n${out.length} multi-season series -> ${OUT}`)
