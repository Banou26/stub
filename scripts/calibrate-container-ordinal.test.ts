/**
 * How dangerous is the ORDINAL axis between a run and a show container, measured before it is built.
 *
 * WHAT IS BEING WEIGHED. `plugin:title` pairs two clusters only inside one YEAR BUCKET, so a show
 * container carrying its first run's date (2021) is never even compared with that show's second run
 * (2023). Lifting that for one narrow shape is the change under test: a run title that CARRIES a
 * season marker of 2 or more, with the marker removed, EQUAL to a container title. The danger the
 * year bucket was buying for free is a run of one show meeting a DIFFERENT show's container whose
 * title happens to read the same, and that is the number this file produces.
 *
 * HOW TO RUN IT. Not in `vitest.config.ts`'s include list, the same as every other `calibrate-*`
 * here, so `npm run test:unit` does not pay for a 38 MB corpus:
 *
 *   ./node_modules/.bin/vitest run --config vitest.calibration.config.ts \
 *     --disableConsoleIntercept --reporter=verbose scripts/calibrate-container-ordinal.test.ts
 *
 * `--disableConsoleIntercept` is not optional: without it vitest swallows every line below and the
 * run passes while printing no measurement.
 *
 * THE GROUND TRUTH IS NOT LEXICAL, which is the whole reason this file can say anything. Whether two
 * records are one show is read off manami's `related` graph, unioned over shared source urls: a
 * relation between catalogue ids, with no title in it anywhere. Using `seasonless` equality as the
 * label would be labelling the axis with the axis, and every pair would score as correct by
 * construction.
 *
 * THE MODEL IS DELIBERATELY WIDER THAN PRODUCTION, in both directions that matter, so the negative
 * rate it prints is an UPPER BOUND rather than an estimate:
 *  - every title and synonym of a record is a key, where a cluster ships at most six by score,
 *  - every record's key is treated as an available container title, where a real container is one
 *    show-level row out of a handful of streaming catalogues.
 *
 * THE CONTROLS, because a scan that reports few negatives is first a claim about the scan:
 *  - the axis must FIRE: a stated positive (Mushoku Tensei season 2 against the show) is asserted by
 *    name, and the corpus-wide fire count must be in the thousands.
 *  - `seasonless` mutated to the identity must take the fire count to zero. A stripper that strips
 *    nothing is the one failure that makes every number here meaningless.
 *  - each of the rule's three conditions is taken away in turn and the arm reported beside the
 *    shipped one, so what a condition buys is a number rather than an argument. The ordinal floor
 *    raises the cross-franchise count when it goes; the `stripped === key` refusal does NOT, and the
 *    case that prices it says so in its own comment rather than asserting damage it cannot show.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { SEASON_MARKER, parseSeasonNumber } from '../src/sources/season'
import { stripTitle } from '../src/sources/utils'
import { containerKeyOf, LATER_RUN_ORDINAL } from '../src/worker/graph/plugins/title'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CORPUS_PATH = process.env.CORPUS_PATH ?? resolve(ROOT, 'node_modules/.cache/manami-titles.json')

type Record_ = {
  sources: string[]
  title: string
  synonyms: string[]
  type: string
  year: number | null
  related: string[]
}

type Corpus = { tag: string, updated: string, records: Record_[] }

const loadCorpus = (): Corpus => {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `no corpus at ${CORPUS_PATH}\n`
      + `Regenerate it with:\n  node scripts/fetch-title-corpus.mjs ${CORPUS_PATH}`
    )
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus
  if (!Array.isArray(corpus.records) || corpus.records.length < 30_000) {
    throw new Error(`corpus at ${CORPUS_PATH} holds ${corpus.records?.length ?? 0} records, expected 30000 or more`)
  }
  return corpus
}

/* ------------------------------------------------------------------------------------------------
 * The axis under test, stated on ONE key
 * ---------------------------------------------------------------------------------------------- */

/** The season markers removed and the result re-normalized, which is `plugin:title`'s own spelling. */
const seasonless = (key: string): string =>
  stripTitle(SEASON_MARKER.reduce((text, marker) => text.replace(marker, ' '), key))

