/**
 * The pass: one walk of the plugins in `after` order, iterated to a fixed point, then audited
 * (section 5.3).
 *
 * `runPlugins` is the whole of the scheduler's inner loop. It does NOT subscribe to `graph:changed`
 * and it does not coalesce emits: wiring it to the ingest's event is step 2c, together with the
 * deltas, and until then every call runs every plugin with `delta.full`.
 *
 * WHAT IT PROMISES.
 * - A plugin runs at most `PASS_CAP` times per call. Hitting the cap is an anomaly, never a warning,
 *   so a graph that keeps hitting it is visible rather than merely slow.
 * - A repeated state hash ends the loop and is reported. The hash is taken over the deltas the writer
 *   APPLIED, so two iterations that wrote the same rows are a cycle even when the plugins disagree
 *   about why.
 * - A plugin that throws keeps its previous output (the writer is never called for it), the pass
 *   continues with the plugins after it, and the failure is reported. An empty desired set would
 *   retract everything it ever wrote, which is the one thing a failure must not do.
 * - The source tables are unchanged by the pass, and that is CHECKED rather than asserted: every
 *   source row with `seq <= passStart` is re-hashed in JS before and after, and any difference is
 *   reported with the row that moved.
 *
 * WHY THE AUDIT IS THE PROOF AND THE OTHER TWO LAYERS ARE NOT. `PluginOutput` cannot name a source
 * table (layer 1, the type, plus the writer's runtime check), and `ctx.query` refuses the write verbs
 * (layer 2, below). Both are defences a plugin holding any other handle walks straight past, which is
 * exactly what the control in `tests/unit/worker/graph/plugins/runner.test.ts` does: it takes
 * `graphReady()` for itself and rewrites an `Answer.raw`. The audit is what catches it.
 *
 * THE BOUND, and why it is per table. 5.3 bounds the audit at `seq <= passStart` so a DataLoader
 * flush landing mid-pass (every call is an await) does not read as a mutation. `Answer.seq` is the
 * log's own sequence and `Media.seq` is the ingest's commit sequence, so there is no single number
 * that bounds both: the bound is `max(seq)` of each table, read at pass start, and the "after" read
 * uses the same numbers. A row the ingest wrote or re-asserted during the pass carries a higher seq
 * and is outside the window by construction, which is the second control.
 */
import type { Graph } from '../engine'
import type { Plugin, PluginContext, PluginId, PluginLogEvent, PluginOutputIndex } from './contract'
import type { WriterChange } from './writer'

import { isOnlySeasonLabel, parseSeasonNumber } from '../../../sources/season'
import { isGenericEpisodeTitle } from '../../../sources/similar'
import { titleSimilarity } from '../../../sources/utils'
import { maxPossibleSimilarity } from '../../store/fuzzy-merge'
import { contentHash, sha256Hex } from '../hash'
import { graphReady } from '../schema'
import { acceptEveryProposal, applyPluginOutput } from './writer'

/** The cap of 5.3. Two or three iterations is the normal depth on the walkthroughs of section 8. */
export const PASS_CAP = 4

/** One rule that fired about the pass itself, written the way `Cluster.anomalies` will carry it. */
export type PassAnomaly = { rule: string, detail: string, uris?: string[] }

/** What one plugin did in one iteration. */
export type PluginRun = { id: PluginId, iteration: number, ms: number, changes: number, failed?: string }

/** What a pass came to. */
export type PassReport = {
  trigger: PassTrigger
  iterations: number
  runs: PluginRun[]
  /** Every change the writer applied, in order, across every iteration. */
  changes: WriterChange[]
  /** One per iteration, over the applied deltas: a repeat is a cycle (5.3). */
  stateHashes: string[]
  anomalies: PassAnomaly[]
  logs: PluginLogEvent[]
  audit: AuditReport
  ms: number
}

// ---------------------------------------------------------------------------------------------
// Isolation layer 2: the read handle.

