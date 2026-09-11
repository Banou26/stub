// The label server, against a fixture dump small enough to read: two members, a third row that names
// one of them, a handle to a container that answers nothing of its own, and one episode.
//
// What it pins is the half of the tool that no screenshot can check: which rows the one-hop expansion
// puts in front of a judge, the case skeleton both a labelling agent and the UI build every case out
// of, that a case only ever reaches `tests/corpus/cases/` through `validateCase`, that no raw answer
// survives into the file it writes, and the compact read the labelling agents work from. The cases
// here are written into a temp directory, never into the corpus.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { compactRow, startLabelServer } from '../../../scripts/label-corpus.mjs'
import { validateCase } from '../../corpus/types'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

let server: { url: string, close: () => Promise<void> }
let work: string
let casesDir: string
let reviewFile: string

/** A `raw` key at any depth, which is what a written case must never carry. */
const hasRawKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasRawKey)
  if (value === null || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => key === 'raw' || hasRawKey(entry))
}

const text = async (path: string) => {
  const response = await fetch(`${server.url}${path}`)
  return await response.text()
}

const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${server.url}${path}`, init)
  return { status: response.status, body: await response.json() as any }
}

const post = (slug: string, body: unknown) =>
  api(`/api/cases/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** The rows the detail returned, flattened out of their origin groups. */
const rowsOf = (detail: any): any[] => detail.origins.flatMap((group: any) => group.rows)

/** A case the way the UI builds one: the two members are the run, the container holds it. */
const caseFrom = (detail: any, overrides: Record<string, unknown> = {}) => {
  const rows = rowsOf(detail)
  const shaped = rows.map(row => ({
    uri: row.uri,
    origin: row.origin,
    id: row.id,
    type: row.type ?? undefined,
    titles: row.titles,
    startDate: row.startDate ?? undefined,
    episodeCount: row.episodeCount ?? undefined,
    scope: row.scope,
    raw: row.raw,
  }))
  return {
    name: 'the fixture run is held by one crunchyroll season',
    source: { file: detail.source.file, test: detail.source.test, answers: rows.flatMap(row => row.answerKeys) },
    why: 'The two catalogue rows are one broadcast run, and the Crunchyroll series is the show that run belongs to.',
    rows: shaped,
    claims: [{ mediaUri: 'anilist:1', handleUri: 'cr:CONTAINER1', relation: 'PART_OF' }],
    episodes: rows
      .flatMap(row => row.episodes.map((episode: any) => ({
        uri: episode.uri,
        origin: episode.origin,
        id: episode.id,
        mediaUri: episode.mediaUri,
        episodeNumber: episode.number,
        releaseDate: episode.releaseDate ?? undefined,
        titles: episode.titles,
      }))),
    expect: {
      together: [['anilist:1', 'kitsu:2', 'cr:CONTAINER1-S1']],
      apart: [],
      partOf: [{ part: detail.keyMember, whole: 'cr:CONTAINER1' }],
    },
    checked: { by: 'the test', at: '2026-09-12' },
    pending: 'new store',
    ...overrides,
  }
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'label-cases-'))
  casesDir = join(work, 'cases')
  // the queue sits beside the cases directory, which is where the default puts it in the repo
  reviewFile = join(work, 'review.jsonl')
  mkdirSync(casesDir, { recursive: true })
  server = await startLabelServer({ dir: FIXTURES, casesDir, port: 0 })
})

afterAll(async () => {
  await server.close()
  rmSync(work, { recursive: true, force: true })
})

describe('GET /api/runs', () => {
  test('lists the manifest run with its members, key member, slug and label state', async () => {
    const { status, body } = await api('/api/runs')
    expect(status).toBe(200)
    expect(body.season).toBe('summer-2026')
    expect(body.progress).toEqual({ labelled: 0, total: 1 })
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0]).toMatchObject({
      index: 0,
      uri: 'ag:(anilist:1,kitsu:2)',
      title: 'Fixture Show Season 2',
      members: ['anilist:1', 'kitsu:2'],
      memberOrigins: ['anilist', 'kitsu'],
      keyMember: 'anilist:1',
      slug: 'anilist-1',
      state: 'unlabelled',
    })
  })
})

