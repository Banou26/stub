/**
 * What `pickContainingSeason` answers over the recorded unOGS season corpus, and what it gets wrong.
 *
 * The checker for `MAX_FOLDED_RUNS` in src/sources/similar.ts. Its doc comment carries the sweep this
 * prints; this is how to reproduce it, and how to see what a change to either counting axis costs.
 *
 *   node scripts/measure-unogs-season-match.mjs     # fetches the corpus once, then a no-op
 *   node scripts/measure-containing-share.mjs
 *
 * THE DEFECT IT LOOKS FOR is a CONTRADICTION: a season handed to one run as its container while it is
 * another run of the same show's OWN season (`pickSimilarSeason`). A season cannot both be a run and
 * hold a different one, so every line marked that way is a wrong answer, whatever the rule said. That
 * is the only ground truth available here, since the corpus records no mapping from a run to a
 * Netflix season; a count it reads as "ok" is unrefuted rather than verified.
 *
 * The corpus carries no title year, so the earliest run's stands in, which is what unOGS' title year
 * means (`netflixCandidates` hands it to the first season alone). It carries no episode titles at
 * all, so this measures the two COUNTING axes and never axis 1.
 */
const REPO = new URL('..', import.meta.url).pathname
const { createJiti } = await import(`${REPO}node_modules/jiti/lib/jiti.mjs`)
const jiti = createJiti(`${REPO}src/sources/probe.ts`)
const { pickContainingSeason, pickSimilarSeason } = await jiti.import(`${REPO}src/sources/similar.ts`)
const { readFileSync } = await import('node:fs')

const pool = JSON.parse(readFileSync(`${REPO}node_modules/.cache/unogs-season-pool.json`, 'utf8'))
const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) : undefined)

const rows = []
let runs = 0
for (const series of pool.series) {
  const titleYear = Math.min(...series.runs.map(run => yearOf(run.startDate) ?? 9999))
  const candidates = [...series.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber).map((season, index) => ({
    season: season.seasonNumber,
    seasonNumber: season.seasonNumber,
    episodeCount: season.episodeCount,
    year: index === 0 ? titleYear : undefined,
  }))
  const evidenceOf = (run) => ({ titles: [run.title, run.romaji], episodeCount: run.episodes, startDate: run.startDate })

  const own = new Map()
  for (const run of series.runs) {
    const verdict = pickSimilarSeason(evidenceOf(run), candidates)
    if (verdict) own.set(verdict.season, run.title)
  }
  for (const run of series.runs) {
    runs += 1
    const held = pickContainingSeason(evidenceOf(run), candidates)
    if (!held) continue
    rows.push({
      series: series.franchise,
      run: run.title,
      format: run.format,
      rule: held.rule,
      season: held.season,
      ours: held.ours,
      theirs: held.theirs,
      share: held.ours / held.theirs,
      contradicts: own.has(held.season) && own.get(held.season) !== run.title,
    })
  }
}

console.log(`${runs} runs over ${pool.series.length} series, ${rows.length} answered a container`)
for (const row of [...rows].sort((a, b) => a.share - b.share)) {
  console.log(`  ${row.share.toFixed(3)}  ${row.rule.padEnd(14)} ${row.ours} of ${row.theirs}  ${
    row.contradicts ? 'CONTRADICTS' : 'ok         '}  ${row.series} :: ${row.run} (${row.format})`)
}
const contradictions = rows.filter(row => row.contradicts)
console.log(`contradictions (a container that is another run's own season): ${contradictions.length}`)