// 5.3's list, verbatim. `;` is refused separately, because multi-statement `query("...; ...")` is
// exercised on this engine, so a read-shaped prefix is not a read.
const WRITE_VERBS = [
  'CREATE', 'MERGE', 'SET', 'DELETE', 'DETACH', 'REMOVE', 'DROP', 'ALTER', 'COPY', 'CALL', 'LOAD',
  'IMPORT', 'EXPORT', 'ATTACH',
]

// A string literal is content, not syntax: `RETURN 'CREATE' AS word` is a read. Both quotings are
// blanked (escapes included) before the verbs are looked for.
const withoutStringLiterals = (cypher: string): string =>
  cypher.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")

/** Throws when a statement carries a write verb or a second statement. Returns nothing on a read. */
export const assertReadOnly = (id: string, cypher: string): void => {
  const bare = withoutStringLiterals(cypher)
  if (bare.includes(';')) throw new Error(`${id}: a plugin query may not carry ';' (5.3): ${cypher.slice(0, 80)}`)
  for (const verb of WRITE_VERBS) {
    if (new RegExp(`\\b${verb}\\b`, 'i').test(bare)) {
      throw new Error(`${id}: a plugin query may not carry ${verb} (5.3): ${cypher.slice(0, 80)}`)
    }
  }
}

/** The handle a plugin is given: Cypher over the whole graph, and every write verb refused. */
export const readOnlyQuery = (id: string, query: Graph['query']) =>
  async <Row>(cypher: string, params?: Record<string, unknown>): Promise<Row[]> => {
    assertReadOnly(id, cypher)
    return await query(cypher, params) as Row[]
  }

// ---------------------------------------------------------------------------------------------
// The audit.

type AuditedTable = {
  table: string
  kind: 'node' | 'edge'
  /** The column that orders the table's writes, and therefore the one the bound is taken on. */
  seq: string
  /** The column naming the row in a report, and its identity to the comparison. */
  key: string
  /** False when that column is not unique, in which case the whole row is its own identity. */
  unique?: boolean
  /** The stored content hash, when the table carries one. */
  hash?: string
  /** The JSON column the stored hash is taken over, so it can be re-hashed in JS. */
  content?: string
  /** Columns that are part of the row's witness but not of its content hash. */
  columns: string[]
}

/**
 * Every source table of 2.1, with what the audit reads off it.
 *
 * `ABOUT` is the one omission and it is deliberate: the table carries no property at all, so it has
 * no `seq` and no bound exists for it. An `ABOUT` edge the ingest writes mid-pass could not be told
 * from one a plugin invented, and a check that cannot separate those would report a failure on every
 * busy page. Every other table carries its own sequence.
 *
 * `RELATED` is the one table with no key of its own (2.1), so its identity is its whole witness: a
 * change to one reads as a row that vanished, which is the same verdict by another route.
 */
const AUDITED: AuditedTable[] = [
  { table: 'Media', kind: 'node', seq: 'seq', key: 'uri', unique: true, hash: 'hash', content: 'raw', columns: ['owned', 'scope', 'origin', 'id'] },
  { table: 'Episode', kind: 'node', seq: 'seq', key: 'uri', unique: true, hash: 'hash', content: 'raw', columns: ['origin', 'id', 'mediaUri'] },
  { table: 'Origin', kind: 'node', seq: 'seq', key: 'id', unique: true, hash: 'hash', content: 'raw', columns: [] },
  { table: 'Answer', kind: 'node', seq: 'seq', key: 'key', unique: true, columns: ['uri', 'origin', 'kind', 'operation', 'raw'] },
  { table: 'Ask', kind: 'node', seq: 'seq', key: 'key', unique: true, columns: ['runUri', 'origin', 'showId', 'outcome', 'reason', 'answerUri'] },
  { table: 'CLAIMS', kind: 'edge', seq: 'seq', key: 'key', unique: true, hash: 'hash', content: 'node', columns: ['kind', 'provenance', 'claimer', 'targetScope'] },
  { table: 'HAS_EPISODE', kind: 'edge', seq: 'seq', key: 'key', unique: true, columns: ['claimer'] },
  { table: 'EPISODE_CLAIMS', kind: 'edge', seq: 'seq', key: 'key', unique: true, columns: ['kind', 'provenance', 'claimer', 'node'] },
  { table: 'RELATED', kind: 'edge', seq: 'answerSeq', key: 'relation', columns: ['format', 'claimer', 'node'] },
]

