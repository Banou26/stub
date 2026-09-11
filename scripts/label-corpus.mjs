#!/usr/bin/env node
/**
 * The hand-labelling tool for the season corpus: a local server for deciding, run by run, what the
 * sources actually said.
 *
 *   npm run corpus:label                          # the newest dump under corpus/season/
 *   npm run corpus:label -- --season summer-2026 --port 4570
 *
 * WHAT IT SERVES. The UI in `tools/label/` (dependency free, no bundler) plus a JSON API over one
 * season dump written by `scripts/walk-season-answers.mjs`. Nothing here writes under `corpus/`: the
 * dump is read only, and the walk may be appending to it while this runs, so both files are re-read
 * whenever their size or mtime moves.
 *
 * THE API.
 *
 *   GET  /api/runs          the manifest's runs, each with its aggregated uri, members, title, key
 *                           member, slug and label state (`labelled` when its case file exists and
 *                           carries `source.answers`), plus the labelled/total progress.
 *   GET  /api/runs/:index   everything the sources said about that run: its rows grouped by origin,
 *                           each with uri, origin, scope, titles, startDate, episodeCount, season,
 *                           seasonYear, url, the handles it carries (uri and relation), its episode
 *                           list, the answer keys it was built from and its raw answer. See
 *                           `rowsForRun` for which rows are present and why.
 *   GET  /api/cases/:slug   the saved case, or 404 when the run is unlabelled.
 *   POST /api/cases/:slug   validates the posted case with `validateCase` (tests/corpus/types.ts,
 *                           imported directly: node strips the types and the module has no imports
 *                           of its own) and writes `tests/corpus/cases/<slug>.json`, pretty printed
 *                           with keys sorted. A case that does not validate is refused with the
 *                           validator's own message and nothing is written.
 *
 * THE CASE IT WRITES. The format is `tests/corpus/types.ts`, and what the tool fills in is:
 *
 *   source.file     the dump the case was built from, relative to the repo root
 *   source.test     the run's aggregated uri, which is the address the walk loaded
 *   source.answers  the `key` of every answer row the case was actually built from: the richest
 *                   answer for each judged row, and the richest for each of its episodes. The dump
 *                   holds many more answers per uri (95 for one member of the first run), all of
 *                   them re-findable from the uri, and naming all of them would bury the ones the
 *                   rows came from.
 *   rows / episodes the store-shaped fields of every judged row, each keeping its own `raw`
 *   expect         `together`, `apart`, `partOf`, `includes`, `episodePairs`, `episodeApart` and
 *                  `unrelated`, from the marks the owner made. An unmarked row asserts nothing.
 *   checked        who decided it and when, which `validateCase` requires for those expectations
 *
 * FLAGS.
 *   --port N       default 4570, 0 for a free one
 *   --season NAME  the directory under `--out`, default the most recently written one
 *   --dir PATH     a season directory outright, which is how the test points it at a fixture
 *   --out PATH     where season directories live, default corpus/season
 *   --cases PATH   where case files are read and written, default tests/corpus/cases
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

import { validateCase } from '../tests/corpus/types.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UI_DIR = resolve(ROOT, 'tools/label')

/** A path named the way the repo names it, and left alone when it is not in the repo. */
const underRoot = path => (path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path)

/* --------------------------------------------------------------------------------------------- */
/* the dump                                                                                        */
/* --------------------------------------------------------------------------------------------- */

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

/**
 * The dump a megabyte at a time, because a full season is 200 to 500 MB: reading it as one string
 * and splitting that costs more than twice the file in memory at once (measured at 130 MB: a 1 GB
 * peak this way, 195 MB chunked). The decoder is what makes the chunking safe, since a Japanese
 * title straddles a chunk boundary sooner or later.
 */
const eachLine = (path, onLine) => {
  const fd = openSync(path, 'r')
  const decoder = new StringDecoder('utf8')
  const buffer = Buffer.allocUnsafe(1 << 20)
  let rest = ''
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (!read) break
      const lines = (rest + decoder.write(buffer.subarray(0, read))).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) if (line) onLine(line)
    }
    rest += decoder.end()
    if (rest) onLine(rest)
  } finally {
    closeSync(fd)
  }
}

