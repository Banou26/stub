/**
 * The `ask` claim of 3.3 and 4.4: what the app's own consumer accepted, written into the source
 * tables as a `CLAIMS` edge nothing else writes, and read by the plugins exactly as a source claim is.
 *
 * WHY THIS FILE EXISTS. Migration step 4's whole point is that an answered ask stops being a console
 * line: before it, the consumer asked Netflix which of its seasons held a run, Netflix answered, the
 * answer was logged, and no row in the graph ever said so, which is why every Netflix source was
 * missing from Mushoku Tensei season 3 while the `Ask` log recorded the right answer.
 *
 * Every case names the mutation that reddens it, because a claim that lands and is then ignored by
 * every plugin looks exactly like one that works.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { enableGraph } from '../../../../src/worker/graph'
import { closeGraph } from '../../../../src/worker/graph/engine'
import { ingestAnswers, writeAskClaim } from '../../../../src/worker/graph/ingest'
import { resetPassState, runPlugins } from '../../../../src/worker/graph/plugins/runner'
import { profilePlugin } from '../../../../src/worker/graph/plugins/profile'
import { directPlugin } from '../../../../src/worker/graph/plugins/direct'
import { aggregatePlugin } from '../../../../src/worker/graph/plugins/aggregate'
import { containmentPlugin } from '../../../../src/worker/graph/plugins/containment'
import { answer, episode, media, rowsOf, title } from './plugins/fixtures'

/** The run: cour 2 of Mushoku Tensei, whose own Netflix season nobody has named. */
const RUN = 'anilist:127720'
/** Netflix's season 2, the 25 episode fold that holds it (8.1). */
const SEASON = 'nf:80987039-2'
/** The show row every Netflix answer hangs off, and the only Netflix node the page had before. */
const SHOW = 'nf:80987039'

const claimsOf = async (fromUri: string) =>
  (await rowsOf(
    `MATCH (a:Media {uri: $uri})-[c:CLAIMS]->(b:Media)
     RETURN b.uri AS toUri, c.kind AS kind, c.provenance AS provenance, c.claimer AS claimer,
       c.targetScope AS targetScope, c.node AS node, c.answerSeq AS answerSeq
     ORDER BY toUri, kind`,
    { uri: fromUri }
  )).map(row => ({ ...row, answerSeq: Number(row.answerSeq) } as Record<string, unknown>))

const linksBetween = async (fromUri: string, toUri: string) =>
  (await rowsOf(
    `MATCH (a:Media {uri: $from})-[l:LINK]->(b:Media {uri: $to})
     RETURN l.kind AS kind, l.status AS status, l.reason AS reason, l.by AS by, l.supports AS supports
     ORDER BY kind, reason`,
    { from: fromUri, to: toUri }
  ))

const runPass = async () => {
  resetPassState()
  const report = await runPlugins([profilePlugin, directPlugin, aggregatePlugin, containmentPlugin], { reason: 'manual' })
  expect(report.anomalies.filter(anomaly => anomaly.rule === 'plugin-failed')).toEqual([])
  return report
}

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers([
    // the run, as AniList describes it, with the dates `plugin:range` would later read
    await answer('media', media(RUN, {
      titles: [title('en', 'Mushoku Tensei: Jobless Reincarnation Season 2')],
      startDate: '2026-07-03',
      episodeCount: 12,
      episodes: [
        episode(`${RUN}-1`, RUN, { episodeNumber: 1, releaseDate: '2026-07-03' }),
        episode(`${RUN}-2`, RUN, { episodeNumber: 2, releaseDate: '2026-07-10' }),
      ],
    })),
    // Netflix's own rows: the show, and the season it answers with. The season is a RUN of 25
    // episodes, which is the fold: it holds cour 1 and cour 2 and is neither of them
    await answer('media', media(SHOW, {
      scope: 'CONTAINER',
      titles: [title('en', 'Mushoku Tensei: Jobless Reincarnation')],
      handles: [{ relation: 'INCLUDES', node: media(SEASON) }],
    })),
    await answer('media', media(SEASON, {
      titles: [title('en', 'Season 2')],
      episodeCount: 25,
      startDate: '2026-01-04',
    })),
  ])
})

afterAll(async () => {
  await closeGraph()
})

// The write itself. A claim is the app's own statement and carries no `Answer`, which is exactly what
// makes it the one row the ingest refuses to write (its header) and this function's whole reason.
//
// Mutation: return 'source' from `writeAskClaim`'s row instead of 'ask' and the provenance assertion
// reddens; drop the `kind` and pass 'SAME_AS' and the first assertion reddens.
test('a containing answer lands as PART_OF from the run to the season, stamped ask', async () => {
  const report = await writeAskClaim({
    fromUri: RUN,
    toUri: SEASON,
    kind: 'PART_OF',
    claimer: 'nf',
    targetScope: null,
    node: { uri: SEASON, origin: 'nf', id: '80987039-2', scope: null, titles: [{ title: 'Season 2' }] },
  })

  expect(report.written).toBe(true)
  expect(report.placeholders, 'both ends were already described, so nothing was anchored').toEqual([])
  expect(await claimsOf(RUN)).toMatchObject([{
    toUri: SEASON,
    kind: 'PART_OF',
    provenance: 'ask',
    claimer: 'nf',
    // an ask came out of no answer, and a trace that followed a borrowed seq would print somebody
    // else's bytes as the reason this edge exists
    answerSeq: 0,
  }])
})