/** The seq every audited table was at when the pass started: the window the audit compares inside. */
export type AuditBounds = Record<string, number>

/** One row as the audit sees it: where it sits in the sequence, and what it holds. */
export type AuditEntry = { seq: number | null, witness: string }

/** One side of the comparison: every source row, with the window the comparison applies. */
export type AuditDigest = {
  bounds: AuditBounds
  /** Per table, how many rows sit inside the bound and one hash over their witnesses. */
  tables: Record<string, { rows: number, witness: string }>
  /** Every row of every audited table, keyed by its identity. */
  entries: Record<string, Map<string, AuditEntry>>
  /** Rows whose stored hash does not match a re-hash of their own content. */
  mismatches: string[]
}

/** What the audit concluded. `ok` false is a failure of isolation, and it names the row that moved. */
export type AuditReport = {
  ok: boolean
  bounds: AuditBounds
  before: AuditDigest
  after: AuditDigest
  differences: string[]
  ms: number
}

const patternOf = (entry: AuditedTable, alias: string): string =>
  entry.kind === 'node' ? `MATCH (${alias}:${entry.table})` : `MATCH ()-[${alias}:${entry.table}]->()`

/**
 * Re-read and re-hash every source row, and say which of them sit inside `bounds`.
 *
 * Called once before a pass and once after, with the FIRST call's bounds both times. It reads the
 * content column so the stored hash can be re-derived in JS, which is what catches a plugin that
 * rewrote a row and left the hash alone, and it witnesses the projections beside it, which is what
 * catches one that rewrote the hash too.
 *
 * EVERY row is read, not only the ones inside the bound, because the bound is what tells a legal
 * write from an illegal one rather than what hides it: a row the ingest re-asserted mid-pass LEAVES
 * the window (4.2 step 6 advances its seq), and a bounded read alone would report it as a row that
 * vanished. `compareAudits` is where that verdict is made.
 */
export const auditSources = async (bounds?: AuditBounds): Promise<AuditDigest> => {
  const { query } = await graphReady()
  const digest: AuditDigest = { bounds: { ...bounds }, tables: {}, entries: {}, mismatches: [] }

  for (const entry of AUDITED) {
    const alias = entry.kind === 'node' ? 'n' : 'e'
    if (digest.bounds[entry.table] === undefined) {
      const [row] = await query(`${patternOf(entry, alias)} RETURN max(${alias}.${entry.seq}) AS bound`)
      digest.bounds[entry.table] = Number(row?.bound ?? 0)
    }
    const bound = digest.bounds[entry.table]!
    const columns = [...new Set([entry.key, entry.seq, ...entry.columns, ...entry.hash ? [entry.hash] : [], ...entry.content ? [entry.content] : []])]
    const projection = columns.map(column => `${alias}.${column} AS ${column}`).join(', ')
    const rows = await query(`${patternOf(entry, alias)} RETURN ${projection}`)

    const table = new Map<string, AuditEntry>()
    const lines: string[] = []
    for (const row of rows) {
      let recomputed = ''
      if (entry.hash && entry.content) {
        const content = row[entry.content]
        // a placeholder carries no content and therefore no stored hash: it is still witnessed by its
        // projections, which is what a plugin flipping `owned` or `scope` would move
        if (typeof content === 'string' && content) {
          recomputed = await contentHash(JSON.parse(content))
          if (recomputed !== row[entry.hash]) {
            digest.mismatches.push(`${entry.table} ${String(row[entry.key])}: stored hash does not match its own ${entry.content}`)
          }
        }
      }
      const witness = [...columns.filter(column => column !== entry.seq).map(column => String(row[column] ?? '')), recomputed].join(' ')
      const seq = row[entry.seq] === null || row[entry.seq] === undefined ? null : Number(row[entry.seq])
      table.set(entry.unique ? String(row[entry.key]) : witness, { seq, witness })
      if (seq !== null && seq <= bound) lines.push(witness)
    }
    lines.sort()
    digest.entries[entry.table] = table
    digest.tables[entry.table] = { rows: lines.length, witness: await sha256Hex(lines.join('\n')) }
  }
  return digest
}

