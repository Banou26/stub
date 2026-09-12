import type { TraceBundle } from './trace'
import type { SupportGap, TraceRef } from './model'

import { css } from '@emotion/react'
import { useState } from 'preact/hooks'

import { answerFor, isActive, resolveSupports, traceBlob } from './model'
import { JsonBlob, Value } from './value'

/**
 * The panel that answers "why is this edge here, or why is it not".
 *
 * It shows who wrote a row (`by`), the rule that fired (`reason`), whether the rule passed or refused
 * it (`status`), its confidence, and its `evidence` and `gates` as field tables rather than as dumped
 * JSON strings.
 *
 * `supports` is the part that matters: a row names the edge keys it was derived from, each of those
 * resolves to the claim or link it names, and a claim names the stored answer that carried it. So the
 * panel is a DESCENT, kept as a trail the reader walks down and clicks back up, and it goes as deep
 * as the bundle's keys reach rather than stopping at one level.
 */

const style = css`
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  padding: 1rem 1.2rem;
  font-size: 1.3rem;

  h3 { font-size: 1.4rem; margin-bottom: 0.6rem; }

  .trail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.8rem;
    font-size: 1.15rem;
  }
  .trail button {
    padding: 0.15rem 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-family: monospace;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .trail button:hover { color: #fff; border-color: rgba(255, 255, 255, 0.45); }
  .trail .here { font-family: monospace; color: #fff; overflow-wrap: anywhere; }

  .facts {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.8rem;
  }
  .facts th, .facts td {
    padding: 0.25rem 0.6rem 0.25rem 0;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 1.2rem;
  }
  .facts th { width: 12rem; font-weight: 600; color: rgba(255, 255, 255, 0.55); }
  .facts td { font-family: monospace; overflow-wrap: anywhere; }

  .status.active { color: rgb(74, 222, 128); font-weight: 700; }
  .status.refused { color: rgb(248, 113, 113); font-weight: 700; }

  h4 {
    font-size: 1.2rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
    margin: 0.9rem 0 0.3rem;
  }

  .supports { display: flex; flex-direction: column; gap: 0.35rem; }
  .support {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 1.2rem;
  }
  .support .what { color: rgba(255, 255, 255, 0.8); }
  .support .key { font-family: monospace; color: rgba(255, 255, 255, 0.45); overflow-wrap: anywhere; }
  .support button {
    padding: 0.15rem 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.3rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .support .unresolved { color: rgb(250, 204, 21); flex-shrink: 0; }

  .answer { margin-top: 0.4rem; }
  .answer pre {
    margin: 0.4rem 0 0;
    padding: 0.5rem 0.6rem;
    max-height: 24rem;
    overflow: auto;
    background: rgba(255, 255, 255, 0.05);
    font-family: monospace;
    font-size: 1.15rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .answer .failed { color: rgb(248, 113, 113); }
  button.load {
    padding: 0.25rem 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.3rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1.15rem;
  }

  .empty { color: rgba(255, 255, 255, 0.5); }
`

/** A one line summary of what a support key points at, so a descent can be read before it is walked. */
export const refSummary = (ref: TraceRef): string => {
  if (ref.kind === 'link') return `link ${ref.row.kind} ${ref.row.status} by ${ref.row.by}`
  if (ref.kind === 'episode-link') return `episode link ${ref.row.kind} ${ref.row.status} by ${ref.row.by}`
  if (ref.kind === 'claim') return `claim ${ref.row.kind} from ${ref.row.claimer}`
  if (ref.kind === 'episode-source') return `episode list from ${ref.row.claimer}`
  return `episode claim ${ref.row.kind} from ${ref.row.claimer}`
}

/** What a support key that resolved to nothing is, in the words the page shows. */
export const gapLabel = (gap: SupportGap): string =>
  gap === 'not-an-edge-key'
    ? 'not an edge key'
    : 'not in this bundle'