/**
 * How much of a work one answer describes, used to pick a representative when a uri was answered
 * many times.
 *
 * A uri is answered once per page it appeared on and once per operation, so a member of the first
 * run carries 95 answers of the same work in three shapes: the MEDIA one that is mostly ids, the
 * MEDIA_PAGE one that carries titles and handles, and the one a listing asked for. Only the fullest
 * is worth showing and keeping, and identity is what the labeller reads, so titles and handles
 * outweigh everything else.
 */
const richness = raw =>
  Object.keys(raw).length
  + (raw.titles?.length ?? 0) * 4
  + (raw.handles?.length ?? 0) * 4
  + (raw.episodes?.length ?? 0) * 2

const readDump = dir => {
  const manifest = readJson(join(dir, 'manifest.json'))
  /** uri -> the fullest media answer, the key it came from, and how many answers describe it */
  const media = new Map()
  /** uri -> the nested handle node, for a uri that answered nothing of its own */
  const nodes = new Map()
  /** handle target uri -> the media uris whose handles name it */
  const namedBy = new Map()
  /** media uri -> episode uri -> the fullest episode answer */
  const episodes = new Map()
  /** origin id -> the source's own description of itself */
  const origins = new Map()

  const addEpisode = (mediaUri, raw, key) => {
    if (!mediaUri || typeof raw?.uri !== 'string') return
    const list = episodes.get(mediaUri) ?? new Map()
    const seen = list.get(raw.uri)
    const rank = richness(raw)
    if (!seen || rank > seen.rank) list.set(raw.uri, { raw, key, rank })
    episodes.set(mediaUri, list)
  }

  eachLine(join(dir, 'answers.jsonl'), line => {
    let row
    let raw
    try {
      row = JSON.parse(line)
      raw = typeof row.raw === 'string' ? JSON.parse(row.raw) : row.raw
    } catch {
      // the walk appends while this reads, so the last line can be half written
      return
    }
    if (!raw || typeof raw !== 'object') return
    if (row.kind === 'origin') {
      origins.set(row.uri, raw)
      return
    }
    if (row.kind === 'episode') {
      addEpisode(raw.mediaUri, raw, row.key)
      return
    }
    if (row.kind !== 'media') return

    const rank = richness(raw)
    const seen = media.get(row.uri)
    if (!seen) media.set(row.uri, { uri: row.uri, origin: row.origin, raw, key: row.key, rank, answers: 1 })
    else {
      seen.answers += 1
      if (rank > seen.rank) {
        seen.raw = raw
        seen.key = row.key
        seen.rank = rank
      }
    }

    for (const handle of raw.handles ?? []) {
      const node = handle?.node
      if (typeof node?.uri !== 'string') continue
      if (!nodes.has(node.uri)) nodes.set(node.uri, { node, key: row.key })
      const namers = namedBy.get(node.uri) ?? new Map()
      if (!namers.has(row.uri)) namers.set(row.uri, handle.relation ?? 'SAME_AS')
      namedBy.set(node.uri, namers)
    }
    for (const episode of raw.episodes ?? []) addEpisode(episode?.mediaUri ?? row.uri, episode, row.key)
  })

  return { dir, manifest, media, nodes, namedBy, episodes, origins }
}

/** A dump kept in memory until either of its two files moves, because the walk may still be writing. */
const dumpReader = dir => {
  let loaded
  let stamp
  const mark = () => ['answers.jsonl', 'manifest.json']
    .map(name => {
      const at = join(dir, name)
      const stat = existsSync(at) ? statSync(at) : undefined
      return `${stat?.size ?? -1}:${stat?.mtimeMs ?? -1}`
    })
    .join('|')
  return () => {
    const now = mark()
    if (!loaded || now !== stamp) {
      loaded = readDump(dir)
      stamp = now
    }
    return loaded
  }
}

/* --------------------------------------------------------------------------------------------- */
/* the run, and the rows a labeller judges                                                         */
/* --------------------------------------------------------------------------------------------- */

/**
 * The member whose uri the case is written around: the slug it is filed under, the part of every
 * `partOf` the run is on, and the side of every `apart` pair.
 *
 * A catalogue that names the work by a stable id comes first, because that id is what the case is
 * read back by. The order is a preference and never a filter: a run whose members are all streaming
 * ids still gets one, its first sorted member.
 */
const KEY_ORIGINS = ['anilist', 'mal', 'kitsu', 'anizip', 'offline']

