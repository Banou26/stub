/**
 * A CONTAINER SEASON PLACED ON TWO RUNS, end to end through the graph (4.4, 8.1, 5.4 P4 rule 3).
 *
 * WHAT THIS FILE IS FOR. Netflix folds Mushoku Tensei's first two cours into ONE season of 24, so
 * neither cour can ever BE it: `foldVetoed` refuses a season longer than the run, correctly, and the
 * only thing the source may say is `containing`. Everything after that answer is this plugin's: the
 * season arrives as a `PART_OF {provenance: 'ask'}`, `plugin:range` scans it as a class 1 candidate,
 * and its 24 rows have to reach OUR eleven and OUR twelve, on the right episodes, or reach nothing.
 * On 2026-09-13 both cours showed 0 of 11 and 0 of 12 Netflix sources on the page while season 3
 * showed 12 of 14, and this is the shape that closes the gap.
 *
 * WHY IT IS A FILE OF ITS OWN rather than a case in `range.test.ts`: that suite ingests every
 * walkthrough into ONE graph, and this case needs the same two cours with a Netflix container in
 * place of the Crunchyroll one. A second season hung off 8.1's rows would change what 8.1 measures.
 *
 * THE DATA IS THE PAGE'S OWN, both sides, which is the whole point: Netflix's `contextualSynopsis`
 * for season `81392609` against ani.zip's `overview` for the two runs, recorded 2026-09-13. No title
 * on either side can anchor anything here (Netflix titles all 24 rows `Episode N`, which
 * `isGenericEpisodeTitle` drops), so what places every pair below is rule 3's synopsis anchor and the
 * order its brackets count in.
 *
 * Every case names the mutation that reddens it. A rule that reaches the graph under one column name
 * and is read under another mints nothing and looks exactly like a rule that found nothing, so the
 * cases assert the column, the pairs and the page, not one of the three.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { enableGraph } from '../../../../../src/worker/graph'
import { closeGraph } from '../../../../../src/worker/graph/engine'
import { ingestAnswers, writeAskClaim } from '../../../../../src/worker/graph/ingest'
import { graphReady } from '../../../../../src/worker/graph/schema'
import { resetPassState, runPlugins } from '../../../../../src/worker/graph/plugins/runner'
import { profilePlugin } from '../../../../../src/worker/graph/plugins/profile'
import { directPlugin } from '../../../../../src/worker/graph/plugins/direct'
import { aggregatePlugin } from '../../../../../src/worker/graph/plugins/aggregate'
import { containmentPlugin } from '../../../../../src/worker/graph/plugins/containment'
import { rangePlugin } from '../../../../../src/worker/graph/plugins/range'
import { checkInvariants } from '../../../../../src/worker/graph/plugins/invariants'
import { answer, episode, media, rowsOf, title } from './fixtures'
import { MUSHOKU_SYNOPSES } from './synopses'

const MS_PER_DAY = 86_400_000

/** `count` weekly days from `from`, as `YYYY-MM-DD`. */
const weekly = (from: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(from) + index * 7 * MS_PER_DAY).toISOString().slice(0, 10))

/** The two cours and the Netflix season that holds both, at the record's own ids (8.1). */
const COUR_1 = 'anilist:108465'
const COUR_2 = 'anilist:127720'
const REF_1 = 'anizip:14758'
const REF_2 = 'anizip:14759'
const SHOW = 'nf:80987039'
const SEASON = 'nf:80987039-1'

/**
 * OUR side, which is ani.zip's `overview` per episode, verified against the live api on 2026-09-13.
 *
 * `MUSHOKU_SYNOPSES.s1.ours` is TMDB's list for the same season, and ani.zip republishes TMDB's text:
 * all eleven rows of cour 1 and eleven of cour 2 are BYTE-IDENTICAL to it once reduced, measured that
 * day against `api.ani.zip/mappings?anilist_id=108465` and `?anilist_id=127720`. So the fixture is
 * reused rather than recorded twice, and the one row where the two sources differ is spelled out
 * below because it is a defect rather than a wording difference.
 */
const OURS_1 = MUSHOKU_SYNOPSES.s1.ours.slice(0, 11)

