#!/usr/bin/env node
/**
 * The LIVE corpus for scripts/calibrate-episode-anchors.test.ts: Netflix episode titles from unOGS,
 * canonical episode titles and air dates from ani.zip, per franchise.
 *
 *   node scripts/fetch-episode-anchor-corpus.mjs
 *   ./node_modules/.bin/vitest run --config vitest.calibration.config.ts \
 *     scripts/calibrate-episode-anchors.test.ts --disableConsoleIntercept --reporter=verbose
 *
 * Every response is cached as its own file under `EPISODE_ANCHOR_CACHE`
 * (default `node_modules/.cache/episode-anchors`, gitignored like every other rig's corpus here), so
 * a rerun costs zero requests and a partial pull resumes rather than restarting. Nothing it writes
 * is ever committed.
 *
 * WHAT IT COLLECTS, and why each half is needed. Rule 3 pairs one candidate season's rows against
 * the run's own rows, so the measurement needs both sides exactly as the app sees them:
 *
 *   NETFLIX SIDE   every season of the series and every episode title in it, in the order
 *                  `parseUnogsSeasons` would publish (epnum when every episode declares a distinct
 *                  one, else payload order), because the number the app publishes is the POSITION.
 *   CANONICAL SIDE every ani.zip episode of every AniList run the franchise search returns, with its
 *                  `en` and `ja` titles (the two the anizip extractor publishes) and its air date.
 *                  `specials=1` is required: 3.4a's insertions are the `S*` keys.
 *
 * WHICH (season, run) PAIRS ARE TRUTH IS NOT DECIDED HERE. The harness closes each pairing itself
 * from exact title anchors, the count surplus and the specials' dates, and discards what does not
 * close, so this script deliberately over-collects: a franchise search hit that names the wrong show
 * costs a request and then fails to close. The one place a guess happens is WHICH unOGS series hit a
 * franchise name means, where the hit sharing the most stripped tokens with the query wins; that
 * choice cannot reach the offset, since the offset comes from exact anchors against a run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE = process.env.EPISODE_ANCHOR_CACHE ?? resolve(ROOT, 'node_modules/.cache/episode-anchors')
const OUT = process.env.EPISODE_ANCHOR_CORPUS ?? resolve(CACHE, 'corpus.json')

mkdirSync(CACHE, { recursive: true })

const sleep = ms => new Promise(done => setTimeout(done, ms))

/**
 * Every request carries a deadline, because none of these three hosts is obliged to answer.
 *
 * An earlier version left `fetch` untimed and one AniList call held the whole pull for six minutes
 * with nothing in the log, which reads as a finished run that is still going. A timeout turns that
 * into a retry.
 */
const TIMEOUT = 20_000
const timed = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })

// One cache file per request, keyed by a filesystem-safe form of the question. A cached body is
// returned without a network call, which is what makes a rerun free.
const cached = async (key, produce) => {
  const path = resolve(CACHE, `${key.replace(/[^a-z0-9_.-]/gi, '_')}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const body = await produce()
  writeFileSync(path, JSON.stringify(body))
  return body
}

/**
 * Multi-season anime plausibly on Netflix, listed before anything was measured so the sample is not
 * selected on the answer. The first 33 are scripts/measure-unogs-season-match.mjs's list, which was
 * itself chosen that way; the rest are added for breadth (Mushoku Tensei among them, since the hand
 * measurement this calibration checks was done on it).
 */
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
  'Mushoku Tensei', 'Delicious in Dungeon', 'Yu Yu Hakusho', 'Pluto',
  'Dorohedoro', 'Ranking of Kings', 'My Happy Marriage', 'Beyblade Burst',
  'Bleach', 'Made in Abyss', 'Sonny Boy', 'Kotaro Lives Alone',
  'Scissor Seven', 'Cannon Busters', 'Nanatsu no Taizai', 'Thermae Romae',
  'Rurouni Kenshin', 'Tiger and Bunny', 'Beyond the Boundary', 'Inuyasha',
]

/* ------------------------------------------------------------------------------------------ unOGS */

let token
const getToken = async () => {
  if (token) return token
  const body = await timed('https://unogs.com/api/user', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: 'user_name=anonymous',
  }).then(r => r.json()).catch(() => undefined)
  token = body?.token?.access_token
  if (!token) throw new Error(`uNoGS token fetch failed: ${JSON.stringify(body).slice(0, 200)}`)
  console.log(`uNoGS anonymous token acquired (${token.length} chars)`)
  return token
}

// the same three headers src/sources/unogs/extractor.ts sends; `search` refuses without both
// referer spellings
const unogs = async path => {
  const bearer = await getToken()
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await timed(`https://unogs.com/api${path}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${bearer}`,
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

/* ---------------------------------------------------------------------------------------- AniList */

const ANILIST_QUERY = `
query ($search: String) {
  Page(perPage: 30) {
    media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA], sort: START_DATE) {
      id title { romaji english } startDate { year month day } episodes format
    }
  }
}`

const anilist = async search => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await timed('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search } }),
    }).catch(() => undefined)
    // the honoured wait is capped: a retry-after of a full minute on every one of eight attempts is
    // eight minutes of a silent pull, and the corpus can lose one franchise more cheaply than that
    if (res?.status === 429) { await sleep(Math.min(Number(res.headers.get('retry-after') ?? 20), 20) * 1000); continue }
    const body = await res?.json().catch(() => undefined)
    if (body?.data?.Page) return body.data.Page.media ?? []
    await sleep(2000 * (attempt + 1))
  }
  return []
}