export const keyMemberOf = members => {
  for (const origin of KEY_ORIGINS) {
    const found = members.find(uri => uri.startsWith(`${origin}:`))
    if (found) return found
  }
  return [...members].sort()[0]
}

/** `anilist:178789` becomes `anilist-178789`: one case file per run, findable from the run's uri. */
export const slugOf = uri => String(uri).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Every row a labeller must judge for one run: its members, plus ONE hop through the raw handles,
 * in both directions.
 *
 * Both directions are needed and neither reaches the other's rows.
 *
 * - Forwards, a row whose own handles name a member. A catalogue season that claims the run is only
 *   ever found this way, because the claim is on the season and the member says nothing about it.
 * - Backwards, the nested handle nodes a member names. A container the run is a part of usually
 *   answers nothing of its own, so it exists in the dump only as a node inside a member's answer:
 *   `cr:G24H1N3MP` is exactly that, named PART_OF by `kitsu:49002` and carried by no answer's uri.
 *
 * One hop and no more. A second hop reaches the other seasons of the same show through the
 * container, which is a different question from the one this run is being labelled for, and it
 * would put fifty rows in front of the owner to judge one.
 */
export const rowsForRun = (dump, members) => {
  const found = new Map()
  const add = (uri, why) => {
    const seen = found.get(uri)
    if (seen) seen.why.add(why)
    else found.set(uri, { uri, why: new Set([why]) })
  }
  for (const member of members) add(member, 'member')
  for (const member of members) {
    for (const handle of dump.media.get(member)?.raw?.handles ?? []) {
      if (typeof handle?.node?.uri === 'string' && !members.includes(handle.node.uri)) add(handle.node.uri, 'named by a member')
    }
    for (const namer of dump.namedBy.get(member)?.keys() ?? []) {
      if (!members.includes(namer)) add(namer, 'names a member')
    }
  }
  return [...found.values()]
}

const titleOf = titles => {
  const list = Array.isArray(titles) ? titles : []
  return (list.find(entry => entry?.language === 'en') ?? list[0])?.title
}

/** One media row as the UI reads it: the store-shaped fields, what it claims, and what it drew. */
const viewRow = (dump, uri, why, members) => {
  const answer = dump.media.get(uri)
  const node = dump.nodes.get(uri)
  const raw = answer?.raw ?? node?.node ?? { uri }
  const key = answer?.key ?? node?.key
  const episodes = [...(dump.episodes.get(uri)?.values() ?? [])]
    .sort((a, b) => (a.raw.episodeNumber ?? 0) - (b.raw.episodeNumber ?? 0) || a.raw.uri.localeCompare(b.raw.uri))
  return {
    uri,
    origin: answer?.origin ?? raw.origin ?? uri.slice(0, uri.indexOf(':')),
    id: raw.id ?? uri.slice(uri.indexOf(':') + 1),
    scope: raw.scope === 'CONTAINER' || raw.scope === 'RUN' ? raw.scope : undefined,
    type: raw.type ?? null,
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    titles: Array.isArray(raw.titles) ? raw.titles : [],
    title: titleOf(raw.titles),
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    episodeCount: typeof raw.episodeCount === 'number' ? raw.episodeCount : null,
    season: raw.season ?? null,
    seasonYear: typeof raw.seasonYear === 'number' ? raw.seasonYear : null,
    score: typeof raw.score === 'number' ? raw.score : null,
    url: raw.url ?? null,
    isMember: members.includes(uri),
    why: [...why],
    handles: (raw.handles ?? [])
      .filter(handle => typeof handle?.node?.uri === 'string')
      .map(handle => ({ uri: handle.node.uri, relation: handle.relation ?? 'SAME_AS', scope: handle.node.scope ?? null })),
    namedBy: [...(dump.namedBy.get(uri)?.entries() ?? [])].map(([from, relation]) => ({ uri: from, relation })),
    episodes: episodes.map(entry => ({
      uri: entry.raw.uri,
      origin: entry.raw.origin ?? null,
      id: entry.raw.id ?? null,
      mediaUri: entry.raw.mediaUri ?? uri,
      number: typeof entry.raw.episodeNumber === 'number' ? entry.raw.episodeNumber : null,
      title: titleOf(entry.raw.titles) ?? null,
      titles: Array.isArray(entry.raw.titles) ? entry.raw.titles : [],
      releaseDate: entry.raw.releaseDate ?? null,
      score: typeof entry.raw.score === 'number' ? entry.raw.score : null,
      answerKey: entry.key ?? null,
    })),
    answerKey: key ?? null,
    answerKeys: [key, ...episodes.map(entry => entry.key)].filter(entry => typeof entry === 'string'),
    answers: answer?.answers ?? 0,
    raw,
  }
}