describe('GET /api/runs/:index', () => {
  test('groups the rows by origin and names the run', async () => {
    const { status, body } = await api('/api/runs/0')
    expect(status).toBe(200)
    expect(body.keyMember).toBe('anilist:1')
    // the dump names itself relative to the repo root, which is what `source.file` carries
    expect(body.source).toEqual({ file: 'tests/unit/tools/fixtures/answers.jsonl', test: 'ag:(anilist:1,kitsu:2)' })
    // the origins carrying a member come first, so the rows the labeller already trusts head the page
    expect(body.origins.map((group: any) => group.origin)).toEqual(['anilist', 'kitsu', 'cr'])
    expect(body.origins.find((group: any) => group.origin === 'cr').name).toBe('Crunchyroll')
  })

  test('the one hop reaches the container a member names and the season that names a member', async () => {
    const { body } = await api('/api/runs/0')
    const rows = rowsOf(body)
    expect(rows.map(row => row.uri).sort()).toEqual(['anilist:1', 'cr:CONTAINER1', 'cr:CONTAINER1-S1', 'kitsu:2'])
    expect(rows.filter(row => row.isMember).map(row => row.uri)).toEqual(['anilist:1', 'kitsu:2'])

    // backwards: the container answered nothing of its own and exists only as a node inside anilist:1
    const container = rows.find(row => row.uri === 'cr:CONTAINER1')
    expect(container).toMatchObject({ scope: 'CONTAINER', why: ['named by a member'], answers: 0 })
    expect(container.url).toBe('https://www.crunchyroll.com/series/CONTAINER1/fixture-show')
    expect(container.namedBy).toEqual([{ uri: 'anilist:1', relation: 'PART_OF' }])

    // forwards: the season claims a member, and the member says nothing about the season
    const season = rows.find(row => row.uri === 'cr:CONTAINER1-S1')
    expect(season).toMatchObject({ why: ['names a member'], scope: 'RUN', episodeCount: 24, season: 'WINTER', seasonYear: 2026 })
    expect(season.handles).toEqual([{ uri: 'anilist:1', relation: 'SAME_AS', scope: 'RUN' }])
  })

  test('a row carries its titles, dates, url, episode list and the answer keys it was built from', async () => {
    const { body } = await api('/api/runs/0')
    const rows = rowsOf(body)
    const member = rows.find(row => row.uri === 'anilist:1')
    expect(member).toMatchObject({
      origin: 'anilist',
      id: '1',
      scope: 'RUN',
      startDate: '2026-07-05T15:00:00Z',
      episodeCount: 12,
      season: 'SUMMER',
      seasonYear: 2026,
      url: 'https://anilist.co/anime/1',
      title: 'Fixture Show Season 2',
      answerKey: 'key-anilist-1',
    })
    expect(member.titles).toEqual([{ language: 'en', title: 'Fixture Show Season 2', score: 0.9 }])
    expect(member.handles).toEqual([
      { uri: 'kitsu:2', relation: 'SAME_AS', scope: 'RUN' },
      { uri: 'cr:CONTAINER1', relation: 'PART_OF', scope: 'CONTAINER' },
    ])
    expect(member.raw.uri).toBe('anilist:1')

    const withEpisode = rows.find(row => row.uri === 'kitsu:2')
    expect(withEpisode.episodes).toEqual([{
      uri: 'kitsu:2-1',
      origin: 'kitsu',
      id: '2-1',
      mediaUri: 'kitsu:2',
      number: 1,
      title: 'The first one',
      titles: [{ language: 'en', title: 'The first one', score: 0.8 }],
      releaseDate: '2026-07-05T15:00:00Z',
      score: 0.8,
      answerKey: 'key-kitsu-2-e1',
    }])
    // two answers describe kitsu:2 and the fuller one is the row, with both keys still counted
    expect(withEpisode.answers).toBe(2)
    expect(withEpisode.answerKey).toBe('key-kitsu-2')
    expect(withEpisode.answerKeys).toEqual(['key-kitsu-2', 'key-kitsu-2-e1'])
  })
})