/**
 * Cour 2, with ani.zip's own row 12: THE SAME TEXT AS ITS ROW 1, which is not a transcription slip.
 *
 * ani.zip publishes episode 12 of cour 2 carrying episode 1's fields: `range.test.ts`'s gap closure
 * case records the AIR DATE half of it (`airDate 2021-10-04` on both rows), and the overview is
 * duplicated the same way, measured 2026-09-13. TMDB's own row 23 is a different text, so taking the
 * TMDB list here would quietly repair the page's input and measure a run nobody has.
 */
const OURS_2 = [...MUSHOKU_SYNOPSES.s1.ours.slice(11, 22), MUSHOKU_SYNOPSES.s1.ours[11]!]

/** THEIRS: Netflix season `81392609`, 24 rows, every one titled `Episode N` and every one described. */
const THEIRS = MUSHOKU_SYNOPSES.s1.theirs

const C1_DAYS = weekly('2021-01-10', 11)
const C2_DAYS = weekly('2021-10-03', 12)

/** One synopsis as a source publishes it: `desc` writes the same text to BOTH fields (`utils.ts:153`). */
const desc = (text: string) => ({
  descriptions: [{ language: 'en', description: text, score: 0.5 }],
  shortDescriptions: [{ language: 'en', shortDescription: text, score: 0.5 }],
})

const answers = async () => [
  await answer('media', media(COUR_1, {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: C1_DAYS[0],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    handles: [{ relation: 'SAME_AS', node: media(REF_1, {}) }],
  })),
  await answer('media', media(REF_1, {
    type: 'TV', episodeCount: 11, titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    episodes: OURS_1.map((text, index) => episode(`${REF_1}-${index + 1}`, REF_1, {
      episodeNumber: index + 1, releaseDate: `${C1_DAYS[index]}T15:00:00.000Z`,
      titles: [title('en', `Cour One ${index + 1}`)], ...desc(text),
    })),
  })),
  await answer('media', media(COUR_2, {
    score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 12, startDate: C2_DAYS[0],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation Part 2')],
    handles: [{ relation: 'SAME_AS', node: media(REF_2, {}) }],
  })),
  await answer('media', media(REF_2, {
    type: 'TV', episodeCount: 12, titles: [title('en', 'Mushoku Tensei Jobless Reincarnation Part 2')],
    episodes: OURS_2.map((text, index) => episode(`${REF_2}-${index + 1}`, REF_2, {
      episodeNumber: index + 1, releaseDate: `${C2_DAYS[index]}T15:00:00.000Z`,
      titles: [title('en', `Cour Two ${index + 1}`)], ...desc(text),
    })),
  })),
  // Netflix's own rows: the title, and the one season that holds both cours. No date at any level,
  // which is the whole reason rule 1 cannot speak here (8.1's table)
  await answer('media', media(SHOW, {
    scope: 'CONTAINER', titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    handles: [{ relation: 'INCLUDES', node: media(SEASON, {}) }],
  })),
  await answer('media', media(SEASON, {
    type: 'TV', episodeCount: 24, titles: [title('en', 'Season 1')],
    episodes: THEIRS.map((text, index) => episode(`nf:8098-${index + 1}`, SEASON, {
      episodeNumber: index + 1, titles: [title('en', `Episode ${index + 1}`)], ...desc(text),
    })),
  })),
]

const runPass = async () => {
  resetPassState()
  const report = await runPlugins([profilePlugin, directPlugin, aggregatePlugin, containmentPlugin, rangePlugin], { reason: 'manual' })
  expect(report.audit.ok, report.audit.differences.join('; ')).toBe(true)
  expect(report.runs.filter(run => run.failed).map(run => `${run.id}: ${run.failed}`)).toEqual([])
  expect(report.anomalies.map(anomaly => anomaly.rule).filter(rule => rule === 'fixed-point-cap')).toEqual([])
  return report
}

/** Every pair out of the Netflix season onto one reference uri space, in their own order. */
const pairsOnto = async (prefix: string) => (await rowsOf(
  `MATCH (a:Episode)-[l:EPISODE_LINK]->(b:Episode)
   WHERE a.uri STARTS WITH 'nf:8098-' AND b.uri STARTS WITH $prefix AND l.by = 'plugin:range'
     AND l.status = 'active'
   RETURN l.fromNumber AS fromNumber, l.toNumber AS toNumber, l.reason AS reason, l.evidence AS evidence
   ORDER BY l.fromNumber`,
  { prefix }
)).map(row => ({
  from: Number(row.fromNumber),
  to: Number(row.toNumber),
  reason: String(row.reason),
  evidence: JSON.parse(String(row.evidence ?? '{}')) as Record<string, unknown>,
}))