const runEntry = (dump, casesDir, index) => {
  const run = dump.manifest.runs?.[index]
  if (!run) return undefined
  const members = run.members ?? []
  const keyMember = keyMemberOf(members)
  const slug = slugOf(keyMember)
  return {
    index,
    uri: run.uri,
    title: run.title ?? keyMember,
    members,
    memberOrigins: [...new Set(members.map(uri => uri.slice(0, uri.indexOf(':'))))].sort(),
    answerOrigins: run.answerOrigins ?? [],
    rows: run.rows ?? 0,
    keyMember,
    slug,
    state: caseState(casesDir, slug),
  }
}

/* --------------------------------------------------------------------------------------------- */
/* cases                                                                                           */
/* --------------------------------------------------------------------------------------------- */

const casePath = (casesDir, slug) => join(casesDir, `${slug}.json`)

/** Labelled means a case file exists AND carries the walk's own provenance, never merely exists. */
const caseState = (casesDir, slug) => {
  const at = casePath(casesDir, slug)
  if (!existsSync(at)) return 'unlabelled'
  try {
    return readJson(at).source?.answers?.length ? 'labelled' : 'unlabelled'
  } catch {
    return 'unlabelled'
  }
}

/** Keys sorted at every depth, so two saves of the same decisions produce the same bytes. */
const sortKeys = value =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]))
      : value

/* --------------------------------------------------------------------------------------------- */
/* the server                                                                                      */
/* --------------------------------------------------------------------------------------------- */

const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }
const UI_FILES = new Set(['/', '/index.html', '/app.js', '/style.css'])

const send = (response, status, body, type = 'application/json') => {
  const payload = type.startsWith('application/json') ? JSON.stringify(body) : body
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(payload)
}

const readBody = request => new Promise((done, fail) => {
  const chunks = []
  let size = 0
  request.on('data', chunk => {
    size += chunk.length
    if (size > 32_000_000) fail(new Error('the posted case is over 32 MB'))
    else chunks.push(chunk)
  })
  request.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
  request.on('error', fail)
})

