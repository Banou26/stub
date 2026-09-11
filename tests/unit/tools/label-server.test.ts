// The label server, against a fixture dump small enough to read: two members, a third row that names
// one of them, a handle to a container that answers nothing of its own, and one episode.
//
// What it pins is the half of the tool that no screenshot can check: which rows the one-hop expansion
// puts in front of the owner, and that a case only ever reaches `tests/corpus/cases/` through
// `validateCase`. The cases here are written into a temp directory, never into the corpus.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startLabelServer } from '../../../scripts/label-corpus.mjs'
import { validateCase } from '../../corpus/types'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

let server: { url: string, close: () => Promise<void> }
let casesDir: string

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
  casesDir = mkdtempSync(join(tmpdir(), 'label-cases-'))
  server = await startLabelServer({ dir: FIXTURES, casesDir, port: 0 })
})

afterAll(async () => {
  await server.close()
  rmSync(casesDir, { recursive: true, force: true })
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
