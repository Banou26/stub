/**
 * The corpus runner: drives every case in ./cases against any store that satisfies `CorpusStore`.
 *
 * The cases are the record's hand-decided answers and this file is the only thing that knows how to
 * ask them of an implementation. A new store is proven against the corpus by writing one adapter and
 * one test file; nothing here imports from `src/`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import {
  validateCase,
  type CorpusCase, type CorpusClaim, type CorpusEpisode, type CorpusEpisodeRange, type CorpusIncludes,
  type CorpusMedia,
} from './types'

/**
 * What an implementation has to provide, and deliberately nothing more.
 *
 * Seven methods, none of which names a mechanism. A store is free to cluster through a union-find, a
 * graph database, merge plugins or anything else: the corpus only ever asks who ended up with whom,
 * what holds what, and which two rows are one episode.
 *
 * `upsert` takes the whole case in ONE call and is expected to return once the store has settled,
 * including any pass the app would run before a page is built. A store that merges lazily does that
 * work here.
 *
 * `clusters` returns EVERY cluster the store holds, each as its member uris. A uri that was never
 * merged with anything comes back as a cluster of one, because "this row stands alone" is an answer
 * the corpus asserts as often as "these two are together".
 *
 * `episodesOf` returns how many DISTINCT episode numbers the cluster holding that uri would draw,
 * which is the number a page renders as rows.
 *
 * A STORE THAT LACKS ONE OF THESE CONCEPTS RETURNS AN EMPTY RESULT AND NEVER THROWS. An empty answer
 * is readable as "this store cannot hold that fact", which a case can be marked `pending` against; a
 * throw is a broken adapter, and the two must not look alike.
 */
export type CorpusStore = {
  reset(): Promise<void>
  upsert(rows: CorpusMedia[], claims: CorpusClaim[], episodes?: CorpusEpisode[]): Promise<void>
  clusters(): Promise<string[][]>
  episodesOf(uri: string): Promise<number>
  /**
   * The uris this row's cluster is attached to AS A CONTAINER: every whole it is a part of, expanded
   * to every member of the whole's own cluster, so a run that is part of a show names every id that
   * show has. Never includes the row's own cluster. Empty when the row is part of nothing.
   */
  containersOf(uri: string): Promise<string[]>
  /**
   * Every INCLUDES edge naming this uri, as the container or as the run, with the range when the
   * store knows which of the container's episodes the run is. Empty when the store holds no INCLUDES.
   */
  includesOf(uri: string): Promise<CorpusIncludes[]>
  /**
   * The other episode rows this store would draw as the SAME broadcast episode, never including the
   * uri asked about. Empty when the row stands alone, which is the right answer for an inserted
   * special.
   */
  episodePairsOf(episodeUri: string): Promise<string[]>
}

const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases')

export type LoadedCase = { file: string, corpusCase: CorpusCase }

/** Every case file, parsed and validated. A malformed file throws here, naming the exact path. */
export const loadCases = (): LoadedCase[] =>
  readdirSync(CASES_DIR)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => ({
      file,
      corpusCase: validateCase(JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')), file),
    }))

const normalise = (clusters: string[][]): string[][] =>
  clusters.map(cluster => [...cluster].sort()).sort((a, b) => (a[0] ?? '') < (b[0] ?? '') ? -1 : 1)

const clusterHolding = (clusters: string[][], uri: string): string[] =>
  clusters.find(cluster => cluster.includes(uri)) ?? []

const drive = async (store: CorpusStore, corpusCase: CorpusCase, reversed: boolean): Promise<string[][]> => {
  const order = <T,>(values: T[]): T[] => reversed ? [...values].reverse() : values
  await store.reset()
  await store.upsert(order(corpusCase.rows), order(corpusCase.claims), order(corpusCase.episodes ?? []))
  return normalise(await store.clusters())
}

/** Everything the case asks that a cluster listing can answer. Returns one line per broken promise. */
const checkClusters = (corpusCase: CorpusCase, clusters: string[][]): string[] => {
  const failures: string[] = []

  for (const group of corpusCase.expect.together) {
    for (const uri of group) {
      const actual = clusterHolding(clusters, uri)
      const missing = group.filter(member => !actual.includes(member))
      if (missing.length) {
        failures.push(
          `SPLIT: ${uri} should share a cluster with ${missing.join(', ')} but its cluster is [${actual.join(', ')}]`
        )
      }
    }
  }

  for (const group of corpusCase.expect.apart) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!]
        const actual = clusterHolding(clusters, a)
        if (actual.includes(b)) {
          failures.push(`WELD: ${a} and ${b} are one cluster and must not be. Cluster is [${actual.join(', ')}]`)
        }
      }
    }
  }

  return failures
}

const describeRange = (range: CorpusEpisodeRange): string =>
  `${range.fromStart}..${range.fromEnd} onto ${range.toStart}..${range.toEnd}`

