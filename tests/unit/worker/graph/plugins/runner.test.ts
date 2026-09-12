/**
 * The pass of 5.3: the fixed point, the cap, a failing plugin, the read handle and the audit.
 *
 * The audit case is the one that matters most, and it is written as a CONTROL first: a plugin that
 * deliberately misbehaves through a handle the facade does not check has to be CAUGHT, because an
 * audit that cannot express the failure would report success unconditionally.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import type { Plugin, PluginId, PluginRow } from '../../../../../src/worker/graph/plugins/contract'

import { enableGraph } from '../../../../../src/worker/graph'
import { closeGraph } from '../../../../../src/worker/graph/engine'
import { ingestAnswers } from '../../../../../src/worker/graph/ingest'
import { graphReady } from '../../../../../src/worker/graph/schema'
import {
  auditSources, compareAudits, PASS_CAP, resetPassState, runPlugins,
} from '../../../../../src/worker/graph/plugins/runner'
import { answer, media, rowsOf, sameAs, title } from './fixtures'

const plugin = (id: string, run: Plugin['run'], after: PluginId[] = []): Plugin => ({
  id: id as PluginId,
  consumes: { nodes: ['Media'], edges: [] },
  produces: { nodes: ['MediaProfile'], edges: [] },
  after,
  version: 1,
  run,
})

const rowsOutput = (rows: PluginRow[]) => ({
  scope: { full: true } as const,
  nodes: [{ table: 'MediaProfile' as const, rows }],
  edges: [],
  links: [],
  episodeLinks: [],
})

const profileUris = async (by: string) =>
  (await rowsOf('MATCH (n:MediaProfile) WHERE n.by = $by RETURN n.uri AS uri ORDER BY n.uri', { by })).map(row => row.uri)

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers([
    await answer('media', media('mal:1', { titles: [title('en', 'Frieren')], handles: [sameAs(media('kitsu:9'))] })),
    await answer('media', media('mal:2', { titles: [title('en', 'Ranking of Kings')] })),
  ])
})

afterAll(async () => {
  await closeGraph()
})

// (a) THE FIXED POINT. A pass stops when an iteration applies nothing, which is one iteration more
// than the one that wrote: the extra pass is what PROVES the output stopped moving.
// Mutation: break out of the loop as soon as anything was applied and `iterations` reads 1, so a
// plugin whose second iteration would still move is reported as converged.
test('a pass runs to a fixed point and stops when an iteration applies nothing', async () => {
  resetPassState()
  const report = await runPlugins([plugin('plugin:stable', async () => rowsOutput([{ uri: 'fix:1', scope: 'RUN' }]))], { reason: 'manual' })

  expect(report.iterations).toBe(2)
  expect(report.changes.map(change => change.operation)).toEqual(['create'])
  expect(report.anomalies, 'a converging pass reports nothing').toEqual([])
  expect(report.audit.ok).toBe(true)
  expect(await profileUris('plugin:stable')).toEqual(['fix:1'])
})

// (b) THE CAP. A plugin that never converges is stopped at four iterations and REPORTED, because a
// graph that keeps hitting the cap has to be visible rather than merely slow (5.3).
// Mutation: raise the loop bound past PASS_CAP (or drop the `iteration === PASS_CAP` anomaly) and an
// endlessly growing plugin runs forever, or silently.
test('a pass that never converges stops at the cap and reports it', async () => {
  resetPassState()
  let calls = 0
  const growing = plugin('plugin:growing', async () => {
    calls += 1
    return rowsOutput(Array.from({ length: calls }, (_, index) => ({ uri: `cap:${index}`, scope: 'RUN' })))
  })

  const report = await runPlugins([growing], { reason: 'manual' })

  expect(report.iterations).toBe(PASS_CAP)
  expect(report.anomalies.map(anomaly => anomaly.rule)).toEqual(['fixed-point-cap'])
  expect(report.anomalies[0]!.detail).toContain(`cap of ${PASS_CAP}`)
  expect(await profileUris('plugin:growing')).toEqual(['cap:0', 'cap:1', 'cap:2', 'cap:3'])
})

// (c) THE STATE HASH. Deltas that CYCLE are not deltas that grow: the hash over what the writer
// applied repeats, and the pass stops there rather than burning the rest of the cap.
// Mutation: hash the iteration number in with the changes and no two iterations can ever hash alike,
// so this reports the cap instead and does so one iteration later.
test('a repeated state hash ends the pass and is reported as a cycle', async () => {
  resetPassState()
  let calls = 0
  const flapping = plugin('plugin:flapping', async () => {
    calls += 1
    return rowsOutput(calls % 2 === 1 ? [{ uri: 'flap:1', scope: 'RUN' }] : [])
  })

  const report = await runPlugins([flapping], { reason: 'manual' })

  expect(report.iterations, 'create, delete, create: the third hash is the first').toBe(3)
  expect(report.stateHashes[0]).toBe(report.stateHashes[2])
  expect(report.anomalies.map(anomaly => anomaly.rule)).toEqual(['fixed-point-cap'])
  expect(report.anomalies[0]!.detail).toContain('repeat')
})

// (d) A PLUGIN THAT THROWS keeps its previous output, and the pass carries on. An empty desired set
// would retract everything it ever wrote, which is the one thing a failure must not do (5.3).
// Mutation: remove the try/catch and the whole pass throws; or call the writer with an empty output
// on a failure and `throws:1` disappears while the plugin that failed is still reported.
test('a plugin that throws keeps its previous output and the plugins after it still run', async () => {
  resetPassState()
  let calls = 0
  const thrower = plugin('plugin:throws', async () => {
    calls += 1
    if (calls > 1) throw new Error('boom')
    return rowsOutput([{ uri: 'throws:1', scope: 'RUN' }])
  })
  const follower = plugin('plugin:follower', async () => rowsOutput([{ uri: 'follows:1', scope: 'RUN' }]), ['plugin:throws'])

  const report = await runPlugins([follower, thrower], { reason: 'manual' })

  expect(report.runs.map(run => run.id).slice(0, 2), 'after order, whatever order they were handed in')
    .toEqual(['plugin:throws', 'plugin:follower'])
  expect(report.anomalies.map(anomaly => anomaly.rule)).toEqual(['plugin-failed'])
  expect(report.anomalies[0]!.detail).toContain('plugin:throws threw and its previous output stands')
  expect(await profileUris('plugin:throws'), 'what it wrote before the failure is untouched').toEqual(['throws:1'])
  expect(await profileUris('plugin:follower'), 'and the plugin after it ran anyway').toEqual(['follows:1'])
  expect(report.runs.some(run => run.id === 'plugin:follower' && run.iteration === 2)).toBe(true)
})

// (e) ISOLATION LAYER 2, tested through the handle a plugin is ACTUALLY given rather than through the
// checker on its own: a write verb outside a string literal is refused, and `;` with it, since
// multi-statement query is exercised on this engine.
// Mutation: drop `withoutStringLiterals` and the control read below is refused too, which is the
// failure that makes a defence useless rather than merely absent.
test('the plugin query handle refuses a write verb and a second statement, and admits a read', async () => {
  resetPassState()
  const seen: string[] = []
  const prober = plugin('plugin:prober', async ctx => {
    for (const statement of [
      'MATCH (m:Media {uri: "mal:1"}) SET m.scope = "CONTAINER"',
      'CREATE (n:MediaProfile {uri: "sneak:1"})',
      'MATCH (m:Media) RETURN m.uri AS uri; MATCH (n:Media) RETURN n.uri AS uri',
      'MATCH (m:Media)-[c:CLAIMS]->(b:Media) DELETE c',
    ]) {
      try {
        await ctx.query(statement)
        seen.push(`ADMITTED ${statement.slice(0, 20)}`)
      } catch (error) {
        seen.push(/may not carry [^:]+/.exec((error as Error).message)?.[0] ?? (error as Error).message)
      }
    }
    // THE CONTROL: a verb inside a string literal is content, and this read has to go through
    const control = await ctx.query<{ uri: string }>("MATCH (m:Media) WHERE m.origin = 'CREATE' RETURN m.uri AS uri")
    seen.push(`control returned ${control.length} rows`)
    return rowsOutput([])
  })

  const report = await runPlugins([prober], { reason: 'manual' })

  expect(report.anomalies, 'the refusals are the handle doing its job, not the plugin failing').toEqual([])
  expect(seen).toEqual([
    'may not carry SET (5.3)',
    'may not carry CREATE (5.3)',
    "may not carry ';' (5.3)",
    'may not carry DELETE (5.3)',
    'control returned 0 rows',
  ])
  expect((await rowsOf('MATCH (m:Media {uri: "mal:1"}) RETURN m.scope AS scope'))[0]!.scope, 'nothing was written')
    .toBe('RUN')
})

// (f) THE AUDIT, with the control that makes it a check rather than a decoration: a plugin that takes
// `graphReady()` for itself walks straight past the type and past the query handle, and the audit is
// the layer that catches it (5.3, isolation layer 3).
// Mutation: compare only the row COUNTS rather than the witness hashes and the tamper below is
// invisible, because a SET moves no count. That is the exact sentence 2.3 ends on.
test('the audit catches a plugin that rewrites a source row through its own handle', async () => {
  resetPassState()
  const clean = await runPlugins([plugin('plugin:clean', async () => rowsOutput([{ uri: 'audit:1', scope: 'RUN' }]))], { reason: 'manual' })
  expect(clean.audit.ok, 'the control: an honest pass reports no difference').toBe(true)
  expect(clean.audit.differences).toEqual([])
  expect(clean.audit.before.tables.Answer!.rows, 'and it actually read the log').toBeGreaterThan(0)

  const [before] = await rowsOf('MATCH (a:Answer) RETURN a.key AS key, a.raw AS raw LIMIT 1')
  const misbehaving = plugin('plugin:misbehaving', async () => {
    // the facade is not the proof: nothing stops a plugin holding the engine itself
    const { query } = await graphReady()
    await query('MATCH (a:Answer {key: $key}) SET a.raw = $raw', { key: before!.key, raw: '{"tampered":true}' })
    return rowsOutput([{ uri: 'audit:2', scope: 'RUN' }])
  })

  const caught = await runPlugins([misbehaving], { reason: 'manual' })

  expect(caught.audit.ok).toBe(false)
  expect(caught.audit.differences.join(' ')).toContain('Answer')
  expect(caught.anomalies.map(anomaly => anomaly.rule)).toContain('source-mutated')
  expect(await profileUris('plugin:misbehaving'), 'the pass still finished and wrote its own rows').toEqual(['audit:2'])

  const { query } = await graphReady()
  await query('MATCH (a:Answer {key: $key}) SET a.raw = $raw', { key: before!.key, raw: before!.raw })
})

// (g) THE BOUND, which is the audit's other half: the ingest writes DURING a pass (every call is an
// await), and those writes must not read as a mutation. A re-asserted claim advances its own seq
// (4.2 step 6), so it leaves the window rather than changing inside it. The CONTROL is the same row
// changed the way a plugin would change it, with the seq left alone, which must be reported.
// Mutation: drop the `now.seq > bound` skip in `compareAudits` and the legal re-assert below reports
// a difference, which is a page flushing mid-pass and would fire on most pages.
test('a claim re-asserted during a pass is inside no window, while the same row changed is caught', async () => {
  const before = await auditSources()

  // the same pair, the same claimer, a richer node: one re-assertion, which advances seq and hash
  await ingestAnswers([
    await answer('media', media('mal:1', {
      titles: [title('en', 'Frieren')],
      handles: [sameAs(media('kitsu:9', { url: 'https://kitsu.app/anime/9' }))],
    })),
  ])
  expect(compareAudits(before, await auditSources(before.bounds)), 'the ingest advanced its seq, so it left the window').toEqual([])

  // THE CONTROL: the same edge, changed the way only a plugin can change it, with `seq` untouched
  const { query } = await graphReady()
  const [claim] = await rowsOf('MATCH (a:Media)-[c:CLAIMS]->(b:Media) RETURN c.key AS key, c.node AS node, c.seq AS seq LIMIT 1')
  await query('MATCH (a:Media)-[c:CLAIMS {key: $key}]->(b:Media) SET c.node = $node, c.seq = cast($seq AS INT64)',
    { key: claim!.key, node: '{"tampered":true}', seq: String(claim!.seq) })

  const differences = compareAudits(before, await auditSources(before.bounds))
  expect(differences.join(' '), 'a row that changed without its seq moving is a mutation').toContain(`CLAIMS ${claim!.key}`)

  await query('MATCH (a:Media)-[c:CLAIMS {key: $key}]->(b:Media) SET c.node = $node', { key: claim!.key, node: claim!.node })
})