describe('GET /api/runs/:index/case', () => {
  test('the skeleton carries every row, claim, episode and answer key of the run view, and no raw', async () => {
    const { body: detail } = await api('/api/runs/0')
    const { status, body: skeleton } = await api('/api/runs/0/case')
    expect(status).toBe(200)
    const rows = rowsOf(detail)

    // every row the view puts in front of a judge, which is the members AND both one-hop directions:
    // cr:CONTAINER1 is the container a member names, cr:CONTAINER1-S1 the season that names a member
    expect(skeleton.rows.map((row: any) => row.uri)).toEqual(rows.map(row => row.uri))
    expect(skeleton.rows.map((row: any) => row.uri).sort())
      .toEqual(['anilist:1', 'cr:CONTAINER1', 'cr:CONTAINER1-S1', 'kitsu:2'])
    expect(skeleton.rows.find((row: any) => row.uri === 'cr:CONTAINER1')).toEqual({
      uri: 'cr:CONTAINER1',
      origin: 'cr',
      id: 'CONTAINER1',
      titles: [],
      scope: 'CONTAINER',
    })

    // one claim per handle, and the fixture's handles all land on a row the case describes
    const handles = rows.flatMap(row => row.handles.map((handle: any) => `${row.uri}|${handle.uri}|${handle.relation}`))
    expect(skeleton.claims.map((claim: any) => `${claim.mediaUri}|${claim.handleUri}|${claim.relation}`).sort())
      .toEqual(handles.sort())
    expect(skeleton.claims).toContainEqual({ mediaUri: 'anilist:1', handleUri: 'cr:CONTAINER1', relation: 'PART_OF' })

    // every episode the view lists, store-shaped rather than as the view names its fields
    expect(skeleton.episodes.map((episode: any) => episode.uri)).toEqual(rows.flatMap(row => row.episodes.map((episode: any) => episode.uri)))
    expect(skeleton.episodes).toEqual([{
      uri: 'kitsu:2-1',
      origin: 'kitsu',
      id: '2-1',
      mediaUri: 'kitsu:2',
      episodeNumber: 1,
      releaseDate: '2026-07-05T15:00:00Z',
      score: 0.8,
      titles: [{ language: 'en', title: 'The first one', score: 0.8 }],
    }])

    // the join back to the dump: every key a row or an episode was read out of
    for (const row of rows) for (const key of row.answerKeys) expect(skeleton.source.answers).toContain(key)
    expect(skeleton.source.answers.sort()).toEqual(['key-anilist-1', 'key-cr-season', 'key-kitsu-2', 'key-kitsu-2-e1'])
    expect(skeleton.source).toMatchObject({ file: 'tests/unit/tools/fixtures/answers.jsonl', test: 'ag:(anilist:1,kitsu:2)' })

    // no raw, with the view it was built from as the control: that one carries a raw answer
    expect(hasRawKey(skeleton)).toBe(false)
    expect(hasRawKey(detail)).toBe(true)

    // and nothing that is a judgement
    expect(skeleton.name).toBe('Fixture Show Season 2')
    expect(skeleton.why).toBe('')
    expect(skeleton.expect).toEqual({})
    expect(skeleton.checked).toBe(undefined)
    expect(skeleton.pending).toBe('new store')
  })

  test('the skeleton is not a case until a labeller fills expect in, and then it validates and writes', async () => {
    const { body: skeleton } = await api('/api/runs/0/case')

    // the control: as served it is refused, on the two fields the skeleton deliberately leaves blank
    const refused = await post('skeleton-empty', skeleton)
    expect(refused.status).toBe(400)
    expect(refused.body.error).toBe('skeleton-empty.json.why: expected a non-empty string, got ""')
    const noExpect = await post('skeleton-empty', { ...skeleton, why: 'the two catalogue rows are one run' })
    expect(noExpect.status).toBe(400)
    expect(noExpect.body.error).toBe('skeleton-empty.json.expect.together: expected an array, got undefined')
    expect(existsSync(join(casesDir, 'skeleton-empty.json'))).toBe(false)

    const { status, body } = await post('skeleton-1', {
      ...skeleton,
      why: 'The two catalogue rows are one broadcast run, and the Crunchyroll series is the show that run belongs to.',
      expect: {
        together: [['anilist:1', 'kitsu:2', 'cr:CONTAINER1-S1']],
        apart: [],
        partOf: [{ part: 'anilist:1', whole: 'cr:CONTAINER1' }],
      },
      checked: { by: 'agent:opus', at: '2026-09-12' },
    })
    expect(status).toBe(200)

    const written = JSON.parse(readFileSync(body.path, 'utf8'))
    expect(() => validateCase(written, 'skeleton-1.json')).not.toThrow()
    expect(written.rows).toHaveLength(4)
    expect(written.claims).toHaveLength(4)
    expect(written.episodes).toHaveLength(1)
    expect(written.source.answers).toContain('key-kitsu-2-e1')
    expect(written.pending).toBe('new store')
    expect(hasRawKey(written)).toBe(false)
  })
})