/** What one arm of the sweep asks of a key: the container it names, or nothing. */
type Axis = (key: string) => string | undefined

/**
 * The arms, and the shipped one is the PRODUCTION FUNCTION rather than a copy of it.
 *
 * `plugin:title` exports `containerKeyOf`, so the measured arm here is the rule that ships and cannot
 * drift from it. The three controls are the same rule with exactly one of its three conditions taken
 * away, which is what prices each condition rather than the rule as a whole:
 * - `noFloor` accepts an ordinal of 1, so every first run starts naming its own show.
 * - `noChange` accepts a key that lost nothing, which is a key with no marker in it. The shape that
 *   reaches this is a bare `N期` or `N기`: `parseSeasonNumber` reads it and `SEASON_MARKER` refuses
 *   to delete it, on purpose (`season.ts`, "deleting a bare S2 costs more than the query it buys").
 * - `inert` strips nothing at all, which is the rig-is-dead control and must take the count to zero.
 */
const noFloor: Axis = key => {
  if (parseSeasonNumber(key) === undefined) return undefined
  const stripped = seasonless(key)
  return !stripped || stripped === key ? undefined : stripped
}

const noChange: Axis = key => {
  const ordinal = parseSeasonNumber(key)
  if (ordinal === undefined || ordinal < LATER_RUN_ORDINAL) return undefined
  const stripped = seasonless(key)
  return stripped || undefined
}

const inert: Axis = key => {
  const ordinal = parseSeasonNumber(key)
  if (ordinal === undefined || ordinal < LATER_RUN_ORDINAL) return undefined
  // the shipped rule with the stripper replaced by the identity, which is the dead-rig control
  const stripped = key
  return !stripped || stripped === key ? undefined : stripped
}

/* ------------------------------------------------------------------------------------------------
 * The corpus as clusters and franchises
 * ---------------------------------------------------------------------------------------------- */

type Row = { index: number, keys: string[], title: string, year: number | null }

const keysOf = (record: Record_): string[] => {
  const keys = new Set<string>()
  for (const title of [record.title, ...record.synonyms]) {
    const key = stripTitle(title ?? '')
    if (key) keys.add(key)
  }
  return [...keys]
}

/** Union-find over manami's `related`, joined on SOURCE URLS: catalogue ids, never titles. */
const franchisesOf = (records: Record_[]): number[] => {
  const parent = records.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!
      current = parent[current]!
    }
    return current
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }
  const owner = new Map<string, number>()
  records.forEach((record, index) => {
    for (const source of record.sources) if (!owner.has(source)) owner.set(source, index)
  })
  records.forEach((record, index) => {
    for (const source of record.related) {
      const other = owner.get(source)
      if (other !== undefined) union(index, other)
    }
  })
  return records.map((_, index) => find(index))
}

/* ------------------------------------------------------------------------------------------------
 * The sweep
 * ---------------------------------------------------------------------------------------------- */

type Sweep = {
  /** run keys the axis fired on */
  fired: number
  /** (run, container-title-holder) pairs the axis produced, deduped on the two records */
  pairs: number
  /** of those, the pairs whose two records manami's `related` graph does NOT put in one franchise */
  crossShow: number
  /** the distinct run records with at least one cross-show pair */
  crossShowRuns: number
  examples: string[]
}

const sweep = (rows: Row[], franchise: number[], byKey: Map<string, number[]>, axis: Axis): Sweep => {
  let fired = 0
  let pairs = 0
  let crossShow = 0
  const crossRuns = new Set<number>()
  const examples: string[] = []
  for (const row of rows) {
    const wanted = new Set<string>()
    for (const key of row.keys) {
      const container = axis(key)
      if (container) wanted.add(container)
    }
    if (!wanted.size) continue
    fired += 1
    const seen = new Set<number>()
    for (const container of wanted) {
      for (const other of byKey.get(container) ?? []) {
        if (other === row.index || seen.has(other)) continue
        seen.add(other)
        pairs += 1
        if (franchise[other] === franchise[row.index]) continue
        crossShow += 1
        crossRuns.add(row.index)
        if (examples.length < 25) examples.push(`${row.title} (${row.year}) -> ${rows[other]!.title} (${rows[other]!.year}) on "${container}"`)
      }
    }
  }
  return { fired, pairs, crossShow, crossShowRuns: crossRuns.size, examples }
}