/**
 * The differences between two digests, in the words a report would print.
 *
 * A row inside the window has to still be there, unchanged, UNLESS its seq has moved past the bound,
 * which only the ingest can do: `seq` advances in the ingest and nowhere else (2.3). A row that
 * appeared inside the window, or one carrying no seq at all, is an intruder for the same reason.
 */
export const compareAudits = (before: AuditDigest, after: AuditDigest): string[] => {
  const differences: string[] = []
  for (const entry of AUDITED) {
    const bound = before.bounds[entry.table] ?? 0
    const one = before.entries[entry.table]
    const two = after.entries[entry.table]
    if (!one || !two) continue
    for (const [key, row] of one) {
      if (row.seq === null || row.seq > bound) continue
      const now = two.get(key)
      if (!now) {
        differences.push(`${entry.table} ${key}: the row was deleted during the pass, inside seq <= ${bound}`)
        continue
      }
      if (now.seq !== null && now.seq > bound) continue
      if (now.witness !== row.witness) differences.push(`${entry.table} ${key}: the row changed during the pass, inside seq <= ${bound}`)
    }
    for (const [key, row] of two) {
      if (one.has(key)) continue
      if (row.seq === null) differences.push(`${entry.table} ${key}: a row carrying no seq appeared during the pass`)
      else if (row.seq <= bound) differences.push(`${entry.table} ${key}: a row appeared inside seq <= ${bound} during the pass`)
    }
  }
  for (const mismatch of after.mismatches) {
    if (!before.mismatches.includes(mismatch)) differences.push(mismatch)
  }
  return differences
}

// ---------------------------------------------------------------------------------------------
// The pass.

/**
 * The plugins in `after` order.
 *
 * Cycles are legal (5.3), so this is not a topological sort that can fail: when nothing is ready, the
 * first remaining plugin is emitted and the walk continues. The fixed-point loop is what resolves a
 * cycle, and the order only decides where it starts.
 */
export const afterOrder = (plugins: Plugin[]): Plugin[] => {
  const remaining = [...plugins]
  const emitted = new Set<PluginId>()
  const ordered: Plugin[] = []
  while (remaining.length) {
    const index = remaining.findIndex(plugin =>
      plugin.after.every(dependency => emitted.has(dependency) || !plugins.some(other => other.id === dependency)))
    const [next] = remaining.splice(index < 0 ? 0 : index, 1)
    ordered.push(next!)
    emitted.add(next!.id)
  }
  return ordered
}

/** What woke the pass. `delta` is step 2c; today every call is a full pass. */
export type PassTrigger = { reason: 'boot' | 'graph:changed' | 'manual', seq?: number }

const lastCompleted = new Map<PluginId, number>()
const previousOutput = new Map<PluginId, PluginOutputIndex>()

/** Forgets what every plugin last wrote, so a test starts from the state a fresh worker starts in. */
export const resetPassState = (): void => {
  lastCompleted.clear()
  previousOutput.clear()
}

/**
 * Run one pass over `plugins`, and say what it did.
 *
 * Every plugin runs on every call: `consumes` is read and reported, but the delta that would let a
 * plugin be SKIPPED is step 2c, so `ctx.delta.full` is true and `ctx.delta`'s lists are empty. The
 * fixed point, the cap, the state hash, the failure handling and the audit are all live.
 */