describe('POST /api/cases/:slug', () => {
  test('writes a case that passes validateCase, with keys sorted', async () => {
    const { body: detail } = await api('/api/runs/0')
    const { status, body } = await post('anilist-1', caseFrom(detail))
    expect(status).toBe(200)
    expect(body.path).toBe(join(casesDir, 'anilist-1.json'))

    const written = readFileSync(body.path, 'utf8')
    expect(() => validateCase(JSON.parse(written), 'anilist-1.json')).not.toThrow()
    expect(Object.keys(JSON.parse(written))).toEqual(['checked', 'claims', 'episodes', 'expect', 'name', 'pending', 'rows', 'source', 'why'])
    expect(JSON.parse(written).expect.partOf).toEqual([{ part: 'anilist:1', whole: 'cr:CONTAINER1' }])
    expect(JSON.parse(written).source.answers).toContain('key-anilist-1')

    const listed = await api('/api/runs')
    expect(listed.body.runs[0].state).toBe('labelled')
    expect(listed.body.progress).toEqual({ labelled: 1, total: 1 })
  })

  test('refuses a case naming a uri no row describes, with the validator message, and writes nothing', async () => {
    const { body: detail } = await api('/api/runs/0')
    const before = readdirSync(casesDir)
    const { status, body } = await post('refused-1', caseFrom(detail, {
      expect: {
        together: [['anilist:1', 'kitsu:2']],
        apart: [],
        unrelated: ['nf:80987039'],
      },
    }))
    expect(status).toBe(400)
    expect(body.error).toBe('refused-1.json: expects something of nf:80987039, which no row describes')
    expect(existsSync(join(casesDir, 'refused-1.json'))).toBe(false)
    expect(readdirSync(casesDir)).toEqual(before)
  })

  test('reads the saved case back', async () => {
    const { status, body } = await api('/api/cases/anilist-1')
    expect(status).toBe(200)
    expect(body.slug).toBe('anilist-1')
    expect(body.case.name).toBe('the fixture run is held by one crunchyroll season')
    expect(body.case.expect.together).toEqual([['anilist:1', 'kitsu:2', 'cr:CONTAINER1-S1']])
    expect(body.case.pending).toBe('new store')

    const missing = await api('/api/cases/nobody-here')
    expect(missing.status).toBe(404)
  })

  // last, because it overwrites the case the tests above read
  test('a case carrying no source.answers leaves the run unlabelled', async () => {
    const { body: detail } = await api('/api/runs/0')
    const saved = await post('anilist-1', caseFrom(detail, { source: { file: detail.source.file, test: detail.source.test } }))
    expect(saved.status).toBe(200)
    const listed = await api('/api/runs')
    expect(listed.body.runs[0].state).toBe('unlabelled')
  })
})

describe('a written case never carries a raw answer', () => {
  test('the posted raw is stripped from every row before the case is validated and written', async () => {
    const { body: detail } = await api('/api/runs/0')
    const posted = caseFrom(detail, {
      episodes: rowsOf(detail).flatMap((row: any) => row.episodes.map((episode: any) => ({
        uri: episode.uri,
        origin: episode.origin,
        id: episode.id,
        mediaUri: episode.mediaUri,
        episodeNumber: episode.number,
        releaseDate: episode.releaseDate ?? undefined,
        titles: episode.titles,
        raw: { uri: episode.uri, titles: episode.titles },
      }))),
      checked: { by: 'agent:opus', at: '2026-09-12', notes: 'decided from the dump' },
    })
    // the control: the posted body carries a raw answer on every row and on the episode, so the
    // assertions below have something to strip
    expect(hasRawKey(posted)).toBe(true)
    expect(posted.rows.filter((row: any) => row.raw)).toHaveLength(posted.rows.length)

    const { status, body } = await post('no-raw-1', posted)
    expect(status).toBe(200)

    const written = readFileSync(body.path, 'utf8')
    expect(written).not.toContain('"raw"')
    expect(hasRawKey(JSON.parse(written))).toBe(false)
    expect(hasRawKey(body.case)).toBe(false)

    // everything the case is FOR survives: the store-shaped fields, the answer keys and the stamp
    const back = JSON.parse(written)
    expect(back.rows.map((row: any) => row.uri).sort()).toEqual(['anilist:1', 'cr:CONTAINER1', 'cr:CONTAINER1-S1', 'kitsu:2'])
    expect(back.rows.find((row: any) => row.uri === 'anilist:1')).toEqual({
      uri: 'anilist:1',
      origin: 'anilist',
      id: '1',
      type: 'TV',
      scope: 'RUN',
      startDate: '2026-07-05T15:00:00Z',
      episodeCount: 12,
      titles: [{ language: 'en', title: 'Fixture Show Season 2', score: 0.9 }],
    })
    expect(back.source.answers).toContain('key-anilist-1')
    expect(back.episodes[0]).toMatchObject({ uri: 'kitsu:2-1', episodeNumber: 1 })
    expect(back.checked).toEqual({ by: 'agent:opus', at: '2026-09-12', notes: 'decided from the dump' })
    expect(() => validateCase(back, 'no-raw-1.json')).not.toThrow()
  })

  test('the case is smaller than the answers it was built from', async () => {
    const { body: detail } = await api('/api/runs/0')
    const posted = caseFrom(detail)
    const { body } = await post('no-raw-2', posted)
    const written = readFileSync(body.path, 'utf8')
    console.log(`[label] fixture case: ${JSON.stringify(posted).length} bytes posted, ${written.length} written`)
    expect(written.length).toBeLessThan(JSON.stringify(posted).length)
  })
})

