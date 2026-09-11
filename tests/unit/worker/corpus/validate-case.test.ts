// The corpus format's own tests: every rule `validateCase` enforces, proved by a case that passes and
// the same case with one thing wrong.
//
// Each failing test mutates a case that passes on the line above it, so a rule that stopped firing
// shows up here rather than as a corpus that silently accepts a malformed expectation. See
// tests/corpus/types.ts for the format and tests/corpus/README.md for what the corpus is.
import { describe, expect, test } from 'vitest'

import { validateCase } from '../../../corpus/types'

const CHECKED = { by: 'the test', at: '2026-09-12' }

/** Two run rows and one container row, enough to name in any of the new expectations. */
const rows = [
  { uri: 'anilist:1', origin: 'anilist', id: '1', titles: [{ language: 'en', title: 'A run' }], episodeCount: 11 },
  { uri: 'anilist:2', origin: 'anilist', id: '2', titles: [{ language: 'en', title: 'Another run' }], episodeCount: 12 },
  { uri: 'cr:S1', origin: 'cr', id: 'S1', titles: [{ language: 'en', title: 'A season' }], episodeCount: 24 },
]

const episodes = [
  { uri: 'anilist:1-e1', origin: 'anilist', id: '1-e1', mediaUri: 'anilist:1', episodeNumber: 1, titles: [] },
  { uri: 'cr:S1-e1', origin: 'cr', id: 'S1-e1', mediaUri: 'cr:S1', episodeNumber: 1, titles: [] },
  { uri: 'cr:S1-e24', origin: 'cr', id: 'S1-e24', mediaUri: 'cr:S1', episodeNumber: 24, titles: [] },
]

const base = (expectation: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  name: 'a case',
  source: { file: 'tests/unit/worker/corpus/validate-case.test.ts', test: 'a case' },
  why: 'These are two broadcast runs a streamer sells as one season.',
  rows,
  claims: [],
  episodes,
  expect: { together: [['anilist:1']], apart: [['anilist:1', 'anilist:2']], ...expectation },
  checked: CHECKED,
  ...extra,
})

describe('validateCase accepts each new expectation', () => {
  test('partOf', () => {
    const parsed = validateCase(base({ partOf: [{ part: 'anilist:1', whole: 'cr:S1' }] }), 'case')
    expect(parsed.expect.partOf).toEqual([{ part: 'anilist:1', whole: 'cr:S1' }])
  })

  test('includes, with and without a range', () => {
    const parsed = validateCase(base({
      includes: [
        { container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11 } },
        { container: 'cr:S1', run: 'anilist:2' },
      ],
    }), 'case')
    expect(parsed.expect.includes?.[0]?.range).toEqual({ fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11 })
    expect(parsed.expect.includes?.[1]?.range).toBeUndefined()
  })

  test('episodePairs', () => {
    const parsed = validateCase(base({ episodePairs: [{ a: 'cr:S1-e1', b: 'anilist:1-e1' }] }), 'case')
    expect(parsed.expect.episodePairs).toEqual([{ a: 'cr:S1-e1', b: 'anilist:1-e1' }])
  })

  test('episodeApart', () => {
    const parsed = validateCase(base({ episodeApart: [{ a: 'cr:S1-e24', b: 'anilist:1-e1' }] }), 'case')
    expect(parsed.expect.episodeApart).toEqual([{ a: 'cr:S1-e24', b: 'anilist:1-e1' }])
  })

  test('unrelated', () => {
    const parsed = validateCase(base({ unrelated: ['anilist:2'] }), 'case')
    expect(parsed.expect.unrelated).toEqual(['anilist:2'])
  })

  test('the stamp, the pending flag, the raw answer and the answer keys it was built from', () => {
    const parsed = validateCase({
      ...base(
        { partOf: [{ part: 'anilist:1', whole: 'cr:S1' }] },
        { pending: 'new store' },
      ),
      source: { file: 'a file', test: 'a test', answers: ['anilist:media:1', 'cr:media:S1'] },
      rows: [{ ...rows[0], raw: { id: 1, episodes: 11 } }, rows[1], rows[2]],
      checked: { by: 'a person', at: '2026-09-12', notes: 'read off the walk' },
    }, 'case')
    expect(parsed.pending).toBe('new store')
    expect(parsed.checked?.notes).toBe('read off the walk')
    expect(parsed.source.answers).toEqual(['anilist:media:1', 'cr:media:S1'])
    expect(parsed.rows[0]?.raw).toEqual({ id: 1, episodes: 11 })
  })

  test('the 32 original cases still need no stamp', () => {
    const { checked, ...unstamped } = base({})
    expect(checked).toEqual(CHECKED)
    expect(validateCase(unstamped, 'case').checked).toBeUndefined()
  })
})