export const runPlugins = async (
  plugins: Plugin[],
  trigger: PassTrigger,
  options: { audit?: boolean } = {}
): Promise<PassReport> => {
  const started = Date.now()
  const auditStarted = Date.now()
  const { query } = await graphReady()
  const before = options.audit === false ? undefined : await auditSources()
  const bounds = before?.bounds ?? {}
  const passStart = Math.max(0, ...Object.values(bounds))
  const auditBefore = Date.now() - auditStarted

  const ordered = afterOrder(plugins)
  const runs: PluginRun[] = []
  const changes: WriterChange[] = []
  const stateHashes: string[] = []
  const anomalies: PassAnomaly[] = []
  const logs: PluginLogEvent[] = []
  const seen = new Set<string>()
  let iterations = 0

  for (let iteration = 1; iteration <= PASS_CAP; iteration += 1) {
    iterations = iteration
    const applied: WriterChange[] = []
    for (const plugin of ordered) {
      const runStarted = Date.now()
      const context: PluginContext = {
        id: plugin.id,
        query: readOnlyQuery(plugin.id, query),
        since: lastCompleted.get(plugin.id) ?? 0,
        passStart,
        // step 2c fills these; until then every plugin recomputes its whole scope
        delta: { media: [], episodes: [], claims: [], links: [], clusters: [], full: true },
        guards: acceptEveryProposal,
        previous: previousOutput.get(plugin.id) ?? { nodes: {}, edges: {} },
        titleSimilarity,
        maxPossibleSimilarity,
        parseSeasonNumber,
        isOnlySeasonLabel,
        isGenericEpisodeTitle,
        log: event => logs.push(event),
      }
      try {
        const output = await plugin.run(context)
        const report = await applyPluginOutput({
          id: plugin.id,
          version: plugin.version,
          produces: plugin.produces,
          output,
          guards: context.guards,
        })
        previousOutput.set(plugin.id, report.index)
        lastCompleted.set(plugin.id, passStart)
        applied.push(...report.changes)
        runs.push({ id: plugin.id, iteration, ms: Date.now() - runStarted, changes: report.changes.length })
      } catch (error) {
        // its previous output stands: nothing was applied for this plugin, so nothing it wrote before
        // is retracted, which an empty desired set would have done (5.3)
        const detail = error instanceof Error ? error.message : String(error)
        runs.push({ id: plugin.id, iteration, ms: Date.now() - runStarted, changes: 0, failed: detail })
        anomalies.push({ rule: 'plugin-failed', detail: `${plugin.id} threw and its previous output stands: ${detail}` })
      }
    }

    changes.push(...applied)
    if (!applied.length) break
    const hash = await stateHashOf(applied)
    stateHashes.push(hash)
    if (seen.has(hash)) {
      anomalies.push({ rule: 'fixed-point-cap', detail: `the applied deltas repeat at iteration ${iteration}, so the pass stopped on a cycle` })
      break
    }
    seen.add(hash)
    if (iteration === PASS_CAP) {
      anomalies.push({ rule: 'fixed-point-cap', detail: `a pass hit the cap of ${PASS_CAP} iterations and stopped before a fixed point` })
    }
  }

  const auditAfterStarted = Date.now()
  const after = before ? await auditSources(bounds) : undefined
  const differences = before && after ? compareAudits(before, after) : []
  for (const difference of differences) anomalies.push({ rule: 'source-mutated', detail: difference })

  return {
    trigger,
    iterations,
    runs,
    changes,
    stateHashes,
    anomalies,
    logs,
    audit: {
      ok: !differences.length,
      bounds,
      before: before ?? { bounds, tables: {}, entries: {}, mismatches: [] },
      after: after ?? { bounds, tables: {}, entries: {}, mismatches: [] },
      differences,
      ms: auditBefore + (after ? Date.now() - auditAfterStarted : 0),
    },
    ms: Date.now() - started,
  }
}

/**
 * The per-iteration state hash of 5.3: one digest over the deltas the writer APPLIED.
 *
 * Sorted, because two plugins writing the same rows in a different order are the same state, and it
 * is the state that has to repeat for a cycle to be one. `trigger` is deliberately not in it: a pass
 * woken twice by the same graph must hash alike.
 */
const stateHashOf = (changes: WriterChange[]): Promise<string> =>
  sha256Hex(changes.map(change => [change.table, change.operation, change.key].join(' ')).sort().join('\n'))
