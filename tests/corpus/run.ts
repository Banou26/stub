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

import { validateCase, type CorpusCase, type CorpusClaim, type CorpusEpisode, type CorpusMedia } from './types'

/**
 * What an implementation has to provide, and deliberately nothing more.
 *
 * Four methods, none of which names a mechanism. A store is free to cluster through a union-find, a
 * graph database, merge plugins or anything else: the corpus only ever asks who ended up with whom.
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
 */
export type CorpusStore = {
  reset(): Promise<void>
  upsert(rows: CorpusMedia[], claims: CorpusClaim[], episodes?: CorpusEpisode[]): Promise<void>
  clusters(): Promise<string[][]>
  episodesOf(uri: string): Promise<number>
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

const report = (corpusCase: CorpusCase, failures: string[]): string => [
  `${failures.length} expectation${failures.length === 1 ? '' : 's'} failed in "${corpusCase.name}"`,
  `SOURCE: ${corpusCase.source.file} :: ${corpusCase.source.test}`,
  `WHY THIS CASE IS RIGHT: ${corpusCase.why}`,
  ...(corpusCase.expect.knownGap
    ? [`KNOWN GAP: this case pins what the store DOES, not what is right. ${corpusCase.expect.knownGap}`]
    : []),
  [...new Set(failures)].join('\n'),
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

      const { episodeRows } = corpusCase.expect
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
