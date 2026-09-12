/**
 * The worker end of the `?graph` flag.
 *
 * A worker cannot read the page's query string, so `src/worker.ts` reads it and calls
 * `setGraphEnabled` over osra right after spawning. Off is the default and costs nothing: the engine
 * client is imported lazily, so with the flag down neither it nor the 22 MB engine is ever fetched.
 */
import { setAnswerSink } from './answers'
import { graphEnabled, setGraphEnabled } from './engine'
import { ingestAnswers } from './ingest'
import { graphReady, GRAPH_TABLES } from './schema'

export { closeGraph, graphEnabled, openGraph, setGraphEnabled } from './engine'
export type { Graph, GraphRow } from './engine'
export { createGraphSchema, graphReady, GRAPH_SCHEMA, GRAPH_TABLES } from './schema'
export { exportAnswers, flushAnswers, recordAnswers } from './answers'
export type { AnswerKind, AnswerRow } from './answers'
export { graphCounts } from './counts'
export { ingestAnswers, replayAnswers } from './ingest'
export type { IngestChanged, IngestQuarantine, IngestReport } from './ingest'
// Section 5: the contract, the writer and the pass. Nothing subscribes to `graph:changed` yet, so a
// pass runs only when a caller asks for one; the scheduler of 5.3 is step 2c.
export type { Plugin, PluginContext, PluginOutput, Scope } from './plugins/contract'
export { applyPluginOutput, retractPlugin } from './plugins/writer'
export type { WriterChange, WriterReport } from './plugins/writer'
export { auditSources, PASS_CAP, runPlugins } from './plugins/runner'
export type { AuditReport, PassReport } from './plugins/runner'
export { profilePlugin } from './plugins/profile'

let booting: Promise<void> | undefined

const boot = async () => {
  const started = performance.now()
  // THE ONE PLACE THE LIVE INGEST IS WIRED, and only behind the flag. The log hands it the rows a
  // flush wrote, so the tee runs after `recordAnswers` and after the old store's own inserters, and
  // a throw inside it is logged there rather than reaching the resolve.
  setAnswerSink(ingestAnswers)
  // the schema of section 2 is created at start, so the first answer of the session has a table to
  // land in; `graphReady` is also what every reader waits on, so nothing can race this boot
  const graph = await graphReady()
  console.info(`graph: engine ready in ${Math.round(performance.now() - started)} ms, version ${graph.version}, ${GRAPH_TABLES.length} tables`)
}

/** Carries the page's flag in, and opens the engine once when it is on. */
export const enableGraph = (enabled: boolean): Promise<void> => {
  setGraphEnabled(enabled)
  if (!graphEnabled()) return Promise.resolve()
  return (booting ??= boot())
}