/**
 * The SHIPPED route, measured under the identical labels: an exact key shared inside one year bucket.
 *
 * This is `EXACT_SCAN` as it stands, and it is here because an absolute cross-show rate is unreadable
 * on its own. manami's `related` graph is INCOMPLETE (Arcane and Arcane Season 2 are not joined in
 * it), so every arm's count is inflated by the same labelling gap; what the gap cannot distort is the
 * comparison between two arms scored the same way. The question this file can actually answer is
 * whether the proposed axis is more dangerous than the mechanism the store already trusts.
 *
 * `sameYear` false is the third arm: the same exact-key route with the year bucket taken away, which
 * prices the bucket itself.
 */
const sweepExact = (rows: Row[], franchise: number[], byKey: Map<string, number[]>, sameYear: boolean) => {
  let pairs = 0
  let crossShow = 0
  const examples: string[] = []
  for (const row of rows) {
    const seen = new Set<number>()
    for (const key of row.keys) {
      for (const other of byKey.get(key) ?? []) {
        if (other === row.index || seen.has(other)) continue
        if (sameYear && (row.year === null || rows[other]!.year !== row.year)) continue
        seen.add(other)
        pairs += 1
        if (franchise[other] === franchise[row.index]) continue
        crossShow += 1
        if (examples.length < 8) examples.push(`${row.title} (${row.year}) -> ${rows[other]!.title} (${rows[other]!.year}) on "${key}"`)
      }
    }
  }
  return { pairs, crossShow, examples }
}

/* ------------------------------------------------------------------------------------------------
 * The report
 * ---------------------------------------------------------------------------------------------- */