/** Every key a compact row may carry, and nothing else reaches the judging agents. */
const COMPACT_KEYS = [
  'uri', 'origin', 'scope', 'title', 'titles', 'startDate', 'endDate', 'episodeCount',
  'season', 'seasonYear', 'type', 'url', 'isMember', 'handles', 'episodes', 'more', 'answerKey',
]

describe('GET /api/runs/:index?compact=1', () => {
  test('reduces every row to what a judge reads, with the full response as the control', async () => {
    const { status, body } = await api('/api/runs/0?compact=1')
    expect(status).toBe(200)
    const rows = rowsOf(body)
    expect(rows.map(row => row.uri).sort()).toEqual(['anilist:1', 'cr:CONTAINER1', 'cr:CONTAINER1-S1', 'kitsu:2'])
    for (const row of rows) expect(Object.keys(row).filter(key => !COMPACT_KEYS.includes(key))).toEqual([])
    expect(hasRawKey(body)).toBe(false)

    const member = rows.find(row => row.uri === 'anilist:1')
    expect(member).toEqual({
      uri: 'anilist:1',
      origin: 'anilist',
      scope: 'RUN',
      title: 'Fixture Show Season 2',
      titles: [{ language: 'en', title: 'Fixture Show Season 2' }],
      startDate: '2026-07-05T15:00:00Z',
      endDate: null,
      episodeCount: 12,
      season: 'SUMMER',
      seasonYear: 2026,
      type: 'TV',
      url: 'https://anilist.co/anime/1',
      isMember: true,
      handles: [
        { uri: 'kitsu:2', relation: 'SAME_AS', scope: 'RUN' },
        { uri: 'cr:CONTAINER1', relation: 'PART_OF', scope: 'CONTAINER' },
      ],
      episodes: [],
      answerKey: 'key-anilist-1',
    })
    const withEpisode = rows.find(row => row.uri === 'kitsu:2')
    expect(withEpisode.episodes).toEqual([{ number: 1, title: 'The first one', releaseDate: '2026-07-05T15:00:00Z' }])

    // the control: the full response still carries the raw answer, the answer count and every key,
    // so the three assertions above can fail
    const full = await api('/api/runs/0')
    expect(hasRawKey(full.body)).toBe(true)
    const fullMember = rowsOf(full.body).find(row => row.uri === 'anilist:1')
    expect(fullMember.raw.uri).toBe('anilist:1')
    expect(fullMember.answerKeys).toEqual(['key-anilist-1'])
    expect(Object.keys(fullMember).filter(key => !COMPACT_KEYS.includes(key)).sort())
      .toEqual(['answerKeys', 'answers', 'categories', 'id', 'namedBy', 'raw', 'score', 'why'])
  })

  test('the compact read is a fraction of the full one', async () => {
    const compact = await text('/api/runs/0?compact=1')
    const full = await text('/api/runs/0')
    console.log(`[label] fixture run 0: ${compact.length} bytes compact, ${full.length} bytes full`)
    expect(compact.length).toBeLessThan(full.length / 2)
    expect(compact.length).toBeLessThan(20_000)
  })

  test('a long episode list is capped at 60 and says how many it dropped', () => {
    const episodes = Array.from({ length: 74 }, (_, index) => ({
      uri: `kitsu:2-${index + 1}`,
      number: index + 1,
      title: `Episode ${index + 1}`,
      releaseDate: '2026-07-05T15:00:00Z',
      titles: [{ language: 'en', title: `Episode ${index + 1}`, score: 0.8 }],
      answerKey: `key-kitsu-2-e${index + 1}`,
    }))
    const capped = compactRow({ uri: 'kitsu:2', origin: 'kitsu', titles: [], handles: [], episodes })
    expect(capped.episodes).toHaveLength(60)
    expect(capped.episodes[59]).toEqual({ number: 60, title: 'Episode 60', releaseDate: '2026-07-05T15:00:00Z' })
    expect(capped.more).toBe(14)
    expect(compactRow({ uri: 'kitsu:2', origin: 'kitsu', titles: [], handles: [], episodes: episodes.slice(0, 60) }).more).toBe(undefined)
  })
})

