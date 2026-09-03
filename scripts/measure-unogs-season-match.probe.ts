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
 * WHAT A REFUSAL COSTS, and this file said the wrong thing about it until 2026-09-01. It claimed "a
 * run that gets no season gets no Netflix row, so unOGS simply does not appear on that page". That is
 * FALSE, and it is false in the direction that flatters the fix this rig was built to justify.
 *
 * Read the call site. `searchAndLinkMedia` (unogs/extractor.ts:292-296) passes the refusal straight
 * into `getMedia(nfId, ctx, undefined)`, which skips the season suffix at :200-203, so `media.uri`
 * stays the BARE `nf:<showId>`; :208 then stops filtering and attaches every season's episodes; and
 * :295 attaches the cluster's handles regardless. So a refusal does not remove the row, it mints a
 * SHOW-LEVEL id and links it, and two runs that both refuse are welded exactly as two runs that both
 * picked the same season are.
 *
 * That makes a refusal a weld rather than a nuisance, so both arms are scored on it below. It also
 * inverts the reading of the original table: tightening the matcher converts wrong assignments into
 * show-level welds, and is an improvement only if the bare-id welds it creates are fewer than the
 * season collisions it removes.
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
/**
 * What an arm answers, and the third case is the point:
 *   a number  -> mints `nf:<show>-<n>`, a season-scoped uri
 *   BARE      -> mints `nf:<show>`, the SHOW-level uri, which is what a refusal does TODAY
 *   NONE      -> mints nothing at all, which is what the function's own doc says a refusal means
 */
const BARE = 'BARE'
const NONE = 'NONE'
type Answer = number | typeof BARE | typeof NONE

