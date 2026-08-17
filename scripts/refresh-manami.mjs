#!/usr/bin/env node
// NOT WIRED INTO THE BUILD, AND MUST NOT BE UNTIL A LICENSING QUESTION IS ANSWERED.
//
// The cross-id half of this job moved to scripts/build-anime-index.mjs, which uses the MIT-licensed
// `@kawaiioverflow/arm` npm package and beats this on coverage, freshness and pinning. What is left
// here is the SEASONAL half, which arm cannot do because it carries no titles, covers or seasons.
//
// Three things to settle before this ships, all measured:
//
//   1. LICENSE. manami is ODbL v1.0. Section 4.4 attaches share-alike to a Derivative Database, and
//      a re-encoded seasonal extract is one (section 4.5's Produced Work carve-out covers the
//      rendered page, not the shipped table). stub is MIT. Shipping this needs the artifact licensed
//      ODbL with a notice inside the file, manami's notices kept, a user-visible attribution under
//      4.3, and an offer of the whole derived database under 4.6.
//   2. PARTIAL SEASONS. A season grows in the dump as it matures: WINTER and SPRING 2026 have settled
//      at 350 and 400 entries while FALL 2026 currently holds 158. With the release cadence below,
//      stub could present a fall row missing well over half the season with the authority of bundled
//      first-party data, which is worse than showing nothing.
//   3. DUPLICATES. manami does not fully dedup itself, so the slice injects them: SUMMER 2026 holds
//      both "Azur Lane: Bisoku Zenshin! Ni!!" and "Azur Lane: Slow Ahead! 2!" as separate rows.
//      Only 140 of the 219 carry an AniList or MyAnimeList id at all, so the other 79 can never
//      merge with another source and would render as a second card for a show already on screen.
//
// Note also what this is NOT for. stub has no service worker and no Cache Storage (grepped, with a
// control), so it has no offline mode and a bundled dataset is fetched over the same network as
// everything else. The value here is surviving an UPSTREAM outage, which is what actually happened
// on 2026-08-16 when AniList answered 403 and Jikan 504 with the network perfectly healthy.
//
// Output goes to src/generated/, which is gitignored, so running this cannot accidentally commit
// ODbL-licensed data into an MIT repo.
//
// Turn manami-project/anime-offline-database into the two small artifacts stub loads lazily.
//
// The upstream dump is 41,537 entries, 62 MB of JSON, published as a GitHub release asset. Nothing
// that size can reach a browser, so everything the app needs is decided here and the browser only
// ever sees the result.
//
// Two artifacts, because the dump carries two unrelated kinds of value:
//
//   manami-index.json    every entry holding at least two catalog ids, as four columns. SUPERSEDED
//                        by scripts/build-anime-index.mjs and kept only so the two can be compared:
//                        this carries 18,858 MyAnimeList to AniList pairs against arm's 20,754.
//   manami-seasons.json  a window of seasonal listings as slim records, which is the half arm cannot
//                        supply and the only reason this script still exists.
//
// Run it with `npm run data:refresh-manami`. It is NOT part of `npm run build`, deliberately:
// manami publishes irregularly (2026 saw releases in weeks 1, 2, 3, 5, 11, 12, 13, 14 and then
// nothing until 27, a thirteen week gap), so a build-time download would put a third party on the
// critical path of every Cloudflare Pages deploy in exchange for data that almost never changes.

