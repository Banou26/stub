/**
 * The corpus against the GRAPH store, at step 2c: profile, direct and aggregate, and nothing else.
 *
 * IT REPORTS RATHER THAN ASSERTS, and that is the point of running it now. Three of the five plugins
 * of 5.4 are not written yet: no `plugin:title`, so a pair two catalogues describe and neither links
 * stays two clusters; no `plugin:containment`, so a season is attached to nothing; no `plugin:range`,
 * so no `INCLUDES` and no episode pair exists at all. A case that needs one of those MUST fail here,
 * and a run that went green would mean the corpus had stopped asking.
 *
 * So the failures are collected, counted by kind and written to ./graph-store.report.md, which is the
 * step's own measurement: it says which of the corpus's answers 2c already gives and which are owed
 * to 2d and beyond, line by line, and a later step is read against it.
 *
 * WHAT IS ASSERTED, and it is only what the specification guarantees at THIS step:
 * - no `WELD` between two rows the labels put apart where BOTH rows carry a first-party id. Sameness
 *   between two metadata catalogues is decided by `plugin:direct` and the guards of 5.2, both of
 *   which shipped, so a weld there is a bug in 2b or 2c rather than a missing plugin.
 * - every `together` group that first-party `SAME_AS` claims already join IS together. Those need no
 *   title match and no containment: the claim is the evidence, and the closure of 3.5 is what this
 *   step built.
 *
 * Nothing here weakens a case to make it pass. A line in the report is a debt, named.
 */
import { expect, test } from 'vitest'

import { writeFileSync } from 'node:fs'

import type { CorpusCase } from '../../../corpus/types'

import { graphStore, lastUpsertCost, refusalsWithin } from '../../../corpus/adapters/graph-store'
import { checkRelations, loadCases } from '../../../corpus/run'
import { PER_RUN_ORIGINS } from '../../../../src/worker/graph/plugins/sameness'

const REPORT = new URL('./graph-store.report.md', import.meta.url).pathname

/**
 * The origins whose every id names ONE RUN, which is what "a first-party id" means here (5.2 class 0):
 * mal, anilist, kitsu, anizip, anidb, offline and simkl. Imported rather than retyped, because a
 * second list of the same origins is the drift that makes two rules disagree about one catalogue.
 */
const firstParty = (uri: string): boolean => PER_RUN_ORIGINS.has(uri.slice(0, uri.indexOf(':')))

/**
 * `runCorpus`'s cluster half, ported so this file can COLLECT what that one throws.
 *
 * `tests/corpus/run.ts` belongs to the corpus rather than to this step and `runCorpus` is an
 * assertion harness by design: every case is a failing test the moment a store disagrees with a
 * label. The line format is kept identical, so a line in the report reads exactly as the same line
 * would read out of a failing run.
 */
const checkClusters = (corpusCase: CorpusCase, clusters: string[][]): string[] => {
  const holding = (uri: string): string[] => clusters.find(cluster => cluster.includes(uri)) ?? []
  const failures: string[] = []
  for (const group of corpusCase.expect.together) {
    for (const uri of group) {
      const actual = holding(uri)
      const missing = group.filter(member => !actual.includes(member))
      if (missing.length) {
        failures.push(`SPLIT: ${uri} should share a cluster with ${missing.join(', ')} but its cluster is [${actual.join(', ')}]`)
      }
    }
  }
  for (const group of corpusCase.expect.apart) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!]
        const actual = holding(a)
        if (actual.includes(b)) {
          failures.push(`WELD: ${a} and ${b} are one cluster and must not be. Cluster is [${actual.join(', ')}]`)
        }
      }
    }
  }
  return failures
}

const normalise = (clusters: string[][]): string[][] =>
  clusters.map(cluster => [...cluster].sort()).sort((a, b) => ((a[0] ?? '') < (b[0] ?? '') ? -1 : 1))