const ARMS: Record<string, (seasons: Season[], run: Run) => Answer> = {
  // The function as it stood before 2026-09-01, kept verbatim so the baseline row does not move when
  // the real one is repaired. Reproducing it here rather than importing it is deliberate: an arm that
  // called the live function would silently become a copy of `current` and the table would report a
  // 78% improvement over itself.
  'was-nearest-first': (seasons, run) => {
    if (seasons.length <= 1) return BARE
    let best: { seasonNumber: number, diff: number } | undefined
    for (const season of seasons) {
      const diff = Math.abs(season.episodeCount - run.episodes)
      if (!best || diff < best.diff) best = { seasonNumber: season.seasonNumber, diff }
    }
    return best?.seasonNumber ?? BARE
  },

  // what unOGS ships TODAY: the cluster's title first, then the repaired shared fallback
  current: (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    return pickSeasonByEpisodeCount(seasons, run.episodes) ?? BARE
  },

  // refuse when the count cannot choose, which is the minimum honest answer
  'refuse-tie': (seasons, run) => {
    if (seasons.length <= 1) return BARE
    const tied = nearestSeasons(seasons, run.episodes)
    return tied.length === 1 ? tied[0]!.seasonNumber : BARE
  },

  // what tmdb and tvmaze already do: read the ordinal off our own title first, count second
  'title-then-tie': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    if (seasons.length <= 1) return BARE
    const tied = nearestSeasons(seasons, run.episodes)
    return tied.length === 1 ? tied[0]!.seasonNumber : BARE
  },

  // and refuse a match that is merely nearest rather than close. Netflix splits Fullmetal Alchemist's
  // one 64 episode run into five seasons of about 13, so "nearest" answers 13 for a target of 64.
  'title-tie-tolerance': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    if (seasons.length <= 1) return BARE
    const tied = nearestSeasons(seasons, run.episodes)
    if (tied.length !== 1) return BARE
    const diff = bestDiff(seasons, run.episodes)
    return diff <= Math.max(2, run.episodes * 0.25) ? tied[0]!.seasonNumber : BARE
  },

  // CANDIDATE. Exactly today's matcher, but a refusal mints NOTHING instead of the show-level id.
  // This is the behaviour resolveSeasonNumber's own doc already claims to have.
  'refuse-properly': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    return pickSeasonByEpisodeCount(seasons, run.episodes) ?? NONE
  },

  // CANDIDATE, 2026-09-04. The ordinal and the count must AGREE rather than either-or. Today the
  // title's ordinal wins outright the moment Netflix has a season with that number, and nothing checks
  // the length: `Part 2` and `Season 2` both parse to 2, so two different runs of one show can both
  // take Netflix season 2 and weld.
  'ordinal-and-count': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    const byCount = seasons.length === 1
      ? (seasons[0]!.episodeCount === run.episodes ? seasons[0]!.seasonNumber : undefined)
      : pickSeasonByEpisodeCount(seasons, run.episodes)
    if (named != null && seasons.some(season => season.seasonNumber === named)) {
      return byCount === named ? named : NONE
    }
    return byCount ?? NONE
  },

  // CANDIDATE, 2026-09-04, the softer half of the same idea: the ordinal stands unless the count
  // actively CONTRADICTS it. Netflix genuinely disagrees with anime about what a season is, splitting
  // one 64 episode run into five and folding five runs into three, so demanding the count confirm every
  // ordinal may refuse matches that were right.
  'ordinal-unless-contradicted': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    const byCount = seasons.length === 1
      ? (seasons[0]!.episodeCount === run.episodes ? seasons[0]!.seasonNumber : undefined)
      : pickSeasonByEpisodeCount(seasons, run.episodes)
    if (named != null && seasons.some(season => season.seasonNumber === named)) {
      return byCount == null || byCount === named ? named : NONE
    }
    return byCount ?? NONE
  },

  // CANDIDATE. The same, plus the lone-season case: pickSeasonByEpisodeCount refuses whenever Netflix
  // lists ONE season, which is most ordinary anime, so a naive refusal would drop nearly every
  // single-cour show. Accept that one season when its episode count is exactly ours, which keeps the
  // ordinary case and still declines a Netflix title that has folded several of our runs into one.
  'refuse-properly-lone': (seasons, run) => {
    const named = parseSeasonNumber(run.title) ?? parseSeasonNumber(run.romaji)
    if (named != null && seasons.some(season => season.seasonNumber === named)) return named
    if (seasons.length === 1) {
      return seasons[0]!.episodeCount === run.episodes ? seasons[0]!.seasonNumber : NONE
    }
    return pickSeasonByEpisodeCount(seasons, run.episodes) ?? NONE
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
    let collapsed = 0          // runs that landed on a uri another run already holds
    let bareWelds = 0          // of those, the ones welded by a REFUSAL rather than a season collision
    let absent = 0             // runs for which the source mints no media at all: the honest refusal
    let seriesWithAWeld = 0
    const examples: string[] = []

    for (const entry of series) {
      // keyed by the URI the source actually mints: '<n>' for a resolved season, BARE for a refusal,
      // because a refusal mints nf:<showId> and links it just the same
      const holders = new Map<string, Run[]>()
      for (const run of entry.runs) {
        const answer = arm(entry.seasons, run)
        if (answer === NONE) { absent++; continue }   // no media minted, so nothing to weld
        if (answer === BARE) refused++
        else assigned++
        const key = String(answer)
        const held = holders.get(key)
        if (held) held.push(run)
        else holders.set(key, [run])
      }
      let weldedHere = 0
      for (const [key, held] of holders) {
        if (held.length < 2) continue
        weldedHere += held.length - 1
        if (key === 'BARE') bareWelds += held.length - 1
        if (examples.length < 6) {
          const uri = key === 'BARE' ? `nf:${entry.netflixId} (SHOW LEVEL)` : `nf:${entry.netflixId}-${key}`
          examples.push(`${entry.franchise} ${uri} <- ${held.map(r => `${r.title.slice(0, 26)} (${r.episodes}ep)`).join('  +  ')}`)
        }
      }
      if (weldedHere) { seriesWithAWeld++; collapsed += weldedHere }
    }

    rows.push(`  ${name.padEnd(21)} welded ${String(collapsed).padStart(3)} (${String(bareWelds).padStart(3)} by show-level refusal)   season-scoped ${String(assigned).padStart(3)}   show-level ${String(refused).padStart(3)}   no media ${String(absent).padStart(3)}`)
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
