/**
 * Whether the id off a Kitsu streaming link identifies ONE title, driven through the repo's own
 * `streamPointers` and `mintableAsFilmHandle` rather than a copy of them.
 *
 *   node scripts/measure-kitsu-stream-ids.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-kitsu-stream-ids.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no measurement.
 *
 * THE METRIC. A minted handle is `<origin>:<id>`, and `upsertMedia` links it, which is a union-find
 * union with NO inverse. So if two DIFFERENT kitsu records yield the same `<origin>:<id>`, their
 * clusters merge permanently for the session. That count is the whole measurement, and the target is
 * zero WITHOUT the handle count also going to zero, since refusing every link reaches zero for free.
 *
 * FOUR ARMS over the film records. `was` is the subtype carve-out that shipped on 2026-09-04: every
 * link a film carries is minted, and Crunchyroll points all of a show's films at one /series/ page.
 * `blanket` is the naive repair, refusing every link a film carries, and it is scored from the real
 * pointers rather than an empty function so the corpus can falsify its count. `denylist` is the first
 * repair tried, refusing the segments known to name a container, and it is kept because it is the one
 * an allowlist has to beat. `now` is the allowlist that shipped.
 *
 * TWO CONTROLS, BOTH OF WHICH MUST FAIL IF THE CORPUS GOES STALE. `blanket` is NOT one of them: it
 * mints nothing by construction, so `expect(blanket.handles).toBe(0)` is `expect(0).toBe(0)` and
 * cannot fail for any corpus, including an empty one. An earlier version of this file called it a
 * control and claimed it was what made `now`'s surviving handles a real difference. It is a price tag,
 * not a check.
 *
 * `was` must still weld: a rig that cannot express the failure reports success unconditionally, and if
 * that arm goes quiet the corpus has stopped reaching Crunchyroll's films.
 *
 * `series` must weld HARD, and it is the control this file was missing. The predicate is only half the
 * rule: the film gate in `streamHandles` is the other half. Applying the predicate to cour records is
 * what dropping that gate would do, and it must produce a pile of welds, because a Netflix /title/ id
 * on a cour record is the whole show's. If that arm ever goes quiet the corpus has stopped reaching
 * multi-cour Netflix shows and this file has stopped defending the gate.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { mintableAsFilmHandle, streamPointers } from '../src/sources/kitsu/stream-id'

type Record = {
  id: string
  title: string | null
  subtype: string | null
  startDate: string | null
  episodeCount: number | null
  streams: string[]
}

const POOL = new URL('../node_modules/.cache/kitsu-stream-pool.json', import.meta.url).pathname
const { records } = JSON.parse(readFileSync(POOL, 'utf8')) as { records: Record[] }

const movies = records.filter(record => record.subtype === 'movie')
const series = records.filter(record => record.subtype !== 'movie')

const pointersOf = (record: Record) => streamPointers(record.streams)

/** The segments the first repair refused, kept so the allowlist has to beat it rather than differ. */
const CONTAINER_SCOPES = new Set(['series', 'show', 'shows'])

/** `<origin>:<id>` -> the kitsu ids that minted it. More than one is a weld. */
const score = (over: Record[], mint: (record: Record) => { origin: string, id: string }[]) => {
  const held = new Map<string, Set<string>>()
  let handles = 0
  for (const record of over) {
    for (const { origin, id } of mint(record)) {
      handles++
      const key = `${origin}:${id}`
      if (!held.has(key)) held.set(key, new Set())
      held.get(key)!.add(record.id)
    }
  }
  return { handles, welds: [...held.entries()].filter(([, ids]) => ids.size > 1), ids: held.size }
}

const was = score(movies, pointersOf)
const blanket = score(movies, record => pointersOf(record).filter(() => false))
const denylist = score(movies, record => pointersOf(record).filter(({ scope }) => !CONTAINER_SCOPES.has(scope)))
const now = score(movies, record => pointersOf(record).filter(mintableAsFilmHandle))

// the gate, not the predicate: what the predicate would do to cour records if the film gate went away
const seriesArm = score(series, record => pointersOf(record).filter(mintableAsFilmHandle))

test('the corpus reaches films that carry a streaming link at all', () => {
  console.log(
    `\ncorpus: ${records.length} kitsu records, ${movies.length} films and ${series.length} not,` +
    ` ${records.filter(r => r.streams.length).length} carrying at least one streaming link`
  )
  const scopes = new Map<string, number>()
  for (const record of movies) {
    for (const { scope, origin } of pointersOf(record)) {
      const key = `${origin} /${scope}/`
      scopes.set(key, (scopes.get(key) ?? 0) + 1)
    }
  }
  console.log('every (origin, path segment) the FILM records contain:')
  for (const [key, count] of [...scopes].sort((a, b) => b[1] - a[1])) console.log(`  ${count.toString().padStart(5)}  ${key}`)

  expect(movies.filter(record => pointersOf(record).length).length, 'control: films with a readable link').toBeGreaterThan(20)
})