describe('GET /api/runs?compact=1', () => {
  test('lists six fields per run and nothing else', async () => {
    const { status, body } = await api('/api/runs?compact=1')
    expect(status).toBe(200)
    expect(body.runs).toHaveLength(1)
    expect(Object.keys(body.runs[0]).sort()).toEqual(['answerOrigins', 'index', 'slug', 'state', 'title', 'uri'])
    expect(body.runs[0]).toEqual({
      index: 0,
      uri: 'ag:(anilist:1,kitsu:2)',
      title: 'Fixture Show Season 2',
      slug: 'anilist-1',
      state: expect.stringMatching(/^(labelled|unlabelled)$/),
      answerOrigins: ['anilist', 'cr', 'kitsu'],
    })

    // the control: the full listing carries the members and the answer count the compact one drops
    const full = await api('/api/runs')
    expect(full.body.runs[0].members).toEqual(['anilist:1', 'kitsu:2'])
  })
})

describe('the review queue', () => {
  const flag = (slug: string, body: unknown) =>
    api(`/api/review/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  test('POST writes one line, GET returns it, a second POST replaces it, DELETE clears it', async () => {
    const first = await flag('anilist-1', {
      by: 'human:banou',
      at: '2026-09-12',
      reason: 'the two judges disagree about the crunchyroll season',
      disagreement: 'agent:opus says holds, agent:opus-refute says same',
    })
    expect(first.status).toBe(200)
    expect(readFileSync(reviewFile, 'utf8').trim().split('\n')).toHaveLength(1)

    const queued = await api('/api/review')
    expect(queued.status).toBe(200)
    expect(queued.body.queue).toEqual([{
      slug: 'anilist-1',
      by: 'human:banou',
      at: '2026-09-12',
      reason: 'the two judges disagree about the crunchyroll season',
      disagreement: 'agent:opus says holds, agent:opus-refute says same',
    }])

    // the run screens read the flag off the run itself, which is what puts a marker in the list
    const detail = await api('/api/runs/0')
    expect(detail.body.review.reason).toBe('the two judges disagree about the crunchyroll season')
    const listed = await api('/api/runs')
    expect(listed.body.runs[0].review.by).toBe('human:banou')

    // latest wins, so the file the corpus commits stays one line per run
    const second = await flag('anilist-1', { by: 'agent:opus', at: '2026-09-13', reason: 'the episode range is the disagreement', disagreement: '1..11 against 1..12' })
    expect(second.status).toBe(200)
    expect(readFileSync(reviewFile, 'utf8').trim().split('\n')).toHaveLength(1)
    const again = await api('/api/review')
    expect(again.body.queue).toHaveLength(1)
    expect(again.body.queue[0]).toMatchObject({ by: 'agent:opus', reason: 'the episode range is the disagreement' })

    const cleared = await api('/api/review/anilist-1', { method: 'DELETE' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.cleared).toBe(true)
    const empty = await api('/api/review')
    expect(empty.body.queue).toEqual([])
    expect(readFileSync(reviewFile, 'utf8').trim()).toBe('')
    expect((await api('/api/runs/0')).body.review).toBe(undefined)
  })

  test('an entry with no reason is refused and the queue is untouched', async () => {
    await flag('anilist-1', { by: 'agent:opus', reason: 'kept' })
    const before = readFileSync(reviewFile, 'utf8')
    const refused = await flag('anilist-1', { by: 'agent:opus', disagreement: 'nothing said' })
    expect(refused.status).toBe(400)
    expect(refused.body.error).toContain('reason')
    expect(readFileSync(reviewFile, 'utf8')).toBe(before)
    await api('/api/review/anilist-1', { method: 'DELETE' })
  })
})