/** The `INCLUDES` rows the plugin wrote, which is the range of 3.4 as literal properties. */
const ranges = async () => (await rowsOf(
  `MATCH (a:Media)-[l:LINK]->(b:Media)
   WHERE l.by = 'plugin:range' AND l.kind = 'INCLUDES'
   RETURN a.uri AS fromUri, b.uri AS toUri, l.status AS status, l.reason AS reason,
     l.fromStart AS fromStart, l.fromEnd AS fromEnd, l.toStart AS toStart, l.toEnd AS toEnd,
     l.contiguous AS contiguous, l.aligned AS aligned, l.total AS total
   ORDER BY toUri`
)).map(row => ({
  fromUri: String(row.fromUri),
  toUri: String(row.toUri),
  status: String(row.status),
  reason: String(row.reason),
  fromStart: Number(row.fromStart),
  fromEnd: Number(row.fromEnd),
  toStart: Number(row.toStart),
  toEnd: Number(row.toEnd),
  contiguous: row.contiguous === true,
  aligned: Number(row.aligned),
  total: Number(row.total),
}))

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers(await answers())
  // the `containing` answer of 4.4, as the consumer writes it: one claim per run, from the run's key
  // member to the ONE season that holds it, stamped `ask` and claiming no sameness
  for (const run of [COUR_1, COUR_2]) {
    await writeAskClaim({
      fromUri: run,
      toUri: SEASON,
      kind: 'PART_OF',
      claimer: 'nf',
      targetScope: null,
      node: { uri: SEASON, origin: 'nf', id: '80987039-1', scope: null, titles: [{ title: 'Season 1' }] },
    })
  }
  await runPass()
}, 300_000)

afterAll(async () => {
  await closeGraph()
})

// THE COLUMN, FIRST, because everything below is a statement about what the rule did with it and a
// silent no-op here looks identical to a rule that found nothing. `plugin:profile` reduces the
// synopsis a source published into `EpisodeProfile.synopsisKeys`, and `plugin:range`'s two scans read
// THAT column by name on both sides: the season's rows through `SEASON_SCAN` and the run's own
// through `OURS_SCAN`.
// Mutation: `synopsisKeys: []` in `episodeProfileRow` and all five cases in this file redden at
// once. Mutation for the half this case exists to separate: select `pse.titleKeys AS synopsis` in
// `SEASON_SCAN` and the four cases below redden while THIS one stays green, which is what a column
// that arrives and is read under another name looks like (both executed 2026-09-13).
test('the synopsis a source published reaches the profile column both sides read', async () => {
  const rows = await rowsOf(
    `MATCH (p:EpisodeProfile)
     WHERE p.uri STARTS WITH 'nf:8098-' OR p.uri STARTS WITH 'anizip:1475'
     RETURN p.uri AS uri, p.synopsisKeys AS synopsisKeys, p.titleKeys AS titleKeys`
  )
  expect(rows).toHaveLength(24 + 11 + 12)
  const keysOf = (value: unknown): string[] =>
    (JSON.parse(String(value ?? '[]')) as { key: string }[]).map(entry => entry.key)
  expect(rows.every(row => keysOf(row.synopsisKeys).length === 1), 'one key per row, both sides').toBe(true)

  // and NO title anchors anything here: Netflix's 24 are `Episode N`, which `isGenericEpisodeTitle`
  // drops, so the column the title rules read is empty on their side
  const netflix = rows.filter(row => String(row.uri).startsWith('nf:'))
  expect(netflix.every(row => keysOf(row.titleKeys).length === 0), 'their titles carry no identity').toBe(true)
  expect(keysOf(netflix[0]!.synopsisKeys)[0]).toBe(
    'awakes child discovers fades reborn sorcery sword truck unconsciousness world')
})

