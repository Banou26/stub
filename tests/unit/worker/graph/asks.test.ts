/**
 * The `Ask` log as a module: what one row carries, and the one property that separates it from the
 * `Answer` log beside it, which is that it NEVER dedupes. The consumer's own wiring is driven in
 * `tests/unit/worker/similar-consumer.test.ts`.
 *
 * The flag is set directly rather than through `enableGraph`, because the ask log needs the engine
 * and its schema and nothing else: no answer sink, no ingest, no plugin pass.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { closeGraph, setGraphEnabled } from '../../../../src/worker/graph/engine'
import { exportAsks, recordAsk, type Ask } from '../../../../src/worker/graph/asks'

const QUESTION = 'cr\u0000G24H1N3MP\u00002026-07-04\u000012\u00003\u0000\u0000AlphaBeta'

const ask = (fields: Partial<Ask> = {}): Ask => ({
  clusterId: 'ag:(anilist:1,kitsu:2)',
  runUri: 'anilist:1',
  origin: 'cr',
  showId: 'G24H1N3MP',
  question: QUESTION,
  outcome: 'refused',
  reason: 'null',
  ...fields,
})

const keysOf = (rows: { key: string }[]) => new Set(rows.map(row => row.key))

/** The rows this test added, in the order the export handed them back. */
const added = async (before: Set<string>) => (await exportAsks()).filter(row => !before.has(row.key))

beforeAll(() => { setGraphEnabled(true) })

afterAll(async () => {
  setGraphEnabled(false)
  await closeGraph()
})

describe('the Ask log', () => {
  test('one ask is one row, with the question hashed and its reason kept', async () => {
    const before = keysOf(await exportAsks())

    await recordAsk(ask({ outcome: 'declined', reason: 'ceiling' }))

    const rows = await added(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      clusterId: 'ag:(anilist:1,kitsu:2)',
      // Mutation: drop `runUri: ask.runUri` from `queue` and this reads back null. The column is
      // declared in 2.1 and 7.5 asks over it, so an unwritten one makes that query permanently empty.
      runUri: 'anilist:1',
      origin: 'cr',
      showId: 'G24H1N3MP',
      outcome: 'declined',
      reason: 'ceiling',
      answerUri: null,
    })
    expect(rows[0]!.questionHash, 'the normalised question is hashed, never stored raw').toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]!.questionHash).not.toBe(QUESTION)
    expect(rows[0]!.key).toMatch(/^[0-9a-f]{64}$/)
  })

  test('an answered ask carries the answer uri, and no other outcome does', async () => {
    const before = keysOf(await exportAsks())

    await recordAsk(ask({ outcome: 'answered', reason: 'cr:G24H1N3MP-GS00374452' }))
    await recordAsk(ask({ outcome: 'error', reason: 'the source threw' }))

    const rows = await added(before)
    expect(rows.map(row => row.answerUri)).toEqual(['cr:G24H1N3MP-GS00374452', null])
  })

  // THE PROPERTY THAT SEPARATES THIS LOG FROM THE ANSWER LOG. An answer is a fact about a work and a
  // byte-identical re-fetch is one row; an ask is an event in a session, and the same question put
  // again is a second question. A dedupe here would report one ask where two were spent.
  test('the same question recorded twice is two rows, never a dedupe', async () => {
    const before = keysOf(await exportAsks())

    await recordAsk(ask())
    await recordAsk(ask())

    const rows = await added(before)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.questionHash, 'the same question').toBe(rows[1]!.questionHash)
    expect(rows[0]!.key, 'and two rows, because the seq is hashed into the key').not.toBe(rows[1]!.key)
  })

  test('the export is ordered by seq, with no number re-used', async () => {
    const before = keysOf(await exportAsks())

    await recordAsk(ask({ reason: 'first' }))
    await recordAsk(ask({ reason: 'second' }))
    await recordAsk(ask({ reason: 'third' }))

    const rows = await added(before)
    expect(rows.map(row => row.reason)).toEqual(['first', 'second', 'third'])
    const all = await exportAsks()
    expect(all.map(row => row.seq)).toEqual([...all.keys()].map(index => index + 1))
  })

  // The consumer records FIRE AND FORGET, so a row is still being keyed when the next reader arrives:
  // a flush that drained only what is queued would write four of a page's five asks and report five.
  test('asks recorded fire and forget are in the log the next read sees', async () => {
    const before = keysOf(await exportAsks())

    for (const index of [1, 2, 3, 4, 5]) void recordAsk(ask({ reason: `r${index}` }))

    expect((await added(before)).map(row => row.reason)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })

  // THE CONTROL. With the flag down the engine is never reached, which is what makes a page that did
  // not ask for the graph cost nothing; a log that is OFF and a session that asked nothing are
  // different facts, so the reader throws rather than answering an empty list.
  test('the flag down records nothing, and the reader says so rather than answering empty', async () => {
    const before = await exportAsks()
    setGraphEnabled(false)

    expect(recordAsk(ask({ reason: 'while the flag is down' })), 'undefined, synchronously').toBeUndefined()
    await expect(exportAsks()).rejects.toThrow(/the ask log is off/)

    setGraphEnabled(true)
    expect(await exportAsks(), 'the log is untouched').toEqual(before)
  })
})
