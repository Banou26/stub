/**
 * Whether JustWatch's season NUMBER names the same run Netflix's does, which is the whole basis on
 * which `providerContentId` is allowed to scope a Netflix handle by it.
 *
 *   node scripts/measure-justwatch-nf-seasons.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-justwatch-nf-seasons.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * `--disableConsoleIntercept` is load bearing: vitest swallows console output without it, so the run
 * passes and prints nothing, which is a measurement rig reporting success while showing no measurement.
 *
 * THE QUESTION, and why it was asked. `providerContentId` mints `nf:<netflixTitleId>-<jwSeasonNumber>`
 * and unOGS mints `nf:<netflixTitleId>-<netflixSeasonNumber>`. Those name the same run only if the two
 * services agree about what a season is, and `justwatch/id.ts` records that they do not: Kengan Ashura
 * is 3 seasons on Netflix and 2 on JustWatch. The proposed repair was to refuse `nf` the way `cr` is
 * refused. This exists to price that before doing it.
 *
 * WHAT THE ANSWER WAS, 2026-09-04, over 31 shows carrying both season lists:
 *
 *   66 SAFE    the show's numbering matches Netflix exactly
 *    3 ORPHAN  the season number does not exist on Netflix, so the handle clusters with nothing
 *   13 RISKY   the number exists but the show's numbering disagrees, so it may name another run
 *
 * Refusing `nf` therefore costs 66 correct handles to remove 13 suspect ones, five good per bad, and
 * RISKY is a deliberately generous label: it flags every handle in a disagreeing show, including the
 * season 1s that are almost certainly right in both. So the change was NOT made, and this file is the
 * reason rather than a note claiming one.
 *
 * WHAT WOULD CHANGE THE ANSWER. JustWatch cannot check Netflix's numbering at runtime; it can only see
 * its own seasons. `ctx.resolveSeason` is the mechanism for exactly this ask, and only crunchyroll
 * implements `mediaSeason`. The day unOGS does, JustWatch can ask which Netflix season its run is and
 * stop guessing, and the 13 go to zero without costing the 66.
 */
import { existsSync, readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

type Show = {
  query: string
  jwTitle?: string | null
  netflixId?: string
  jwSeasons?: number[]
  netflixSeasons?: { season: number, episodes: number }[] | null
  skipped?: string
}

const POOL = new URL('../node_modules/.cache/justwatch-nf-season-pool.json', import.meta.url).pathname

if (!existsSync(POOL)) {
  throw new Error(`no corpus at ${POOL}. Run: node scripts/measure-justwatch-nf-seasons.mjs`)
}
const { shows, failed } = JSON.parse(readFileSync(POOL, 'utf8')) as { shows: Show[], failed: string[] }

const usable = shows.filter(show => show.netflixSeasons?.length && show.jwSeasons?.length)

const numbersOf = (show: Show) => ({
  jw: [...new Set(show.jwSeasons ?? [])].sort((a, b) => a - b),
  nf: [...new Set((show.netflixSeasons ?? []).map(season => season.season))].sort((a, b) => a - b),
})

test('the corpus reaches shows that carry BOTH season lists', () => {
  console.log(
    `\ncorpus: ${shows.length} shows, ${usable.length} with both season lists,` +
    ` ${failed.length} refused by an api and NOT in the sample`
  )
  expect(usable.length, 'control: shows with both lists').toBeGreaterThan(15)
  // a corpus that quietly holds only what a degraded api served is a biased sample wearing a full one
  expect(failed.length / Math.max(1, shows.length), 'too much of the sample is missing to score it').toBeLessThan(0.25)
})

test('the two services disagree often enough that the question was worth asking', () => {
  const disagreeing = usable.filter(show => {
    const { jw, nf } = numbersOf(show)
    return jw.join(',') !== nf.join(',')
  })
  console.log(`\n${usable.length - disagreeing.length} shows agree on the season numbering, ${disagreeing.length} do not:`)
  for (const show of disagreeing) {
    const { jw, nf } = numbersOf(show)
    console.log(`  ${(show.jwTitle ?? show.query).padEnd(36).slice(0, 36)} jw [${jw}]  netflix [${nf}]`)
  }

  // the control: if this ever goes quiet the corpus has stopped reaching multi-season shows and every
  // number below is meaningless
  expect(disagreeing.length, 'control: the disagreement this file exists to price must be present').toBeGreaterThan(0)
})

test('refusing nf would cost far more correct handles than suspect ones', () => {
  let safe = 0, orphan = 0, risky = 0
  for (const show of usable) {
    const { jw, nf } = numbersOf(show)
    const agrees = jw.join(',') === nf.join(',')
    for (const number of jw) {
      if (!nf.includes(number)) orphan++
      else if (agrees) safe++
      else risky++
    }
  }
  const total = safe + orphan + risky
  console.log(
    `\nthe ${total} nf handles JustWatch would mint over these shows:` +
    `\n  ${String(safe).padStart(3)} SAFE    the show's numbering matches Netflix exactly` +
    `\n  ${String(orphan).padStart(3)} ORPHAN  the number does not exist on Netflix, so it clusters with nothing` +
    `\n  ${String(risky).padStart(3)} RISKY   the number exists but the numbering disagrees` +
    `\n\nrefusing nf costs ${safe} correct to remove ${risky} suspect, ${(safe / Math.max(1, risky)).toFixed(1)} good per bad.`
  )

  expect(total, 'control: there must be handles to weigh').toBeGreaterThan(20)
  // The decision this file records. If the ratio ever falls below 1, refusing nf becomes the cheaper
  // option and this assertion is the thing that says so.
  expect(safe / Math.max(1, risky), 'refusing nf has become the cheaper option; revisit id.ts').toBeGreaterThan(1)
})