test('the shipped carve-out welds films together, and the allowlist does not', () => {
  const row = (name: string, arm: typeof was) =>
    `  ${name.padEnd(9)} ${arm.handles.toString().padStart(5)} handles  ${arm.welds.length.toString().padStart(3)} welded ids`
  console.log('\nfilm records only, one arm per predicate:')
  for (const [name, arm] of [['was', was], ['blanket', blanket], ['denylist', denylist], ['now', now]] as const) console.log(row(name, arm))
  console.log('\nwhat `was` welded:')
  for (const [key, ids] of was.welds) {
    const titles = [...ids].map(id => records.find(r => r.id === id)?.title ?? id)
    console.log(`  ${key} (${ids.size}) <- ${titles.slice(0, 4).join(' + ')}${ids.size > 4 ? ' + ...' : ''}`)
  }

  // the control: if this ever passes, the corpus has stopped reaching the providers that weld and
  // every other assertion in this file is vacuous
  expect(was.welds.length, 'control: the shipped carve-out must still be welding films').toBeGreaterThan(0)
  // `blanket` carries NO assertion on purpose. It mints nothing by construction, so every claim about
  // it is true for any corpus including an empty one, and an assertion that cannot fail reads as a
  // check while being none. It is here for the printed row, which prices the repair the allowlist beat.

  expect(now.welds.map(([key, ids]) => `${key} <- ${[...ids].join(' + ')}`)).toEqual([])
  expect(now.handles, 'the allowlist must not be a blanket refusal wearing a different name').toBeGreaterThan(0)
  expect(now.handles, 'and it must keep most of what the denylist kept').toBeGreaterThan(denylist.handles * 0.9)
})

// THE GATE, which is the half of the rule the predicate cannot carry. Both must be true at once for a
// link to be minted, and this arm is what happens if only the predicate survives.
test('the film gate is load bearing: the same predicate over cour records welds badly', () => {
  console.log(`\nthe predicate applied to the ${series.length} NON-film records, which the film gate never lets it see:`)
  console.log(`  ${seriesArm.handles} handles over ${seriesArm.ids} ids, ${seriesArm.welds.length} of them welded`)
  for (const [key, ids] of seriesArm.welds.slice(0, 6)) {
    const titles = [...ids].map(id => records.find(r => r.id === id)?.title ?? id)
    console.log(`  ${key} (${ids.size}) <- ${titles.slice(0, 4).join(' + ')}${ids.size > 4 ? ' + ...' : ''}`)
  }
  expect(seriesArm.welds.length, 'control: dropping the film gate must be visibly catastrophic').toBeGreaterThan(10)
})

// The rule that survives a url shape changing under us: a pair is safe exactly when no two records
// read the same id out of it.
test('no (origin, segment) pair the allowlist mints holds two different records', () => {
  const byPair = new Map<string, Map<string, Set<string>>>()
  for (const record of movies) {
    for (const pointer of pointersOf(record)) {
      const pair = `${pointer.origin} /${pointer.scope}/`
      if (!byPair.has(pair)) byPair.set(pair, new Map())
      const held = byPair.get(pair)!
      const key = `${pointer.origin}:${pointer.id}`
      if (!held.has(key)) held.set(key, new Set())
      held.get(key)!.add(record.id)
    }
  }
  const offenders: string[] = []
  console.log('\nper (origin, segment) pair, over films:')
  for (const [pair, held] of byPair) {
    const [origin, seg] = pair.split(' ')
    const welded = [...held.values()].filter(ids => ids.size > 1).length
    const minted = mintableAsFilmHandle({ origin: origin!, scope: seg!.replaceAll('/', ''), id: 'x', url: 'x' })
    console.log(`  ${pair.padEnd(14)}${held.size.toString().padStart(4)} ids  ${welded.toString().padStart(3)} welded  ${minted ? 'MINTED' : 'refused'}`)
    if (minted && welded) offenders.push(`${pair} is minted but welds ${welded} ids`)
  }
  expect(offenders).toEqual([])
})

// The cost, counted rather than asserted, because "films lose their Crunchyroll link" is the sentence
// the owner approved this change on and it deserves a number. A film that loses a link which was
// welding it to another film has lost nothing: that link was naming the wrong media.
test('the cost is counted, and most of what is dropped was welding something', () => {
  const withLinks = movies.filter(record => pointersOf(record).length)
  const kept = withLinks.filter(record => pointersOf(record).some(mintableAsFilmHandle))
  const lost = withLinks.filter(record => !kept.includes(record))

  const held = new Map<string, Set<string>>()
  for (const record of withLinks) {
    for (const { origin, id } of pointersOf(record)) {
      const key = `${origin}:${id}`
      if (!held.has(key)) held.set(key, new Set())
      held.get(key)!.add(record.id)
    }
  }
  const welded = new Set([...held.values()].filter(ids => ids.size > 1).flatMap(ids => [...ids]))
  const lostAndWelded = lost.filter(record => welded.has(record.id))

  console.log(
    `\nof ${movies.length} films, ${withLinks.length} carried a readable link and ${kept.length} still do.` +
    `\n${lost.length} lose their only link, and ${lostAndWelded.length} of those were welded to another film,` +
    `\nso the link they lose was naming a different media. ${welded.size} films were welded in total.`
  )

  expect(lost.length, 'control: something must actually be lost, or there is no cost to weigh').toBeGreaterThan(0)
  expect(lostAndWelded.length / lost.length, 'most of the loss must be links that were welding').toBeGreaterThan(0.5)
})