const describeIncludes = (edge: CorpusIncludes): string =>
  `${edge.container} holds ${edge.run}${edge.range ? ` at ${describeRange(edge.range)}` : ' with no range'}`

const sameRange = (a: CorpusEpisodeRange, b: CorpusEpisodeRange): boolean =>
  a.fromStart === b.fromStart && a.fromEnd === b.fromEnd && a.toStart === b.toStart && a.toEnd === b.toEnd

const list = (values: string[]): string => values.length ? values.join(', ') : 'nothing'

/**
 * Everything the case asks that a cluster listing cannot answer: containment, ranges and episode
 * identity. Returns one line per broken promise, each naming the kind and what the store actually
 * said, because "PART_OF failed" is not a thing anybody can act on.
 *
 * The store is asked as it stands, so the caller drives the case first.
 *
 * Exported for its own control (`tests/unit/worker/corpus/relation-checks.test.ts`): today's store
 * holds no INCLUDES and no cross-cluster episode identity, so no case file can make those two lines
 * fire against it, and a check nothing can redden is a check nobody should believe.
 */
export const checkRelations = async (corpusCase: CorpusCase, store: CorpusStore, clusters: string[][]): Promise<string[]> => {
  const failures: string[] = []
  const { partOf, includes, episodePairs, episodeApart, unrelated } = corpusCase.expect

  for (const { part, whole } of partOf ?? []) {
    const containers = await store.containersOf(part)
    if (!containers.includes(whole)) {
      failures.push(`PART_OF: ${part} must be attached to ${whole} as a container. containersOf(${part}) is [${list(containers)}]`)
    }
    const cluster = clusterHolding(clusters, part)
    if (cluster.includes(whole)) {
      failures.push(`PART_OF MERGED: ${part} and ${whole} are one cluster and must not be, because a container holds the run and is not the run. Cluster is [${list(cluster)}]`)
    }
  }

  for (const edge of includes ?? []) {
    const held = await store.includesOf(edge.container)
    const actual = held.find(candidate => candidate.container === edge.container && candidate.run === edge.run)
    if (!actual) {
      failures.push(`INCLUDES: ${edge.container} must hold ${edge.run}. includesOf(${edge.container}) is [${list(held.map(describeIncludes))}]`)
      continue
    }
    if (edge.range && !(actual.range && sameRange(actual.range, edge.range))) {
      failures.push(
        `INCLUDES RANGE: ${edge.container} holds ${edge.run} at ${describeRange(edge.range)} and the store says `
        + `${actual.range ? describeRange(actual.range) : 'no range'}`
      )
    }
  }

  for (const { a, b } of episodePairs ?? []) {
    for (const [from, to] of [[a, b], [b, a]] as [string, string][]) {
      const paired = await store.episodePairsOf(from)
      if (!paired.includes(to)) {
        failures.push(`EPISODE_PAIR: ${from} and ${to} are one broadcast episode. episodePairsOf(${from}) is [${list(paired)}]`)
      }
    }
  }

  for (const { a, b } of episodeApart ?? []) {
    for (const [from, to] of [[a, b], [b, a]] as [string, string][]) {
      const paired = await store.episodePairsOf(from)
      if (paired.includes(to)) {
        failures.push(`EPISODE_WELD: ${from} and ${to} are two different episodes and must never be one row. episodePairsOf(${from}) is [${list(paired)}]`)
      }
    }
  }

  for (const uri of unrelated ?? []) {
    const cluster = clusterHolding(clusters, uri)
    if (cluster.length > 1) failures.push(`UNRELATED MERGED: ${uri} must stand alone and its cluster is [${list(cluster)}]`)
    const containers = await store.containersOf(uri)
    if (containers.length) failures.push(`UNRELATED ATTACHED: ${uri} must be part of nothing and containersOf(${uri}) is [${list(containers)}]`)
    const held = await store.includesOf(uri)
    if (held.length) failures.push(`UNRELATED HELD: ${uri} must be in no INCLUDES and includesOf(${uri}) is [${list(held.map(describeIncludes))}]`)
    // the other direction, which is the half a row's own answers cannot see: nothing in the case may
    // point AT a row that is supposed to stay a lone badge
    for (const row of corpusCase.rows) {
      if (row.uri === uri) continue
      if ((await store.containersOf(row.uri)).includes(uri)) {
        failures.push(`UNRELATED HOLDS: ${row.uri} is attached to ${uri}, which must hold nothing in this case`)
      }
    }
  }

  return failures
}