// Mutation: skip the read-back of the claim key in `askClaimBatch` (`if (existing) return ...`) and
// the second write creates a second edge on the same key, so `written` reads true and the claim count
// reads 2. The statement's own `WHERE NOT EXISTS` is not what this proves: it is belt and braces
// behind the read, and removing it alone changes nothing, measured 2026-09-13.
test('the same ask claimed again writes nothing and reports so', async () => {
  const again = await writeAskClaim({
    fromUri: RUN,
    toUri: SEASON,
    kind: 'PART_OF',
    claimer: 'nf',
    targetScope: null,
    node: { uri: SEASON, origin: 'nf', id: '80987039-2', scope: null, titles: null },
  })

  expect(again.written).toBe(false)
  expect(await claimsOf(RUN)).toHaveLength(1)
})

// THE POINT OF THE SLICE. The claim is not the end: `plugin:direct` has to read it, and it has to
// read it as a statement rather than as the pointer an `address` claim is.
//
// Mutation: add `if (candidate.provenance === 'ask') return []` beside the `address` line in
// `decide` and every assertion here reddens, which is the shape of the bug this slice fixes: the
// answer is known, logged, and invisible to every rule.
test('the ask claim reaches plugin:direct, which derives the containing edge', async () => {
  await runPass()

  const links = await linksBetween(RUN, SEASON)
  expect(links).toMatchObject([{
    kind: 'PART_OF',
    status: 'active',
    // 5.4 P1's own row for it: an `ask` PART_OF is `containing`, where a source's is `asserted`
    reason: 'containing',
    by: 'plugin:direct',
  }])
  expect((links[0]!.supports as string[]).length, 'the link descends to the claim it came from').toBe(1)
})

// The end to end this slice exists for: with the claim in, the Netflix season is a candidate the
// range plugin can see. `plugin:range` consumes `LINK` of kind `PART_OF` and the `ATTACHED_TO` the
// containment pass derives from it, so what is asserted here is that both exist between the run's
// cluster and the season's, where before the claim there was no season row in the graph at all.
//
// Mutation: make `askClaimBatch` return without writing and both assertions redden, which is the
// page this slice was opened on: the answer known, the log row written, and no season row for any
// rule to consider. Note what does NOT redden it, measured 2026-09-13: claiming the season `SAME_AS`
// instead. The writer's count guard refuses that weld (12 against 25) and downgrades it to the same
// containment, so the attachment survives a wrong kind and only the missing claim removes it.
test('the season is attached to the run cluster, which is what plugin:range scans', async () => {
  const attached = await rowsOf(
    `MATCH (a:Cluster)-[t:ATTACHED_TO]->(b:Cluster)
     MATCH (m:Media {uri: $run})-[:MEMBER_OF]->(a), (s:Media {uri: $season})-[:MEMBER_OF]->(b)
     RETURN t.via AS via, t.by AS by`,
    { run: RUN, season: SEASON }
  )
  expect(attached.length, 'one attachment, the run cluster onto the season cluster').toBe(1)

  const scannable = await rowsOf(
    `MATCH (a:Media {uri: $run})-[l:LINK {kind: 'PART_OF', status: 'active'}]->(b:Media {uri: $season})
     RETURN l.reason AS reason`,
    { run: RUN, season: SEASON }
  )
  expect(scannable).toHaveLength(1)
})

// THE CONTROL, and the guard the slice promises is unchanged: an `ask` claim is weighed exactly as a
// `source` claim is, so the same refusal fires on it. A Netflix SHOW is a CONTAINER, and a PART_OF
// running from a container into a run is inverted whoever claimed it (5.4 P1).
//
// Mutation: read `candidate.provenance === 'ask'` as a reason to skip the inverted check and this
// row goes active, which is a show welded under a season by an ask nobody could refuse.
test('an ask claim is refused by the same guard a source claim is', async () => {
  await writeAskClaim({
    fromUri: SHOW,
    toUri: RUN,
    kind: 'PART_OF',
    claimer: 'nf',
    targetScope: null,
    node: { uri: RUN, origin: 'anilist', id: '127720', scope: null, titles: null },
  })
  await runPass()

  expect(await linksBetween(SHOW, RUN)).toMatchObject([{ kind: 'PART_OF', status: 'refused', reason: 'inverted' }])
})

// An end no answer has described yet is the normal case on a live page: the consumer accepts the
// answer the moment the source returns it, and the answering extractor's own row lands after. The
// claim may not wait for it, and may not invent it either.
//
// Mutation: drop the placeholder statement and the CLAIMS `MATCH` finds one end, writes nothing and
// reports `written: true` against an empty table, so both assertions redden.
test('an end nobody has described is anchored as a placeholder, with no fields', async () => {
  const report = await writeAskClaim({
    fromUri: RUN,
    toUri: 'cr:GRMG8ZQZR',
    kind: 'SAME_AS',
    claimer: 'cr',
    targetScope: null,
    node: { uri: 'cr:GRMG8ZQZR', origin: 'cr', id: 'GRMG8ZQZR', scope: null, titles: null },
  })

  expect(report.placeholders).toEqual(['cr:GRMG8ZQZR'])
  expect(await rowsOf('MATCH (m:Media {uri: $uri}) RETURN m.owned AS owned, m.raw AS raw, m.scope AS scope', { uri: 'cr:GRMG8ZQZR' }))
    .toEqual([{ owned: false, raw: null, scope: null }])
  expect((await claimsOf(RUN)).map(row => `${String(row.toUri)} ${String(row.kind)}`))
    .toEqual(['cr:GRMG8ZQZR SAME_AS', `${SEASON} PART_OF`])
})