describe('validateCase refuses', () => {
  test('an expectation naming a uri no row describes', () => {
    expect(() => validateCase(base({ partOf: [{ part: 'anilist:1', whole: 'cr:S9' }] }), 'case'))
      .toThrow('case: expects something of cr:S9, which no row describes')
    expect(() => validateCase(base({ includes: [{ container: 'cr:S9', run: 'anilist:1' }] }), 'case'))
      .toThrow('case: expects something of cr:S9, which no row describes')
    expect(() => validateCase(base({ unrelated: ['nf:404'] }), 'case'))
      .toThrow('case: expects something of nf:404, which no row describes')
  })

  test('an episode expectation naming an episode no episode row describes', () => {
    expect(() => validateCase(base({ episodePairs: [{ a: 'cr:S1-e1', b: 'anilist:1-e9' }] }), 'case'))
      .toThrow('case: expects something of episode anilist:1-e9, which no episode row describes')
    expect(() => validateCase(base({ episodeApart: [{ a: 'cr:S1-e99', b: 'anilist:1-e1' }] }), 'case'))
      .toThrow('case: expects something of episode cr:S1-e99, which no episode row describes')
  })

  test('a range that runs backwards', () => {
    expect(() => validateCase(base({
      includes: [{ container: 'cr:S1', run: 'anilist:1', range: { fromStart: 11, fromEnd: 1, toStart: 1, toEnd: 11 } }],
    }), 'case')).toThrow('case.expect.includes[0].range: fromEnd 1 is before fromStart 11')

    expect(() => validateCase(base({
      includes: [{ container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 11, toEnd: 1 } }],
    }), 'case')).toThrow('case.expect.includes[0].range: toEnd 1 is before toStart 11')
  })

  test('a range whose two sides are different lengths', () => {
    expect(() => validateCase(base({
      includes: [{ container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 12 } }],
    }), 'case')).toThrow('case.expect.includes[0].range: 1..11 is 11 episodes and 1..12 is 12, so the two sides cannot correspond')
  })

  test('a new expectation with no checked stamp', () => {
    for (const [key, value] of [
      ['partOf', [{ part: 'anilist:1', whole: 'cr:S1' }]],
      ['includes', [{ container: 'cr:S1', run: 'anilist:1' }]],
      ['episodePairs', [{ a: 'cr:S1-e1', b: 'anilist:1-e1' }]],
      ['episodeApart', [{ a: 'cr:S1-e24', b: 'anilist:1-e1' }]],
      ['unrelated', ['anilist:2']],
    ] as [string, unknown][]) {
      const { checked, ...unstamped } = base({ [key]: value })
      expect(checked).toEqual(CHECKED)
      expect(() => validateCase(unstamped, 'case'))
        .toThrow(`case: expect.${key} needs a checked stamp: an unchecked assertion is not a label`)
    }
  })

  test('a stamp with no day, or a day written some other way', () => {
    expect(() => validateCase(base({}, { checked: { by: 'a person', at: '2026-9-12' } }), 'case'))
      .toThrow('case.checked.at: expected YYYY-MM-DD, got "2026-9-12"')
    expect(() => validateCase(base({}, { checked: { by: 'a person' } }), 'case'))
      .toThrow('case.checked.at: expected a non-empty string, got undefined')
  })

  test('an unknown key, wherever it is', () => {
    expect(() => validateCase(base({ parOf: [{ part: 'anilist:1', whole: 'cr:S1' }] }), 'case'))
      .toThrow('case.expect: unknown key parOf')
    expect(() => validateCase(base({}, { pendng: 'new store' }), 'case'))
      .toThrow('case: unknown key pendng')
    expect(() => validateCase(base({ partOf: [{ part: 'anilist:1', hole: 'cr:S1' }] }), 'case'))
      .toThrow('case.expect.partOf[0]: unknown key hole')
    expect(() => validateCase(base({
      includes: [{ container: 'cr:S1', run: 'anilist:1', range: { fromStart: 1, fromEnd: 11, toStart: 1, toEnd: 11, of: 24 } }],
    }), 'case')).toThrow('case.expect.includes[0].range: unknown key of')
    expect(() => validateCase(base({ episodePairs: [{ a: 'cr:S1-e1', c: 'anilist:1-e1' }] }), 'case'))
      .toThrow('case.expect.episodePairs[0]: unknown key c')
    expect(() => validateCase(base({}, { checked: { by: 'a person', at: '2026-09-12', note: 'typo' } }), 'case'))
      .toThrow('case.checked: unknown key note')
    expect(() => validateCase({ ...base({}), source: { file: 'a file', test: 'a test', answer: ['one'] } }, 'case'))
      .toThrow('case.source: unknown key answer')
  })
})