/* ----------------------------------------------------------------------------------------- ani.zip */

const anizip = async anilistId => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await timed(`https://api.ani.zip/mappings?anilist_id=${anilistId}&specials=1`).catch(() => undefined)
    const body = await res?.json().catch(() => undefined)
    if (body !== undefined) return body
    await sleep(1000 * (attempt + 1))
  }
  return undefined
}

/* -------------------------------------------------------------------------------------------- pull */

const strip = text => String(text ?? '')
  .toLowerCase()
  .replace(/&#\d+;/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, '')
  .replace(/\s+/g, ' ')
  .trim()

// Which unOGS series hit a franchise name means: the one sharing the most stripped tokens with the
// query. A guess, and it is confined to the SHOW: the harness derives every offset from exact
// anchors against one run, so a wrong show here fails to close rather than producing a wrong truth.
const pickHit = (query, hits) => {
  const wanted = new Set(strip(query).split(' ').filter(Boolean))
  let best
  for (const hit of hits) {
    const tokens = new Set(strip(hit.title).split(' ').filter(Boolean))
    const shared = [...wanted].filter(token => tokens.has(token)).length
    if (!best || shared > best.shared) best = { hit, shared }
  }
  return best?.shared ? best.hit : undefined
}

// `parseUnogsSeasons`'s order rule, restated: epnum decides only when every episode declares a
// distinct one, else the payload's own order stands. The number the app publishes is the POSITION.
const inNetflixOrder = episodes => {
  const numbers = new Set(episodes.map(episode => episode.epnum))
  if (numbers.has(undefined) || numbers.size !== episodes.length) return episodes
  return [...episodes].sort((a, b) => a.epnum - b.epnum)
}

const shows = []
for (const franchise of FRANCHISES) {
  const search = await cached(`search-${franchise}`, async () => {
    await sleep(700)
    return await unogs(`/search?limit=50&offset=0&query=${encodeURIComponent(franchise)}&countrylist=&country_andorunique=&start_year=&end_year=&start_rating=&end_rating=&genrelist=&type=&audio=&subtitle=&audiosubtitle_andor=&person=&personid=&filterby=&orderby=`)
  })
  const hit = pickHit(franchise, (search?.results ?? []).filter(entry => entry.vtype === 'series'))
  if (!hit) { console.log(`${franchise}: no unOGS series hit`); continue }

  const raw = await cached(`episodes-${hit.nfid}`, async () => {
    await sleep(700)
    return await unogs(`/title/episodes?netflixid=${hit.nfid}`)
  })
  const seasons = (Array.isArray(raw) ? raw : [])
    .filter(season => typeof season?.season === 'number' && Array.isArray(season.episodes))
    .map(season => ({
      seasonNumber: season.season,
      rows: inNetflixOrder(season.episodes.map(episode => ({
        epnum: typeof episode?.epnum === 'number' ? episode.epnum : undefined,
        title: typeof episode?.title === 'string' ? episode.title : '',
      }))).map((episode, index) => ({ number: index + 1, title: episode.title })),
    }))
  if (!seasons.length) { console.log(`${franchise}: nf ${hit.nfid}, no readable seasons`); continue }

  const candidates = await cached(`anilist-${franchise}`, async () => {
    await sleep(2000)
    return await anilist(franchise)
  })
  const runs = []
  for (const candidate of candidates.slice(0, 14)) {
    const mappings = await cached(`anizip-${candidate.id}`, async () => {
      await sleep(300)
      return await anizip(candidate.id)
    })
    const episodes = Object.entries(mappings?.episodes ?? {}).map(([key, episode]) => ({
      key,
      titles: [episode?.title?.en, episode?.title?.ja].filter(title => typeof title === 'string' && title.trim()),
      airDate: episode?.airDate ?? (episode?.airDateUtc ? String(episode.airDateUtc).slice(0, 10) : null),
    }))
    if (!episodes.length) continue
    runs.push({
      anilistId: candidate.id,
      title: candidate.title?.english ?? candidate.title?.romaji ?? '',
      romaji: candidate.title?.romaji ?? '',
      format: candidate.format,
      declaredEpisodes: candidate.episodes ?? null,
      startDate: candidate.startDate?.year
        ? `${candidate.startDate.year}-${String(candidate.startDate.month ?? 1).padStart(2, '0')}-${String(candidate.startDate.day ?? 1).padStart(2, '0')}`
        : null,
      episodes,
    })
  }
  shows.push({ franchise, netflixId: hit.nfid, netflixTitle: hit.title, seasons, runs })
  // written after every show, not once at the end: a pull that is killed or times out still leaves a
  // corpus the harness can read, and the harness's own floors decide whether it is enough
  writeFileSync(OUT, JSON.stringify({ fetched: new Date().toISOString(), shows }))
  console.log(`${franchise}: nf ${hit.nfid} seasons [${seasons.map(season => season.rows.length).join(',')}], ${runs.length} runs with ani.zip episodes`)
}

writeFileSync(OUT, JSON.stringify({ fetched: new Date().toISOString(), shows }))
const seasonCount = shows.reduce((total, show) => total + show.seasons.length, 0)
console.log(`\n${shows.length} shows, ${seasonCount} Netflix seasons -> ${OUT}`)