/**
 * A loaded answer as text.
 *
 * The worker half decides what an answer's bytes come back as, so every plausible shape is handled
 * here rather than one being assumed: a string is shown as it is, bytes are decoded as UTF-8, a row
 * carrying its stored payload in `raw` is shown as that payload rather than as a JSON encoding of a
 * JSON encoding, and anything else is printed as JSON. Nothing that came back is hidden.
 */
export const formatAnswer = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value))
  if (typeof value === 'object' && typeof (value as { raw?: unknown }).raw === 'string') {
    return (value as { raw: string }).raw
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

type AnswerState = { seq: number, state: 'loading' | 'done' | 'failed', text: string }

const Facts = ({ rows }: { rows: [string, string | number | boolean | null | undefined][] }) => (
  <table className="facts">
    <tbody>
      {rows.map(([label, value]) => (
        <tr key={label} data-fact={label}>
          <th scope="row">{label}</th>
          <td><Value value={value}/></td>
        </tr>
      ))}
    </tbody>
  </table>
)

/**
 * The stored answer a source-truth row names: its metadata from the bundle, its bytes on demand.
 *
 * One component for both rows that name a sequence, a `CLAIMS` row and a `HAS_EPISODE` row, because
 * the last step of "why is this field this value" is the same step for both: the answer the source
 * actually returned.
 */
const AnswerRow = ({ bundle, seq, answer, onLoad }: {
  bundle: TraceBundle
  seq: number
  answer: AnswerState | undefined
  onLoad: (seq: number) => void
}) => {
  const row = answerFor(bundle, seq)
  return (
    <>
      <h4>answer {seq}</h4>
      {
        row
          ? (
            <Facts rows={[
              ['uri', row.uri],
              ['origin', row.origin],
              ['operation', row.operation],
              ['bytes', row.bytes],
            ]}/>
          )
          : (
            <p className="empty" data-no-answer-row>
              The bundle lists no answer with that sequence.
            </p>
          )
      }
      <button type="button" className="load" onClick={() => onLoad(seq)}>
        Load answer bytes
      </button>
      {answer?.seq === seq && (
        <div className="answer" data-answer>
          {answer.state === 'loading' && <p className="empty">loading…</p>}
          {answer.state === 'failed' && <p className="failed">{answer.text}</p>}
          {answer.state === 'done' && (
            answer.text === ''
              ? <p className="empty">nothing came back for that sequence.</p>
              : <pre>{answer.text}</pre>
          )}
        </div>
      )}
    </>
  )
}

const Inspector = ({ bundle, index, trail, onFollow, onTrailTo, loadAnswerBytes }: {
  bundle: TraceBundle
  index: Map<string, TraceRef>
  trail: string[]
  onFollow: (key: string) => void
  onTrailTo: (depth: number) => void
  loadAnswerBytes: (seq: number) => Promise<unknown>
}) => {
  const [answer, setAnswer] = useState<AnswerState | undefined>(undefined)

  const key = trail[trail.length - 1]
  const ref = key === undefined ? undefined : index.get(key)
  // source truth rows carry no `supports` column at all, so the list is empty for them by shape
  const supports = resolveSupports(
    index,
    ref && (ref.kind === 'link' || ref.kind === 'episode-link') ? ref.row.supports : [],
  )

  const load = (seq: number) => {
    setAnswer({ seq, state: 'loading', text: '' })
    loadAnswerBytes(seq)
      .then(value => setAnswer({ seq, state: 'done', text: formatAnswer(value) }))
      .catch(error => setAnswer({
        seq,
        state: 'failed',
        text: error instanceof Error ? error.message : String(error),
      }))
  }

  return (
    <div css={style} data-inspector>
      <h3>Edge inspector</h3>
      {
        key === undefined
          ? <p className="empty">Select a link in the graph, or any row in the tables below.</p>
          : (
            <>
              <div className="trail">
                {trail.slice(0, -1).map((step, depth) => (
                  <button key={step} type="button" onClick={() => onTrailTo(depth)}>
                    {index.get(step) ? refSummary(index.get(step)!) : step}
                  </button>
                ))}
                <span className="here">{ref ? refSummary(ref) : key}</span>
              </div>
              {
                ref === undefined
                  ? (
                    <p className="empty" data-unknown-row>
                      The bundle carries no row with the key <code>{key}</code>.
                    </p>
                  )
                  : (
                    <>
                      {(ref.kind === 'link' || ref.kind === 'episode-link') && (
                        <>
                          <Facts rows={[
                            ['from', ref.row.fromUri],
                            ['to', ref.row.toUri],
                            ['kind', ref.row.kind],
                            ['written by', ref.row.by],
                            ['rule', ref.row.reason],
                          ]}/>
                          <p>
                            status{' '}
                            <span className={`status ${isActive(ref.row.status) ? 'active' : 'refused'}`}>
                              {ref.row.status}
                            </span>
                          </p>
                          <Facts rows={
                            ref.kind === 'link'
                              ? [['confidence', ref.row.confidence], ['version', ref.row.version]]
                              : [['from number', ref.row.fromNumber], ['to number', ref.row.toNumber]]
                          }/>
                          <h4>evidence</h4>
                          <JsonBlob blob={traceBlob(ref.row.evidence)} label="evidence"/>
                          {ref.kind === 'link' && (
                            <>
                              <h4>gates</h4>
                              <JsonBlob blob={traceBlob(ref.row.gates)} label="gates"/>
                            </>
                          )}
                        </>
                      )}
                      {(ref.kind === 'claim' || ref.kind === 'episode-claim') && (
                        <>
                          <Facts rows={[
                            ['from', ref.row.fromUri],
                            ['to', ref.row.toUri],
                            ['kind', ref.row.kind],
                            ['claimed by', ref.row.claimer],
                            ['provenance', ref.row.provenance],
                            ['answer seq', ref.row.answerSeq],
                            ...(ref.kind === 'claim'
                              ? [['target scope', ref.row.targetScope] as [string, string | null]]
                              : []),
                          ]}/>
                          <AnswerRow bundle={bundle} seq={ref.row.answerSeq} answer={answer} onLoad={load}/>
                        </>
                      )}
                      {ref.kind === 'episode-source' && (
                        <>
                          {/* A `via: member` fill descends to exactly this row: the source's own
                              episode list, which is why the table is in the bundle at all. */}
                          <Facts rows={[
                            ['media', ref.row.fromUri],
                            ['episode', ref.row.toUri],
                            ['listed by', ref.row.claimer],
                            ['answer seq', ref.row.answerSeq],
                          ]}/>
                          <AnswerRow bundle={bundle} seq={ref.row.answerSeq} answer={answer} onLoad={load}/>
                        </>
                      )}
                      <h4>supports</h4>
                      {
                        (ref.kind === 'claim' || ref.kind === 'episode-claim' || ref.kind === 'episode-source')
                          ? <p className="empty">This row is source truth: it is derived from nothing.</p>
                          : supports.length === 0
                            ? <p className="empty">This row names no supports.</p>
                            : (
                              <div className="supports">
                                {supports.map(support => (
                                  <div className="support" key={support.key} data-gap={support.gap ?? undefined}>
                                    {
                                      support.ref
                                        ? (
                                          <button type="button" onClick={() => onFollow(support.key)}>
                                            Follow
                                          </button>
                                        )
                                        : <span className="unresolved">{gapLabel(support.gap!)}</span>
                                    }
                                    <span className="what">{support.ref ? refSummary(support.ref) : 'unresolved'}</span>
                                    <span className="key">{support.key}</span>
                                  </div>
                                ))}
                              </div>
                            )
                      }
                    </>
                  )
              }
            </>
          )
      }
    </div>
  )
}

export default Inspector