import { writeFileSync, mkdirSync } from 'node:fs'
import { brotliCompressSync, constants, zstdDecompressSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/generated')
const REPO = 'manami-project/anime-offline-database'
const ASSET = 'anime-offline-database.jsonl.zst'

// Which catalogs are worth a column: exactly the origins stub already uses as handles, since a
// handle whose origin no source emits can never match anything and only costs bytes. manami also
// carries anime-planet, anisearch, livechart, animecountdown, simkl and animenewsnetwork ids, and
// stub has no source keyed on any of them. It carries NO imdb or tmdb id, which is why this cannot
// help the streaming catalogs and only ever links the anime ones to each other.
const CATALOGS = [
  { key: 'anilist', host: 'anilist.co' },
  { key: 'mal', host: 'myanimelist.net' },
  { key: 'kitsu', host: 'kitsu.app' },
  { key: 'anidb', host: 'anidb.net' },
]

// How much of the season list to carry. The artifact is committed, so it has to stay valid as the
// clock moves past the season it was built in: shipping only the current one would leave the floor
// empty on the first day of the next season. manami lists seasons well ahead (the 2026-07 dump
// already held 158 entries for FALL 2026 and 85 for WINTER 2027), so a forward window costs little
// and buys a year of drift.
const SEASONS_BACK = 1
const SEASONS_FORWARD = 4

const SEASON_ORDER = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

const log = (...args) => console.log('[manami]', ...args)

const seasonIndex = ({ year, season }) => year * 4 + SEASON_ORDER.indexOf(season)

/** The newest release that actually carries the asset, and the tag it came from. */
const resolveRelease = async () => {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'stub-manami-refresh' },
  })
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`)
  const releases = await response.json()

  // Sorted by the tag's own YYYY-WW rather than by published_at, because the repo also carries a
  // rolling `latest` tag whose published_at is frozen at the date it was FIRST created (2025-06-20),
  // so "newest by date" picks a tag a year older than the real newest one.
  const dated = releases
    .filter(release => /^\d{4}-\d{2}$/.test(release.tag_name))
    .sort((a, b) => b.tag_name.localeCompare(a.tag_name))

  for (const release of dated) {
    const asset = release.assets.find(candidate => candidate.name === ASSET)
    if (asset) return { tag: release.tag_name, url: asset.browser_download_url, size: asset.size }
  }
  throw new Error(`no release carries ${ASSET}`)
}

const idIn = (sources, host) => {
  const url = sources.find(source => source.includes(host))
  if (!url) return 0
  const id = /(\d+)\/?$/.exec(url)?.[1]
  return id ? Number(id) : 0
}

/**
 * Sorted by MyAnimeList id and stored one column per catalog, with the sorted column delta-coded.
 *
 * Measured against the alternatives on the real 23,136 rows: this is 112 KB brotli where the
 * obvious array-of-rows shape is 179 KB, and a hand-rolled text encoding of the same columns is
 * also 112 KB, so the extra parser it would need buys nothing. Decode is one JSON.parse plus a
 * running sum, 1.2 ms and 3.3 ms respectively on this machine.
 *
 * Zero means absent. It is never a real id in any of these catalogs, so no sentinel is needed.
 */
const buildIndex = entries => {
  const rows = entries
    .map(entry => CATALOGS.map(({ host }) => idIn(entry.sources, host)))
    // An entry holding one id links nothing to anything: the whole point is to carry a record from
    // the id it has to the id it lacks. Dropping them is 41,537 rows down to 23,136, and 179 KB
    // down to 112 KB, with no lookup lost.
    .filter(row => row.filter(Boolean).length >= 2)
    .sort((a, b) => a[1] - b[1])

  let previous = 0
  const mal = rows.map(row => {
    if (!row[1]) return 0
    const delta = row[1] - previous
    previous = row[1]
    return delta
  })

  return {
    anilist: rows.map(row => row[0]),
    mal,
    kitsu: rows.map(row => row[2]),
    anidb: rows.map(row => row[3]),
  }
}

/**
 * One season's entries, trimmed to what stub can render.
 *
 * Deliberately absent, because the dump has neither: a synopsis and a popularity count. So these
 * records fill a card and a cover but can never fill the hero's description, and they carry no
 * signal for the homepage's popularity sort.
 */
const slimEntry = entry => {
  const record = {
    t: entry.title,
    ty: entry.type,
    // A MyAnimeList CDN path, with the constant prefix dropped and restored on the client. Every
    // entry has one, and the prefix is 42 bytes of the roughly 70 byte value.
    p: entry.picture?.replace('https://cdn.myanimelist.net/images/anime/', '') ?? '',
  }
  if (entry.episodes) record.ep = entry.episodes
  for (const [index, { key }] of CATALOGS.entries()) {
    if (index > 2) continue
    const id = idIn(entry.sources, CATALOGS[index].host)
    if (id) record[key === 'anilist' ? 'al' : key === 'mal' ? 'ml' : 'ku'] = id
  }
  // The arithmetic mean over the catalogs that carry a score, on manami's stated 1 to 10 range.
  if (entry.score?.arithmeticMean) record.sc = Math.round(entry.score.arithmeticMean * 100) / 100
  return record
}

/**
 * NOT keyed on manami's own `status` field, and this is the load-bearing decision in the file.
 *
 * `status` is a snapshot taken when the dump was cut and it decays immediately: the 2026-07-04 dump
 * marks 192 of its 219 SUMMER 2026 entries UPCOMING and only 17 ONGOING, and every one of those was
 * airing six weeks later. A source that mapped `status` onto RELEASING would therefore serve a
 * nearly empty season row that looked exactly like a working one. `animeSeason` is a property of
 * the show and does not decay, so it is the only field here safe to key a seasonal listing on.
 */
const buildSeasons = (entries, newest) => {
  const from = seasonIndex(newest) - SEASONS_BACK
  const to = seasonIndex(newest) + SEASONS_FORWARD
  const seasons = {}
  for (const entry of entries) {
    const season = entry.animeSeason
    if (!season?.year || !SEASON_ORDER.includes(season.season)) continue
    const index = seasonIndex(season)
    if (index < from || index > to) continue
    const key = `${season.year}-${season.season}`
    ;(seasons[key] ??= []).push(slimEntry(entry))
  }
  return seasons
}

const write = (name, value) => {
  const json = JSON.stringify(value)
  writeFileSync(resolve(OUT_DIR, name), json)
  const brotli = brotliCompressSync(Buffer.from(json), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  })
  log(`${name.padEnd(22)} ${(json.length / 1024).toFixed(0).padStart(5)} KB raw, ${(brotli.length / 1024).toFixed(0).padStart(4)} KB brotli`)
  return brotli.length
}

const main = async () => {
  const release = await resolveRelease()
  log(`release ${release.tag}, ${(release.size / 1024 / 1024).toFixed(1)} MB compressed`)

  const response = await fetch(release.url)
  if (!response.ok) throw new Error(`download: HTTP ${response.status}`)
  const jsonl = zstdDecompressSync(Buffer.from(await response.arrayBuffer())).toString('utf8')

  const lines = jsonl.split('\n').filter(Boolean)
  const meta = JSON.parse(lines[0])
  const entries = lines.slice(1).map(line => JSON.parse(line))
  log(`${entries.length} entries, upstream lastUpdate ${meta.lastUpdate}`)

  // Anchored on the date the dump was CUT, not on the clock and not on the newest season present.
  //
  // The clock is wrong because a committed artifact is refreshed by hand: building the window off
  // today would make it drift out from under the season it was built for. The newest season present
  // is wrong for a sharper reason, and it was measured rather than guessed: a single already
  // announced entry sits in WINTER 2030, so taking the maximum put the whole window five years out
  // and emitted ONE anime. That artifact was 0 KB, the run reported success, and the source it fed
  // would have returned nothing forever while every log line above looked healthy.
  const cut = new Date(`${meta.lastUpdate}T00:00:00Z`)
  const newest = { year: cut.getUTCFullYear(), season: SEASON_ORDER[Math.floor(cut.getUTCMonth() / 3)] }
  log(`dump cut in ${newest.year}-${newest.season}, windowing ${SEASONS_BACK} back and ${SEASONS_FORWARD} forward`)

  mkdirSync(OUT_DIR, { recursive: true })

  const index = buildIndex(entries)
  const seasons = buildSeasons(entries, newest)

  for (const [key, list] of Object.entries(seasons)) log(`  season ${key.padEnd(12)} ${String(list.length).padStart(4)} entries`)

  const total =
    write('manami-index.json', { tag: release.tag, updated: meta.lastUpdate, ...index }) +
    write('manami-seasons.json', { tag: release.tag, updated: meta.lastUpdate, seasons })

  log(`${index.mal.length} indexed rows, ${Object.keys(seasons).length} seasons`)
  log(`${(total / 1024).toFixed(0)} KB brotli total, none of it in the initial bundle`)
}

await main()