const report = (corpusCase: CorpusCase, failures: string[]): string => [
  `${failures.length} expectation${failures.length === 1 ? '' : 's'} failed in "${corpusCase.name}"`,
  `SOURCE: ${corpusCase.source.file} :: ${corpusCase.source.test}`,
  ...(corpusCase.source.answers?.length ? [`ANSWERS: ${corpusCase.source.answers.join(', ')}`] : []),
  `WHY THIS CASE IS RIGHT: ${corpusCase.why}`,
  ...(corpusCase.checked ? [`CHECKED BY: ${corpusCase.checked.by}, ${corpusCase.checked.at}`] : []),
  ...(corpusCase.expect.knownGap
    ? [`KNOWN GAP: this case pins what the store DOES, not what is right. ${corpusCase.expect.knownGap}`]
    : []),
  [...new Set(failures)].join('\n'),
].join('\n\n')

/** What a pending case prints instead of failing: the same lines, said as a waiting list. */
const pendingReport = (corpusCase: CorpusCase, pending: string, failures: string[]): string => [
  failures.length
    ? `${failures.length} expectation${failures.length === 1 ? '' : 's'} PENDING on "${pending}" in "${corpusCase.name}"`
    : `every pending expectation in "${corpusCase.name}" is already met: drop its "pending": "${pending}"`,
  ...(failures.length ? [[...new Set(failures)].join('\n')] : []),
].join('\n\n')

/**
 * Registers the whole corpus against one store.
 *
 * Every case runs TWICE, once in file order and once with the rows, claims and episodes reversed,
 * and the two runs must produce the same clusters. Arrival order deciding an outcome is invariant
 * I15 in docs/design-inputs/01-edge-cases.md, and it is not a separate suite because a store that
 * gets a case right in one order and wrong in the other has not got the case right.
 */
export const runCorpus = (store: CorpusStore) => {
  const cases = loadCases()

  describe('corpus', () => {
    test('the corpus loads and every case file matches the format in ./types.ts', () => {
      const files = readdirSync(CASES_DIR).filter(file => file.endsWith('.json'))
      expect(files.length, 'no case files found').toBeGreaterThan(0)
      for (const file of files) validateCase(JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')), file)
      expect(cases.length).toBe(files.length)
    })

    for (const { file, corpusCase } of cases) {
      // Both directions are driven once and their cluster listings kept, because the store is one
      // stateful thing and the three tests below ask three questions of the same two runs.
      let runs: Promise<{ forward: string[][], reversed: string[][] }> | null = null
      const both = () => runs ??= (async () => ({
        forward: await drive(store, corpusCase, false),
        reversed: await drive(store, corpusCase, true),
      }))()

      test(`${file}: ${corpusCase.name}`, async () => {
        const failures = checkClusters(corpusCase, (await both()).forward)
        if (failures.length) throw new Error(report(corpusCase, failures))
      })

      test(`${file}: ${corpusCase.name} (rows reversed)`, async () => {
        const failures = checkClusters(corpusCase, (await both()).reversed)
        if (failures.length) throw new Error(report(corpusCase, failures))
      })

      test(`${file}: arrival order does not decide the clusters`, async () => {
        const { forward, reversed } = await both()
        expect(reversed, report(corpusCase, ['the two arrival orders produced different clusters'])).toEqual(forward)
      })

      const { partOf, includes, episodePairs, episodeApart, unrelated, episodeRows } = corpusCase.expect
      const { pending } = corpusCase
      const asksRelations = [partOf, includes, episodePairs, episodeApart, unrelated].some(kind => kind !== undefined)
      if (asksRelations) {
        const name = `${file}: ${corpusCase.name} (containment and episode identity${pending ? `, pending: ${pending}` : ''})`
        test(name, async () => {
          const failures: string[] = []
          for (const reversed of [false, true]) {
            const clusters = await drive(store, corpusCase, reversed)
            const found = await checkRelations(corpusCase, store, clusters)
            failures.push(...found.map(line => reversed ? `${line} (rows reversed)` : line))
          }
          // A pending case is one whose expectations no implementation can yet be ASKED, so the
          // question is printed rather than failed. `together` and `apart` above still assert, which
          // is what keeps a pending case from being a case that checks nothing.
          if (pending) {
            console.log(pendingReport(corpusCase, pending, failures))
            return
          }
          if (failures.length) throw new Error(report(corpusCase, failures))
        })
      }

      if (episodeRows) {
        test(`${file}: ${episodeRows.clusterOf} draws ${episodeRows.count} episode rows`, async () => {
          await drive(store, corpusCase, false)
          const drawn = await store.episodesOf(episodeRows.clusterOf)
          if (drawn !== episodeRows.count) {
            throw new Error(report(corpusCase, [
              `DRAWS ${drawn} EPISODE ROWS, EXPECTED ${episodeRows.count}: ${episodeRows.clusterOf}'s cluster is `
              + `[${clusterHolding(await store.clusters(), episodeRows.clusterOf).join(', ')}]. A cluster can hold `
              + `the right members and still list somebody else's episodes.`,
            ]))
          }
        })
      }
    }
  })
}