/** Whether every member of `group` reaches every other over the claims `admits` accepts. */
const joinedBy = (corpusCase: CorpusCase, group: string[], admits: (claim: { mediaUri: string, handleUri: string, relation?: string }) => boolean): boolean => {
  const neighbours = new Map<string, string[]>()
  for (const claim of corpusCase.claims) {
    if (!admits(claim)) continue
    neighbours.set(claim.mediaUri, [...neighbours.get(claim.mediaUri) ?? [], claim.handleUri])
    neighbours.set(claim.handleUri, [...neighbours.get(claim.handleUri) ?? [], claim.mediaUri])
  }
  const inside = new Set(group)
  const seen = new Set([group[0]!])
  const queue = [group[0]!]
  while (queue.length) {
    for (const next of neighbours.get(queue.shift()!) ?? []) {
      if (seen.has(next) || !inside.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return group.every(uri => seen.has(uri))
}

const isSameAs = (claim: { relation?: string }): boolean => (claim.relation ?? 'SAME_AS') === 'SAME_AS'

/**
 * Why a `together` group would hold at THIS step, which is what tells an expected split from a bug.
 *
 * `claim` means first-party ids already assert it and `plugin:direct` alone must produce it.
 * `claim (other origins)` means a claim asserts it but at least one side is not a metadata catalogue,
 * so a guard of 5.2 may legitimately have refused it. `containment` and `title` are owed to 2d and
 * 2e: no plugin in this pass reads a title or an episode range.
 */
const holdsBy = (corpusCase: CorpusCase, group: string[]): 'claim' | 'claim (other origins)' | 'containment' | 'title' => {
  if (joinedBy(corpusCase, group, claim => isSameAs(claim) && firstParty(claim.mediaUri) && firstParty(claim.handleUri))) return 'claim'
  if (joinedBy(corpusCase, group, isSameAs)) return 'claim (other origins)'
  if (joinedBy(corpusCase, group, () => true)) return 'containment'
  return 'title'
}

const KINDS = ['SPLIT', 'WELD', 'PART_OF', 'INCLUDES', 'EPISODE_PAIR', 'UNRELATED', 'ORDER'] as const
type Kind = typeof KINDS[number]

const kindOf = (line: string): Kind => {
  if (line.startsWith('SPLIT')) return 'SPLIT'
  if (line.startsWith('WELD')) return 'WELD'
  if (line.startsWith('PART_OF')) return 'PART_OF'
  if (line.startsWith('INCLUDES')) return 'INCLUDES'
  if (line.startsWith('EPISODE_PAIR') || line.startsWith('EPISODE_WELD')) return 'EPISODE_PAIR'
  if (line.startsWith('UNRELATED')) return 'UNRELATED'
  return 'ORDER'
}

type CaseReport = {
  file: string
  name: string
  pending?: string
  knownGap?: string
  lines: string[]
  /** Per `together` group, what would have to hold it: the expected / unexpected split. */
  splits: { group: string[], holds: string, failed: boolean, refusals: string[] }[]
  welds: { a: string, b: string, firstParty: boolean }[]
}

const drive = async (corpusCase: CorpusCase, reversed: boolean): Promise<string[][]> => {
  const order = <T,>(values: T[]): T[] => (reversed ? [...values].reverse() : values)
  await graphStore.reset()
  await graphStore.upsert(order(corpusCase.rows), order(corpusCase.claims), order(corpusCase.episodes ?? []))
  return normalise(await graphStore.clusters())
}

test('the corpus against the graph store: every disagreement, counted and named', async () => {
  const cases = loadCases()
  const reports: CaseReport[] = []
  const started = Date.now()
  let answers = 0
  let passMs = 0

  for (const { file, corpusCase } of cases) {
    const lines: string[] = []
    let forward: string[][] = []
    for (const reversed of [false, true]) {
      const clusters = await drive(corpusCase, reversed)
      const cost = lastUpsertCost()
      answers += cost.answers
      passMs += cost.passMs
      if (!reversed) forward = clusters
      else if (JSON.stringify(clusters) !== JSON.stringify(forward)) {
        lines.push('ORDER: the two arrival orders produced different clusters, which invariant I15 refuses')
      }
      const found = [
        ...checkClusters(corpusCase, clusters),
        ...await checkRelations(corpusCase, graphStore, clusters),
      ]
      for (const line of found) if (!lines.includes(line)) lines.push(line)
    }

    const holding = (uri: string): string[] => forward.find(cluster => cluster.includes(uri)) ?? []
    reports.push({
      file,
      name: corpusCase.name,
      pending: corpusCase.pending,
      knownGap: corpusCase.expect.knownGap,
      lines,
      splits: await Promise.all(corpusCase.expect.together.map(async group => ({
        group,
        holds: holdsBy(corpusCase, group),
        failed: group.some(uri => group.some(member => !holding(uri).includes(member))),
        // WHY it split, in the graph's own words: a guard of 5.2 refused the link, or nothing did
        refusals: [...new Set((await refusalsWithin(group)).map(refusal => `${refusal.pair}: ${refusal.reason}`))],
      }))),
      welds: corpusCase.expect.apart.flatMap(group => group.flatMap((a, index) =>
        group.slice(index + 1)
          .filter(b => holding(a).includes(b))
          .map(b => ({ a, b, firstParty: firstParty(a) && firstParty(b) })))),
    })
  }

  // THE REPORT. Written before the assertions, so a run that goes red still leaves the measurement.
  const counts = new Map<Kind, number>(KINDS.map(kind => [kind, 0]))
  for (const report of reports) for (const line of report.lines) counts.set(kindOf(line), counts.get(kindOf(line))! + 1)
  const splitsByCause = new Map<string, number>()
  for (const report of reports) {
    for (const split of report.splits) {
      if (!split.failed) continue
      splitsByCause.set(split.holds, (splitsByCause.get(split.holds) ?? 0) + 1)
    }
  }
  const green = reports.filter(report => !report.lines.length)
  const unexpectedWelds = reports.flatMap(report => report.welds.filter(weld => weld.firstParty).map(weld => ({ report, weld })))
  // A SPLIT WITH NO REFUSAL BEHIND IT is the bug this step can have: the claims assert the group, no
  // guard of 5.2 refused any link inside it, and the closure still did not hold it. A split a guard
  // DID refuse is a priced decision, which 5.2 guard 9 asks the corpus replay to count before it
  // ships on, so it is reported with the guard named rather than asserted away.
  const unexpectedSplits = reports.flatMap(report =>
    report.splits.filter(split => split.failed && split.holds === 'claim' && !split.refusals.length).map(split => ({ report, split })))
  const pricedSplits = reports.flatMap(report =>
    report.splits.filter(split => split.failed && split.holds === 'claim' && split.refusals.length).map(split => ({ report, split })))

  writeFileSync(REPORT, [
    '# The corpus against the graph store, step 2c',
    '',
    'Generated by `tests/unit/worker/corpus/graph-store.test.ts`, which drives every case in',
    '`tests/corpus/cases` twice (file order, then every list reversed) through `plugin:profile`,',
    '`plugin:direct` and `plugin:aggregate`. It carries no date on purpose: the same corpus over the',
    'same code writes the same file, so a diff here is a change in one of the two.',
    '',
    '**This step cannot pass the corpus and is not meant to.** `plugin:title` (5.4 P3),',
    '`plugin:containment` (5.4 P2) and `plugin:range` (5.4 P4) are steps 2d and 2e. A case needing a',
    'title match, a container attachment or an episode range MUST be listed below.',
    '',
    '## Counts',
    '',
    `- cases: ${reports.length}, of which ${green.length} report nothing at all`,
    `- cases with at least one line: ${reports.length - green.length}`,
    '',
    '| kind | lines | what it means |',
    '| --- | --- | --- |',
    `| SPLIT | ${counts.get('SPLIT')} | a \`together\` group came back as more than one cluster |`,
    `| WELD | ${counts.get('WELD')} | an \`apart\` pair came back as one cluster |`,
    `| PART_OF | ${counts.get('PART_OF')} | a container attachment, which \`plugin:containment\` writes (2d) |`,
    `| INCLUDES | ${counts.get('INCLUDES')} | an episode range, which \`plugin:range\` writes (2e) |`,
    `| EPISODE_PAIR | ${counts.get('EPISODE_PAIR')} | two rows that are one broadcast episode, also \`plugin:range\` |`,
    `| UNRELATED | ${counts.get('UNRELATED')} | a row that must stand alone and does not |`,
    `| ORDER | ${counts.get('ORDER')} | the two arrival orders disagreed (invariant I15) |`,
    '',
    '## Which SPLITs are expected',
    '',
    'A `together` group holds at this step only when a claim already asserts it. What each failing',
    'group would need:',
    '',
    '| what would hold the group | failing groups | expected at 2c |',
    '| --- | --- | --- |',
    `| a first-party \`SAME_AS\` claim | ${splitsByCause.get('claim') ?? 0} | only where a guard of 5.2 REFUSED it, named on the line: ${pricedSplits.length} of them, and ${unexpectedSplits.length} with no refusal behind them |`,
    `| a \`SAME_AS\` claim naming another origin | ${splitsByCause.get('claim (other origins)') ?? 0} | sometimes: a guard of 5.2 may have refused it, and the report line says which rows |`,
    `| a containment edge | ${splitsByCause.get('containment') ?? 0} | yes: \`plugin:containment\` is 2d |`,
    `| a title match | ${splitsByCause.get('title') ?? 0} | yes: \`plugin:title\` is 2e |`,
    '',
    '## The lines',
    '',
    ...reports.filter(report => report.lines.length).flatMap(report => [
      `### ${report.file}`,
      '',
      `${report.name}`,
      ...report.pending ? ['', `PENDING on "${report.pending}": the case says this cannot be asked of any store yet.`] : [],
      ...report.knownGap ? ['', `KNOWN GAP: the case pins what the OLD store does rather than what is right. ${report.knownGap}`] : [],
      ...report.splits.filter(split => split.failed).map(split =>
        `\n- the group [${split.group.join(', ')}] would be held by: ${split.holds}`
        + (split.refusals.length ? `, and a guard of 5.2 refused: ${split.refusals.join('; ')}` : '')),
      '',
      '```',
      ...report.lines,
      '```',
      '',
    ]),
  ].join('\n'))

  // THE TWO ASSERTIONS. Everything above is a measurement; these two are what 2c promised.
  expect(
    unexpectedWelds.map(entry => `${entry.report.file}: ${entry.weld.a} and ${entry.weld.b}`),
    'a weld between two first-party ids is a bug in the guards of 5.2 or in the closure of 3.5, never a missing plugin'
  ).toEqual([])
  expect(
    unexpectedSplits.map(entry => `${entry.report.file}: [${entry.split.group.join(', ')}]`),
    'a group first-party SAME_AS claims join, that no guard of 5.2 refused, is what plugin:direct asserts and the closure holds'
  ).toEqual([])

  console.info('the corpus against the graph store:', JSON.stringify({
    cases: reports.length,
    green: green.length,
    answers,
    lines: Object.fromEntries([...counts].filter(([, total]) => total)),
    splitsByCause: Object.fromEntries(splitsByCause),
    pricedSplits: pricedSplits.map(entry => `${entry.report.file}: ${entry.split.refusals.join('; ')}`),
    passMs,
    totalMs: Date.now() - started,
  }, null, 2))
}, 1_800_000)