// THE SLICE ITSELF: one container season, two runs, two ranges, and the right Netflix episodes on
// each. Cour 1 takes Netflix 3 to 10 at offset 0 and cour 2 takes Netflix 14 to 22 at offset -11,
// which is Netflix 12 onto our 1: the second cour starts where the first one ends, and the only
// things that say so are four and five synopsis anchors and the order their brackets count in.
//
// EVERY PAIR IS CORRECT AND NONE CROSSES THE FOLD. Netflix's rows 12 to 24 are cour 2's and its 1 to
// 11 are cour 1's, so a rule that read the season as one list would put cour 2's content on cour 1's
// page with playable urls (the positional loan of 4.4, verbatim).
// Mutation: drop `synopsisAnchors` from `alignByTitle`'s union and all seventeen pairs disappear and
// both ranges become refusals, which is the page as it stands today; remove `'containing'` from
// `SEASON_SCAN`'s reason list and the season is never a candidate at all.
//
// AND ONE THAT DOES NOT REDDEN THE PAIRS, said here because a mutation nobody ran is a guess:
// replacing `offsetConsensus` with "take every proposal" leaves all seventeen exactly where they are
// and changes only the EVIDENCE, cour 2's rows then claiming `consensus: 0` for a shift of -11. On
// THIS pairing the outliers it would admit cross the true anchors, so `longestMonotone` drops them
// anyway; the gate is measured where it is load bearing in `range.test.ts`'s three-season case, and
// it does refuse rather than mint here (see the duplicated-row case at the bottom of this file).
// Dropping the `inWindow` filter in `decideCandidate` reddens nothing either: every row order placed
// is between two anchors, and both anchors are already inside `1..runLength`. Executed 2026-09-13.
test('one Netflix season of 24 lands on both cours, at the right episodes', async () => {
  const cour1 = await pairsOnto(REF_1)
  const cour2 = await pairsOnto(REF_2)

  expect(cour1.map(pair => [pair.from, pair.to])).toEqual([
    [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10],
  ])
  expect(cour2.map(pair => [pair.from, pair.to])).toEqual([
    [14, 3], [15, 4], [16, 5], [17, 6], [18, 7], [19, 8], [20, 9], [21, 10], [22, 11],
  ])
  // the fold, stated as the property rather than as the two lists: nothing Netflix numbers 12 or
  // above reaches cour 1, and nothing it numbers 11 or below reaches cour 2
  expect(cour1.every(pair => pair.from <= 11), 'cour 2\'s rows stay off cour 1').toBe(true)
  expect(cour2.every(pair => pair.from >= 12), 'cour 1\'s rows stay off cour 2').toBe(true)

  // every row is `sequence`, and the anchors carry rule 3's synopsis evidence rather than a title:
  // the score it reached and the offset it had to agree with (3.2)
  expect([...cour1, ...cour2].every(pair => pair.reason === 'sequence')).toBe(true)
  expect(cour1[0]!.evidence).toEqual({ synopsisScore: 0.267, consensus: 0 })
  expect(cour2[0]!.evidence).toEqual({ synopsisScore: 0.313, consensus: -11 })
  // and the rows between two anchors name the two anchors that forced them, never a score
  expect(cour1[1]!.evidence).toEqual({ between: ['nf:8098-3', 'nf:8098-7'] })
})

// THE RANGE OF 3.4, one per cour, off ONE season row: this is 8.1's shape with Netflix in
// Crunchyroll's place, and the `INCLUDES` is what labels the container on each run's page.
// Mutation: `fromEnd: total` in `hullOf` and cour 1 reads `fromStart 3, fromEnd 24`, labelling an
// eleven episode run with the whole season's span; remove `'containing'` from `SEASON_SCAN`'s reason
// list and both rows are gone with every pair (both executed 2026-09-13).
test('the season carries two INCLUDES rows, one per cour, with the pairs as their hull', async () => {
  expect(await ranges()).toEqual([
    {
      fromUri: SEASON, toUri: COUR_1, status: 'active', reason: 'sequence',
      fromStart: 3, fromEnd: 10, toStart: 3, toEnd: 10, contiguous: true, aligned: 8, total: 24,
    },
    {
      fromUri: SEASON, toUri: COUR_2, status: 'active', reason: 'sequence',
      fromStart: 14, fromEnd: 22, toStart: 3, toEnd: 11, contiguous: true, aligned: 9, total: 24,
    },
  ])
  // the claim under it is untouched, and it never became a sameness: a season that HOLDS two runs is
  // neither of them (7.4)
  const claimed = await rowsOf(
    `MATCH (a:Media)-[l:LINK]->(b:Media {uri: $season})
     WHERE l.by = 'plugin:direct'
     RETURN a.uri AS fromUri, l.kind AS kind, l.status AS status, l.reason AS reason ORDER BY fromUri`,
    { season: SEASON }
  )
  expect(claimed).toEqual([
    { fromUri: COUR_1, kind: 'PART_OF', status: 'active', reason: 'containing' },
    { fromUri: COUR_2, kind: 'PART_OF', status: 'active', reason: 'containing' },
  ])
  expect((await checkInvariants((await graphReady()).query)).counts).toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })
})

