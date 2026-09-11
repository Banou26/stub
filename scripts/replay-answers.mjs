#!/usr/bin/env node
/**
 * Replay a recorded `Answer` log into a fresh graph, and print what the ingest made of it.
 *
 *   npm run corpus:replay -- --limit 800        # about one page, the step 1b measurement
 *   npm run corpus:replay                       # the whole file, which is a season
 *   npm run corpus:replay -- --file corpus/season/summer-2026/answers.jsonl
 *
 * WHY IT EXISTS. `ingestAnswers` is the one code path: the live hook hands it the rows a flush wrote
 * (`src/worker/graph/answers.ts`), and this hands it rows off a dump. There is no replay-only branch
 * to drift, so what a page did and what this prints are the same decomposition, the same field merge
 * and the same statements. What it adds over the unit suite is SHAPE: 24 real sources, nested nodes
 * four deep, handles that name no node, and the row counts a page actually produces.
 *
 * WHAT IT PRINTS. The report (`rows in`, `ms`, what was written per table, the quarantine and its
 * reasons, the foreign nested episodes the owner rule declines) and then the row count of every table
 * of section 2. A second pass over the same rows follows, and it must report nothing: that is the
 * idempotence contract of 4.2 step 3, measured rather than asserted.
 *
 * RUN IT FROM INSIDE THE REPO. The TypeScript is loaded by node's own type stripping, with one resolve
 * hook for the extensionless specifiers vite resolves and node does not, so no build step stands
 * between this and the modules the tests use.
 */
import { createReadStream, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { registerHooks } from 'node:module'

registerHooks({
  resolve (specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      // `./engine` is `./engine.ts` here; node resolves neither extension nor index for ESM
      if (!specifier.startsWith('.')) throw error
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const FILE = argOf('file', 'corpus/season/summer-2026/answers.jsonl')
const LIMIT = Number(argOf('limit', '0')) || Infinity

if (!existsSync(FILE)) {
  console.error(`no answer log at ${FILE}. Record one with \`npm run corpus:walk\`, or pass --file.`)
  process.exit(1)
}

// streamed rather than read whole: a season is hundreds of MB and `--limit` stops early
const rows = []
let skipped = 0
const lines = createInterface({ input: createReadStream(FILE), crlfDelay: Infinity })
for await (const line of lines) {
  if (rows.length >= LIMIT) break
  if (!line.trim()) continue
  try {
    rows.push(JSON.parse(line))
  } catch {
    // the walk appends as it goes, so the last line of a file being written is routinely half a row
    skipped += 1
  }
}
lines.close()

const { setGraphEnabled, closeGraph } = await import('../src/worker/graph/engine.ts')
const { replayAnswers } = await import('../src/worker/graph/ingest.ts')
const { graphCounts } = await import('../src/worker/graph/counts.ts')

setGraphEnabled(true)

const print = (label, report) => {
  console.log(`${label}: ${report.answers} rows in, ${report.ms} ms`)
  const written = Object.entries(report.written).filter(([, total]) => total > 0)
  console.log(`  written: ${written.length ? written.map(([table, total]) => `${table} ${total}`).join(', ') : 'nothing'}`)
  console.log(`  changed: media ${report.changed.media.length}, claims ${report.changed.claims.length}, episodes ${report.changed.episodes.length}, raw-only ${report.changed.raw.length}`)
  console.log(`  declined foreign nested episodes: ${report.declinedEpisodes}, handles naming no node: ${report.handlesWithNoNode}`)
  const reasons = new Map()
  for (const entry of report.quarantined) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1)
  console.log(`  quarantined: ${report.quarantined.length}${reasons.size ? ` (${[...reasons].map(([reason, total]) => `${total} x ${reason}`).join(', ')})` : ''}`)
  for (const entry of report.quarantined.slice(0, 5)) console.log(`    ${entry.uri || '<no uri>'}: ${entry.reason}`)
}

console.log(`${FILE}: ${rows.length} rows read${skipped ? `, ${skipped} unparsable line(s) skipped` : ''}`)
print('first pass', await replayAnswers(rows))

const counts = await graphCounts()
console.log('tables:')
for (const [table, total] of Object.entries(counts)) {
  if (total) console.log(`  ${table} ${total}`)
}
console.log(`  (empty: ${Object.entries(counts).filter(([, total]) => !total).map(([table]) => table).join(', ')})`)

// the control: the same rows again must write nothing, or a recorded page is not replayable
print('second pass', await replayAnswers(rows))

await closeGraph()
