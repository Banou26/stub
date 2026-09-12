/**
 * The answers the plugin tests ingest, built the way the log builds one.
 *
 * Shared rather than repeated because all three plugin suites need the same two things: a row keyed
 * on its own content (so a replay of it is the same row, exactly as `answers.ts` keys one) and a read
 * helper over the open engine. Nothing here knows anything about plugins.
 */
import type { AnswerKind, AnswerRow } from '../../../../../src/worker/graph/answers'

import { contentHash } from '../../../../../src/worker/graph/hash'
import { graphReady } from '../../../../../src/worker/graph/schema'

export type Row = Record<string, unknown>

let nextSeq = 0

/**
 * One answer row. `seq` is taken BEFORE the await, because `Promise.all` over this helper resumes in
 * completion order and the merge would then fold a batch in an order the caller never wrote.
 */
export const answer = async (kind: AnswerKind, value: Row, operation = 'MEDIA'): Promise<AnswerRow> => {
  const seq = ++nextSeq
  return {
    key: await contentHash([kind, value]),
    seq,
    uri: String(kind === 'origin' ? value.id : value.uri),
    origin: String(kind === 'origin' ? value.id : value.origin),
    kind,
    operation,
    selection: Object.keys(value).sort(),
    raw: JSON.stringify(value),
  }
}

/** A media row as a source returns one: addressed, scoped, with no handles unless asked for. */
export const media = (uri: string, fields: Row = {}): Row => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  scope: 'RUN',
  handles: [],
  ...fields,
})

/** An episode row hung on `mediaUri`, which is where the `HAS_EPISODE` edge starts. */
export const episode = (uri: string, mediaUri: string, fields: Row = {}): Row => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  mediaUri,
  ...fields,
})

export const title = (language: string, text: string, score = 1): Row => ({ language, title: text, score })

export const sameAs = (node: Row): Row => ({ relation: 'SAME_AS', node })
export const partOf = (node: Row): Row => ({ relation: 'PART_OF', node: { ...node, scope: 'CONTAINER' } })

/** One read against the open engine, through the same `graphReady` every writer goes through. */
export const rowsOf = async (cypher: string, params?: Record<string, unknown>) => {
  const { query } = await graphReady()
  return query(cypher, params)
}