// WHAT THE USER SEES, which is the only reason any of the above is worth anything: a Netflix play
// button on eight rows of cour 1 and nine of cour 2, each at the number the PAIR named and marked
// `aligned` in the trace (5.4 P5). A season row is in no run cluster, so its episodes reach a page
// through nothing else.
// Mutation: take an empty list in place of `alignedFillsOf`'s answer in `plugin:aggregate` and both
// pages lose every Netflix button while the seventeen pairs still sit in the graph proving nothing,
// which is the store this step replaced (executed 2026-09-13). Nothing else in this file reddens with
// it, which is the point of asserting the page separately from the pairs.
test('the paired Netflix rows fill both cours, at the number the pair named', async () => {
  const fills = async (run: string) => (await rowsOf(
    `MATCH (m:Media {uri: $run})-[:MEMBER_OF]->(c:Cluster)<-[:SLOT_OF]-(s:Slot)<-[f:FILLS]-(e:Episode)
     WHERE e.uri STARTS WITH 'nf:8098-'
     RETURN e.uri AS uri, f.number AS number, f.via AS via ORDER BY f.number`,
    { run }
  )).map(row => [String(row.uri), Number(row.number), String(row.via)])

  expect(await fills(COUR_1)).toEqual([
    ['nf:8098-3', 3, 'aligned'], ['nf:8098-4', 4, 'aligned'], ['nf:8098-5', 5, 'aligned'],
    ['nf:8098-6', 6, 'aligned'], ['nf:8098-7', 7, 'aligned'], ['nf:8098-8', 8, 'aligned'],
    ['nf:8098-9', 9, 'aligned'], ['nf:8098-10', 10, 'aligned'],
  ])
  expect(await fills(COUR_2)).toEqual([
    ['nf:8098-14', 3, 'aligned'], ['nf:8098-15', 4, 'aligned'], ['nf:8098-16', 5, 'aligned'],
    ['nf:8098-17', 6, 'aligned'], ['nf:8098-18', 7, 'aligned'], ['nf:8098-19', 8, 'aligned'],
    ['nf:8098-20', 9, 'aligned'], ['nf:8098-21', 10, 'aligned'], ['nf:8098-22', 11, 'aligned'],
  ])
})

// THE DUPLICATED REFERENCE ROW, which is the page's own input and not a hypothetical: ani.zip
// publishes cour 2's episode 12 carrying episode 1's overview, so ONE text names two of our numbers.
// A scorer that resolved that would put a Netflix row on whichever of the two it reached first; the
// margin refuses the row outright and order never reaches either, so the two rows the defect touches
// are exactly the two that stay unpaired and no other row pays for them.
// Mutation: drop the `best.score - second < margin` test in `synopsisAnchors` and cour 2 proposes
// THIRTEEN anchors instead of six, four of them onto our number 3, no offset holds a majority of
// them, `offsetConsensus` answers null and the cour mints nothing at all. So the margin is worth all
// nine pairs here and not two, and this is also where the consensus is doing visible work on this
// page: it refuses the season rather than minting the best of thirteen (executed 2026-09-13, once
// through the graph and once by calling `synopsisAnchors` with `margin: 0`).
test('a synopsis our side carries twice anchors nothing, and costs no other row its pair', async () => {
  const cour2 = await pairsOnto(REF_2)
  expect(cour2.some(pair => pair.to === 1 || pair.to === 12), 'neither duplicated row is paired').toBe(false)
  expect(cour2).toHaveLength(9)
  expect(OURS_2[11], 'the duplicate is the fixture\'s, and it is ani.zip\'s own row').toBe(OURS_2[0])
})