/**
 * Starts the label server and resolves once it is listening.
 *
 * @param options.dir      a season directory holding answers.jsonl and manifest.json
 * @param options.casesDir where case files are read and written
 * @param options.port     0 for a free port
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export const startLabelServer = async ({ dir, casesDir, port = 4570, host = '127.0.0.1' }) => {
  const season = resolve(dir)
  const dump = dumpReader(season)
  const sourceFile = `${underRoot(season)}/answers.jsonl`

  const handle = async (request, response) => {
    const url = new URL(request.url, 'http://label')
    const path = url.pathname

    if (request.method === 'GET' && UI_FILES.has(path)) {
      const file = join(UI_DIR, path === '/' ? 'index.html' : path.slice(1))
      if (!existsSync(file)) return send(response, 404, { error: `${path} is not in tools/label` })
      return send(response, 200, readFileSync(file, 'utf8'), TYPES[extname(file)] ?? 'text/plain')
    }

    if (request.method === 'GET' && path === '/api/runs') {
      const loaded = dump()
      const runs = (loaded.manifest.runs ?? []).map((_, index) => runEntry(loaded, casesDir, index))
      return send(response, 200, {
        season: loaded.manifest.seasonDir ?? loaded.manifest.season ?? '',
        dump: { file: sourceFile, runs: runs.length, rows: loaded.manifest.totals?.rows ?? 0, media: loaded.media.size },
        progress: { labelled: runs.filter(run => run.state === 'labelled').length, total: runs.length },
        runs,
      })
    }

    const runAt = path.match(/^\/api\/runs\/(\d+)$/)
    if (request.method === 'GET' && runAt) {
      const loaded = dump()
      const entry = runEntry(loaded, casesDir, Number(runAt[1]))
      if (!entry) return send(response, 404, { error: `no run at index ${runAt[1]}` })
      const rows = rowsForRun(loaded, entry.members).map(found => viewRow(loaded, found.uri, found.why, entry.members))
      const byOrigin = new Map()
      for (const row of rows) {
        const group = byOrigin.get(row.origin) ?? { origin: row.origin, name: loaded.origins.get(row.origin)?.name ?? row.origin, rows: [] }
        group.rows.push(row)
        byOrigin.set(row.origin, group)
      }
      // the run's own origins first, so the rows the labeller already trusts head the page
      const holdsAMember = group => (group.rows.some(row => row.isMember) ? 0 : 1)
      const groups = [...byOrigin.values()].sort((a, b) => holdsAMember(a) - holdsAMember(b) || a.origin.localeCompare(b.origin))
      for (const group of groups) group.rows.sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.uri.localeCompare(b.uri))
      return send(response, 200, { ...entry, source: { file: sourceFile, test: entry.uri }, origins: groups })
    }

    const caseAt = path.match(/^\/api\/cases\/([a-zA-Z0-9-]+)$/)
    if (caseAt) {
      const slug = caseAt[1]
      if (request.method === 'GET') {
        const at = casePath(casesDir, slug)
        if (!existsSync(at)) return send(response, 404, { error: `no case at ${slug}.json yet` })
        return send(response, 200, { slug, path: at, case: readJson(at) })
      }
      if (request.method === 'POST') {
        let parsed
        try {
          parsed = JSON.parse(await readBody(request))
        } catch (error) {
          return send(response, 400, { error: `the posted body is not JSON: ${error.message}` })
        }
        let validated
        try {
          validated = validateCase(parsed, `${slug}.json`)
        } catch (error) {
          return send(response, 400, { error: error.message })
        }
        mkdirSync(casesDir, { recursive: true })
        const at = casePath(casesDir, slug)
        writeFileSync(at, `${JSON.stringify(sortKeys(validated), undefined, 2)}\n`)
        return send(response, 200, { slug, path: at, case: validated })
      }
    }

    return send(response, 404, { error: `${request.method} ${path} is not a route` })
  }

  const server = createServer((request, response) => {
    handle(request, response).catch(error => send(response, 500, { error: String(error?.message ?? error) }))
  })
  await new Promise(done => server.listen(port, host, done))
  const bound = server.address().port
  return {
    url: `http://${host}:${bound}`,
    port: bound,
    // a keep-alive socket the browser or a test's fetch left idle would hold `close` open forever
    close: () => new Promise(done => {
      server.closeIdleConnections()
      server.close(done)
    }),
  }
}

/* --------------------------------------------------------------------------------------------- */
/* cli                                                                                             */
/* --------------------------------------------------------------------------------------------- */

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const argv = process.argv.slice(2)
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1]
  }
  const die = message => {
    console.error(`[label] ${message}`)
    process.exit(2)
  }

  const outBase = resolve(ROOT, flag('out', 'corpus/season'))
  const named = flag('dir', undefined)
  const season = flag('season', undefined)
  const newest = () => {
    if (!existsSync(outBase)) return undefined
    const dirs = readdirSync(outBase)
      .map(name => join(outBase, name))
      .filter(at => statSync(at).isDirectory() && existsSync(join(at, 'manifest.json')))
      .sort((a, b) => statSync(join(b, 'manifest.json')).mtimeMs - statSync(join(a, 'manifest.json')).mtimeMs)
    return dirs[0]
  }
  const dir = named ? resolve(ROOT, named) : season ? join(outBase, season) : newest()
  if (!dir || !existsSync(join(dir, 'manifest.json'))) {
    die(`no season dump found${dir ? ` at ${dir}` : ` under ${outBase}`}. Run \`npm run corpus:walk\` first.`)
  }

  const casesDir = resolve(ROOT, flag('cases', 'tests/corpus/cases'))
  const manifest = readJson(join(dir, 'manifest.json'))
  startLabelServer({ dir, casesDir, port: Number(flag('port', 4570)) }).then(started => {
    console.log(`[label] ${manifest.seasonDir ?? manifest.season}: ${manifest.runs?.length ?? 0} runs from ${underRoot(dir)}`)
    console.log(`[label] cases go to ${underRoot(casesDir)}/`)
    console.log(`[label] ${started.url}`)
  }, error => die(String(error?.message ?? error)))
}
