/**
 * What unOGS's season assignment costs, and what each candidate repair buys, driven through the repo's
 * own `parseSeasonNumber` and `pickSeasonByEpisodeCount` rather than a model of them.
 *
 *   node scripts/measure-unogs-season-match.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-unogs-season-match.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no
 * measurement.
 *
 * THE DEFECT. `resolveSeasonNumber` in src/sources/unogs/extractor.ts:233-238 decides which Netflix
 * season is ours from the EPISODE COUNT and nothing else, through a private copy of
 * `pickSeasonByEpisodeCount` (`findMatchingSeason`, :130-141). Both take the nearest season at ANY
 * distance and break a tie by taking the FIRST. tmdb:158-164 and tvmaze:145-148 both read
 * `parseSeasonNumber` off the title before falling back to the count, exactly as that function's own
 * doc says it must be used; unOGS is the only consumer that skips the title.
 *
 * WHAT A COLLISION MEANS, and why it is the metric. Two of OUR runs receiving the identical
 * `nf:<id>-<n>` hands two clusters the same handle, and `upsertMedia` unions them with no inverse. It
 * does not matter whether Netflix meant those two cours to be one season: the handle asserts our two
 * runs are one media, and that is wrong however Netflix models it. So a collision is always a wrong
 * weld, and the count of runs collapsed into another run is the benefit any repair has to earn.
 *
 * THE COST IS A REFUSAL: a run that gets no season gets no Netflix row, so unOGS simply does not
 * appear on that page. A nuisance against a permanent wrong cluster, but real, and reported beside it.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { parseSeasonNumber, pickSeasonByEpisodeCount } from '../src/sources/season'
import { TITLE_MATCH_THRESHOLD, titleSimilarity } from '../src/sources/utils'

type Season = { seasonNumber: number, episodeCount: number }
type Run = { id: number, title: string, romaji: string, episodes: number, format: string, startDate: string | null }
type Series = { franchise: string, netflixId: number, netflixTitle: string, seasons: Season[], runs: Run[] }

const POOL = new URL('../node_modules/.cache/unogs-season-pool.json', import.meta.url).pathname
const { series } = JSON.parse(readFileSync(POOL, 'utf8')) as { series: Series[] }

/** Every season tied for nearest, which is what the shipped argmin hides by keeping only the first. */
const nearestSeasons = (seasons: Season[], target: number): Season[] => {
  let best = Infinity
  for (const season of seasons) best = Math.min(best, Math.abs(season.episodeCount - target))
  return seasons.filter(season => Math.abs(season.episodeCount - target) === best)
}

const bestDiff = (seasons: Season[], target: number) =>
  Math.min(...seasons.map(season => Math.abs(season.episodeCount - target)))

/**
 * The four arms. Each takes one of OUR runs and answers with a Netflix season number or nothing.
 *
 * `shipped` calls the repo's exported `pickSeasonByEpisodeCount`, which is byte-equivalent to unOGS's
 * private `findMatchingSeason`, so the baseline is the real function rather than a reproduction.
 */
const ARMS: Record<string, (seasons: Season[], run: Run) => number | undefined> = {
  // The function as it stood before 2026-09-01, kept verbatim so the baseline row does not move when
  // the real one is repaired. Reproducing it here rather than importing it is deliberate: an arm that
  // called the live function would silently become a copy of `current` and the table would report a
  // 78% improvement over itself.
  'was-nearest-first': (seasons, run) => {
    if (seasons.length <= 1) return undefined
    let best: { seasonNumber: number, diff: number } | undefined
    for (const season of seasons) {
      const diff = Math.abs(season.episodeCount - run.episodes)
      if (!best || diff < best.diff) best = { seasonNumber: season.seasonNumber, diff }
    }
    return best?.seasonNumber
  },

  // what unOGS ships TODAY: the cluster's title first, then the repaired shared fallback
  current: (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    return pickSeasonByEpisodeCount(seasons, run.episodes)
  },

  // refuse when the count cannot choose, which is the minimum honest answer
  'refuse-tie': (seasons, run) => {
    if (seasons.length <= 1) return undefined
    const tied = nearestSeasons(seasons, run.episodes)
    return tied.length === 1 ? tied[0]!.seasonNumber : undefined
  },

  // what tmdb and tvmaze already do: read the ordinal off our own title first, count second
  'title-then-tie': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    if (seasons.length <= 1) return undefined
    const tied = nearestSeasons(seasons, run.episodes)
    return tied.length === 1 ? tied[0]!.seasonNumber : undefined
  },

  // and refuse a match that is merely nearest rather than close. Netflix splits Fullmetal Alchemist's
  // one 64 episode run into five seasons of about 13, so "nearest" answers 13 for a target of 64.
  'title-tie-tolerance': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    if (seasons.length <= 1) return undefined
    const tied = nearestSeasons(seasons, run.episodes)
    if (tied.length !== 1) return undefined
    const diff = bestDiff(seasons, run.episodes)
    return diff <= Math.max(2, run.episodes * 0.25) ? tied[0]!.seasonNumber : undefined
  },
}