describe('the ordinal axis between a run and a show container', () => {
  let rows: Row[]
  let franchise: number[]
  let byKey: Map<string, number[]>
  let shipped: Sweep

  beforeAll(() => {
    const corpus = loadCorpus()
    const records = corpus.records
    rows = records.map((record, index) => ({ index, keys: keysOf(record), title: record.title, year: record.year }))
    franchise = franchisesOf(records)
    byKey = new Map()
    for (const row of rows) {
      for (const key of row.keys) {
        const holders = byKey.get(key)
        if (holders) holders.push(row.index)
        else byKey.set(key, [row.index])
      }
    }
    shipped = sweep(rows, franchise, byKey, containerKeyOf)
    console.log(`\ncorpus ${corpus.tag}, ${records.length} records, ${byKey.size} distinct keys, ${new Set(franchise).size} franchises`)
    console.log(`\nAXIS AS PROPOSED (ordinal >= 2, marker removed, exact key)`)
    console.log(`  run records the axis fires on : ${shipped.fired}`)
    console.log(`  (run, container) pairs        : ${shipped.pairs}`)
    console.log(`  of those, CROSS-SHOW          : ${shipped.crossShow} (${(100 * shipped.crossShow / Math.max(1, shipped.pairs)).toFixed(3)}%)`)
    console.log(`  run records with any of those : ${shipped.crossShowRuns} of ${shipped.fired} (${(100 * shipped.crossShowRuns / Math.max(1, shipped.fired)).toFixed(3)}%)`)
    for (const example of shipped.examples) console.log(`    ${example}`)

    const bucketed = sweepExact(rows, franchise, byKey, true)
    const unbucketed = sweepExact(rows, franchise, byKey, false)
    console.log(`\nSHIPPED EXACT ROUTE, same labels (exact key, same year)`)
    console.log(`  pairs ${bucketed.pairs}, cross-show ${bucketed.crossShow} (${(100 * bucketed.crossShow / Math.max(1, bucketed.pairs)).toFixed(3)}%)`)
    for (const example of bucketed.examples) console.log(`    ${example}`)
    console.log(`\nTHE YEAR BUCKET PRICED (exact key, ANY year)`)
    console.log(`  pairs ${unbucketed.pairs}, cross-show ${unbucketed.crossShow} (${(100 * unbucketed.crossShow / Math.max(1, unbucketed.pairs)).toFixed(3)}%)`)
    for (const example of unbucketed.examples) console.log(`    ${example}`)
  })

  it('fires on the pair this change exists for', () => {
    expect(containerKeyOf(stripTitle('Mushoku Tensei: Jobless Reincarnation Season 2')))
      .toBe(stripTitle('Mushoku Tensei: Jobless Reincarnation'))
    expect(containerKeyOf(stripTitle('Mushoku Tensei: Jobless Reincarnation Season 2 Part 2')))
      .toBe(stripTitle('Mushoku Tensei: Jobless Reincarnation'))
    expect(containerKeyOf(stripTitle('無職転生 ～異世界行ったら本気だす～ 第2期')))
      .toBe(stripTitle('無職転生 ～異世界行ったら本気だす～'))
  })

  it('refuses a key with no ordinal, a first run, and a key that loses nothing', () => {
    expect(containerKeyOf(stripTitle('Fruits Basket')), 'no ordinal to read').toBeUndefined()
    expect(containerKeyOf(stripTitle('Mushoku Tensei: Jobless Reincarnation'))).toBeUndefined()
    // an ordinal of 1 is the show's own first run, and the year bucket already pairs it
    expect(containerKeyOf(stripTitle('Yofukashi no Uta Season 1'))).toBeUndefined()
    // the one shape where the second condition is the only thing standing between a key and itself:
    // `parseSeasonNumber` reads a bare `N期` and `SEASON_MARKER` declines to delete one
    expect(parseSeasonNumber(stripTitle('無職転生 2期'))).toBe(2)
    expect(containerKeyOf(stripTitle('無職転生 2期'))).toBeUndefined()
  })

  it('CONTROL: a stripper that strips nothing takes the fire count to zero', () => {
    const dead = sweep(rows, franchise, byKey, inert)
    console.log(`\nCONTROL seasonless -> identity: fired ${dead.fired}, pairs ${dead.pairs}, cross-show ${dead.crossShow}`)
    expect(shipped.fired).toBeGreaterThan(1_000)
    expect(dead.fired).toBe(0)
  })

  it('CONTROL: dropping the ordinal floor raises the cross-show count', () => {
    const loose = sweep(rows, franchise, byKey, noFloor)
    console.log(`\nCONTROL ordinal floor 2 -> 1: fired ${loose.fired}, pairs ${loose.pairs}, cross-show ${loose.crossShow}`)
    expect(loose.crossShow).toBeGreaterThan(shipped.crossShow)
  })

  // AND THIS ONE REPORTS A ZERO, which is why it asserts the widening rather than the damage. Allowing
  // a key that lost nothing fires on 17 more records and produces 16 more pairs, and NONE of them
  // crosses a franchise: on manami the condition buys no measurable safety. It is kept anyway, and the
  // reason is a shape this corpus cannot express: the pairs it admits are a key naming ITSELF, which
  // is a run and a container agreeing on a title across two year buckets, and manami holds no
  // container rows for that to be priced against. Read the pair count, not the cross-show count.
  it('CONTROL: accepting a key that lost nothing widens the fire set', () => {
    const loose = sweep(rows, franchise, byKey, noChange)
    console.log(`\nCONTROL stripped === key allowed: fired ${loose.fired}, pairs ${loose.pairs}, cross-show ${loose.crossShow}`)
    expect(loose.pairs).toBeGreaterThan(shipped.pairs)
    expect(loose.crossShow - shipped.crossShow, 'and adds no cross-franchise pair on this corpus').toBe(0)
  })

  it('reports the cross-show rate rather than asserting one', () => {
    expect(shipped.pairs).toBeGreaterThan(0)
  })
})