/**
 * The AniList title search that built this corpus returns the whole franchise AND its neighbours:
 * "Ponkotsuland Saga" for Vinland Saga, "Onigiri" for Demon Slayer, Naruto against Boruto. In
 * production none of those would be asking unOGS about the same Netflix id, because
 * `pickTitleMatch` (src/sources/utils.ts:295-315) gates every hit at TITLE_MATCH_THRESHOLD first.
 *
 * So the SAME gate is applied here before anything is counted. Without it the weld rate is a ceiling
 * inflated by shows that would never have met each other, which is the over-counting this repo has
 * been caught by before (see the synonym note in worker/store/merge-fixtures.ts).
 */
const gateRuns = async (entry: Series): Promise<Run[]> => {
  const kept: Run[] = []
  for (const run of entry.runs) {
    const score = Math.max(
      await titleSimilarity(entry.netflixTitle, run.title),
      await titleSimilarity(entry.netflixTitle, run.romaji),
    )
    if (score >= TITLE_MATCH_THRESHOLD) kept.push(run)
  }
  return kept
}

test('unOGS season assignment: collisions and refusals per arm', async () => {
  expect(series.length).toBeGreaterThan(4)

  const gated = new Map<string, Run[]>()
  let dropped = 0
  for (const entry of series) {
    const kept = await gateRuns(entry)
    dropped += entry.runs.length - kept.length
    gated.set(entry.franchise, kept)
  }
  for (const entry of series) entry.runs = gated.get(entry.franchise)!
  console.log(`\ngate    ${dropped} runs dropped by the source's own title gate at ${TITLE_MATCH_THRESHOLD}, as production would`)

  console.log(`\ncorpus  ${series.length} multi-season Netflix series, ${series.reduce((n, s) => n + s.runs.length, 0)} anime runs`)

  const rows: string[] = []
  for (const [name, arm] of Object.entries(ARMS)) {
    let assigned = 0
    let refused = 0
    let collapsed = 0          // runs that landed on a season another run already holds
    let seriesWithAWeld = 0
    const examples: string[] = []

    for (const entry of series) {
      const holders = new Map<number, Run[]>()
      for (const run of entry.runs) {
        const season = arm(entry.seasons, run)
        if (season == null) { refused++; continue }
        assigned++
        const held = holders.get(season)
        if (held) held.push(run)
        else holders.set(season, [run])
      }
      let weldedHere = 0
      for (const [season, held] of holders) {
        if (held.length < 2) continue
        weldedHere += held.length - 1
        if (examples.length < 6) {
          examples.push(`${entry.franchise} nf:${entry.netflixId}-${season} <- ${held.map(r => `${r.title.slice(0, 26)} (${r.episodes}ep)`).join('  +  ')}`)
        }
      }
      if (weldedHere) { seriesWithAWeld++; collapsed += weldedHere }
    }

    rows.push(`  ${name.padEnd(21)} welded ${String(collapsed).padStart(3)} runs across ${String(seriesWithAWeld).padStart(2)} series   assigned ${String(assigned).padStart(3)}   refused ${String(refused).padStart(3)}`)
    if (name === 'was-nearest-first' || name === 'current') {
      rows.push(...examples.map(example => `      ${example}`))
    }
  }

  console.log('\nARMS   a "weld" is one of our runs collapsed onto a season another run already holds')
  for (const row of rows) console.log(row)

  // how much of the repair the TITLE axis is carrying, since it is the half that costs nothing
  let named = 0
  let namedAndPresent = 0
  let total = 0
  for (const entry of series) {
    for (const run of entry.runs) {
      total++
      const ordinal = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
      if (ordinal == null) continue
      named++
      if (entry.seasons.some(season => season.seasonNumber === ordinal)) namedAndPresent++
    }
  }
  console.log(`\nTITLE  ${named} of ${total} runs name an ordinal, ${namedAndPresent} of those name one Netflix also has`)

  const ties = series.flatMap(entry => entry.runs.map(run => nearestSeasons(entry.seasons, run.episodes).length)).filter(n => n > 1)
  console.log(`TIES   ${ties.length} of ${total} runs hit a tie on episode count alone`)

  // The tolerance picked on evidence rather than taste. `floor` is an absolute allowance so a short
  // season is not held to a fraction of nothing; `share` is the proportional one that has to carry a
  // 24 episode run. Read the pair that stops buying welds per refusal.
  console.log('\nTOLERANCE SWEEP   floor  share   welds  assigned  refused')
  for (const floor of [0, 1, 2, 3]) {
    for (const share of [0, 0.1, 0.25, 0.5, 1]) {
      let welds = 0
      let assigned = 0
      let refused = 0
      for (const entry of series) {
        const holders = new Map<number, number>()
        for (const run of entry.runs) {
          const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
          let season: number | undefined
          if (named != null && entry.seasons.some(s => s.seasonNumber === named)) season = named
          else if (entry.seasons.length > 1) {
            const tied = nearestSeasons(entry.seasons, run.episodes)
            if (tied.length === 1 && bestDiff(entry.seasons, run.episodes) <= Math.max(floor, run.episodes * share)) {
              season = tied[0]!.seasonNumber
            }
          }
          if (season == null) { refused++; continue }
          assigned++
          const held = (holders.get(season) ?? 0) + 1
          holders.set(season, held)
          if (held > 1) welds++
        }
      }
      console.log(`                  ${String(floor).padStart(5)}  ${String(share).padStart(5)}   ${String(welds).padStart(5)}  ${String(assigned).padStart(8)}  ${String(refused).padStart(7)}`)
    }
  }
})
