/**
 * `plugin:containment` of 5.4 P2, the listing rules of 6.1 it owns, and the invariant of 3.5 it
 * repairs.
 *
 * WHAT EACH CASE IS FOR. The plugin's whole job is to say how two CLUSTERS stand to each other, so the
 * cases are the four answers that relation carries: which container a run hangs off (expanded to the
 * target's own cluster, never the row), which run a container follows to, which catalogue season
 * holds a run by date, and which clusters a listing may therefore stop drawing.
 *
 * Every case names the mutation that reddens it, because a rule about what is NOT drawn is exactly
 * the kind that passes while doing nothing.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'

import type { AnswerRow } from '../../../../../src/worker/graph/answers'

import { enableGraph } from '../../../../../src/worker/graph'
import { closeGraph } from '../../../../../src/worker/graph/engine'
import { ingestAnswers, replayAnswers } from '../../../../../src/worker/graph/ingest'
import { graphReady } from '../../../../../src/worker/graph/schema'
import { resetPassState, runPlugins } from '../../../../../src/worker/graph/plugins/runner'
import { profilePlugin } from '../../../../../src/worker/graph/plugins/profile'
import { directPlugin } from '../../../../../src/worker/graph/plugins/direct'
import { aggregatePlugin } from '../../../../../src/worker/graph/plugins/aggregate'
import {
  containmentPlugin, preferredRunOf, spanVerdict, viaOf, weakerSameAs,
} from '../../../../../src/worker/graph/plugins/containment'
import { checkInvariants } from '../../../../../src/worker/graph/plugins/invariants'
import { answer, episode, media, rowsOf, title } from './fixtures'

const CORPUS = new URL('../../../../../corpus/season/summer-2026/answers.jsonl', import.meta.url).pathname

const MS_PER_DAY = 86_400_000
const dayOf = (date: string): number => Math.floor(Date.parse(date) / MS_PER_DAY)

const sameAs = (node: Record<string, unknown>) => ({ relation: 'SAME_AS', node })
/** A `PART_OF` handle that does NOT stamp a scope, so the target's own answer decides what it is. */
const partOf = (node: Record<string, unknown>) => ({ relation: 'PART_OF', node })
/** A `PART_OF` handle onto a container, which is what a show-level id is claimed as. */
const partOfShow = (node: Record<string, unknown>) => ({ relation: 'PART_OF', node: { ...node, scope: 'CONTAINER' } })

const PLUGINS = [profilePlugin, directPlugin, aggregatePlugin, containmentPlugin]

const runPass = async (plugins = PLUGINS) => {
  const report = await runPlugins(plugins, { reason: 'manual' })
  expect(report.audit.ok, report.audit.differences.join('; ')).toBe(true)
  expect(report.runs.filter(run => run.failed).map(run => `${run.id}: ${run.failed}`)).toEqual([])
  // A PASS THAT HIT THE CAP HAS NOT REACHED A FIXED POINT (5.3), and an attachment plugin is exactly
  // where that goes wrong: a `via` or an `ATTACHED_TO` row that moves every iteration is a cycle the
  // state hash reports rather than an error anything else would catch
  expect(report.anomalies.map(anomaly => anomaly.rule).filter(rule => rule === 'fixed-point-cap')).toEqual([])
  return report
}

const clusterIdOf = async (uri: string): Promise<string> => {
  const [row] = await rowsOf('MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster) RETURN c.id AS id', { uri })
  return String(row?.id ?? '')
}

const clusterOf = async (uri: string) => {
  const [row] = await rowsOf(
    `MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)
     RETURN c.id AS id, c.scope AS scope, c.kind AS kind, c.hidden AS hidden, c.hiddenBy AS hiddenBy,
       c.preferredRun AS preferredRun, c.card AS card, c.anomalies AS anomalies`,
    { uri }
  )
  return row
}

/** Every `ATTACHED_TO` edge out of the cluster holding `uri`, which is the run to container direction. */
const attachmentsFrom = async (uri: string) => rowsOf(
  `MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)-[a:ATTACHED_TO]->(k:Cluster)
   RETURN k.id AS target, a.via AS via, a.supports AS supports ORDER BY target`,
  { uri }
)

const linksBetween = async (fromUri: string, toUri: string) => rowsOf(
  `MATCH (a:Media {uri: $fromUri})-[l:LINK]->(b:Media {uri: $toUri})
   RETURN l.kind AS kind, l.status AS status, l.reason AS reason, l.by AS by, l.evidence AS evidence
   ORDER BY reason`,
  { fromUri, toUri }
)

const anomalyRulesOf = async (uri: string): Promise<string[]> => {
  const cluster = await clusterOf(uri)
  const anomalies = JSON.parse(String(cluster!.anomalies ?? '[]')) as { rule: string, detail: string }[]
  return anomalies.map(anomaly => anomaly.rule)
}

const anomalyDetail = async (uri: string, rule: string): Promise<string> => {
  const cluster = await clusterOf(uri)
  const anomalies = JSON.parse(String(cluster!.anomalies ?? '[]')) as { rule: string, detail: string }[]
  return anomalies.find(anomaly => anomaly.rule === rule)?.detail ?? ''
}

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers([
    // A. THE ATTACHMENT, and the expansion: the run names ONE show row, and the show row is welded to
    // another catalogue's show row, so the attachment has to name the CLUSTER rather than the row
    await answer('media', media('anilist:100', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-07-15', titles: [title('en', 'Attached')],
      handles: [partOfShow({ uri: 'tvdb:10', origin: 'tvdb', id: '10' })],
    })),
    await answer('media', media('tvdb:10', {
      score: 0.4, type: 'TV', titles: [title('en', 'Attached')],
      handles: [sameAs(media('trakt:10', { score: 0.4 }))],
    })),
    await answer('media', media('trakt:10', { score: 0.4, type: 'TV', titles: [title('en', 'Attached')] })),

    // B. SHOW TO SHOW: one catalogue's show naming another's, which is never a run link
    await answer('media', media('tvdb:20', {
      score: 0.4, type: 'TV', titles: [title('en', 'Shows')],
      handles: [partOfShow({ uri: 'trakt:20', origin: 'trakt', id: '20' })],
    })),
    await answer('media', media('trakt:20', { score: 0.4, type: 'TV', titles: [title('en', 'Shows')] })),
    await answer('media', media('anilist:200', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-04-12', titles: [title('en', 'Shows')],
      handles: [partOfShow({ uri: 'trakt:20', origin: 'trakt', id: '20' })],
    })),

    // C. PREFERRED RUN: two runs on one show, and two more that carry no parseable day at all
    await answer('media', media('anilist:300', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-09-12', titles: [title('en', 'Cour two')],
      handles: [partOfShow({ uri: 'tvdb:30', origin: 'tvdb', id: '30' })],
    })),
    await answer('media', media('anilist:301', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-07-14', titles: [title('en', 'Cour one')],
      handles: [partOfShow({ uri: 'tvdb:30', origin: 'tvdb', id: '30' })],
    })),
    await answer('media', media('tvdb:30', { score: 0.4, type: 'TV', titles: [title('en', 'Two cours')] })),
    await answer('media', media('anilist:310', {
      score: 0.8, type: 'TV', episodeCount: 12, titles: [title('en', 'Undated one')],
      handles: [partOfShow({ uri: 'tvdb:31', origin: 'tvdb', id: '31' })],
    })),
    await answer('media', media('anilist:311', {
      score: 0.8, type: 'TV', episodeCount: 12, titles: [title('en', 'Undated two')],
      handles: [partOfShow({ uri: 'tvdb:31', origin: 'tvdb', id: '31' })],
    })),
    await answer('media', media('tvdb:31', { score: 0.4, type: 'TV', titles: [title('en', 'Undated show')] })),

    // D. THE SPAN: a folding origin's season whose OWN episode days cover the run's start and which
    // is longer than the run. The season row carries no start date at all, which is the case the rule
    // exists for (`crunchyroll/extractor.ts:189`)
    await answer('media', media('anilist:400', {
      score: 0.8, type: 'TV', episodeCount: 2, startDate: '2026-07-14', titles: [title('en', 'Cour of a fold')],
      handles: [partOf({ uri: 'cr:400-1', origin: 'cr', id: '400-1' })],
    })),
    await answer('media', media('cr:400-1', {
      score: 0.5, type: 'TV', titles: [title('en', 'The folded season')],
      episodes: [
        episode('cr:400-1-1', 'cr:400-1', { episodeNumber: 1, releaseDate: '2026-07-07' }),
        episode('cr:400-1-2', 'cr:400-1', { episodeNumber: 2, releaseDate: '2026-07-14' }),
        episode('cr:400-1-3', 'cr:400-1', { episodeNumber: 3, releaseDate: '2026-07-21' }),
      ],
    })),

    // D2. TWO SEASONS covering one start day: the refusal, written
    await answer('media', media('anilist:410', {
      score: 0.8, type: 'TV', episodeCount: 2, startDate: '2026-07-14', titles: [title('en', 'Covered twice')],
      handles: [
        partOf({ uri: 'cr:410-1', origin: 'cr', id: '410-1' }),
        partOf({ uri: 'cr:410-2', origin: 'cr', id: '410-2' }),
      ],
    })),
    await answer('media', media('cr:410-1', {
      score: 0.5, type: 'TV', titles: [title('en', 'Season one')],
      episodes: [
        episode('cr:410-1-1', 'cr:410-1', { episodeNumber: 1, releaseDate: '2026-07-07' }),
        episode('cr:410-1-2', 'cr:410-1', { episodeNumber: 2, releaseDate: '2026-07-14' }),
        episode('cr:410-1-3', 'cr:410-1', { episodeNumber: 3, releaseDate: '2026-07-21' }),
      ],
    })),
    await answer('media', media('cr:410-2', {
      score: 0.5, type: 'TV', titles: [title('en', 'Season two')],
      episodes: [
        episode('cr:410-2-1', 'cr:410-2', { episodeNumber: 1, releaseDate: '2026-07-08' }),
        episode('cr:410-2-2', 'cr:410-2', { episodeNumber: 2, releaseDate: '2026-07-15' }),
        episode('cr:410-2-3', 'cr:410-2', { episodeNumber: 3, releaseDate: '2026-07-22' }),
      ],
    })),

    // E. A CATALOGUE SEASON THAT IS PART OF A LONGER RUN: attached in the other direction, so the
    // run's page can list it as a link and never as episodes
    await answer('media', media('cr:500-1', {
      score: 0.5, type: 'TV', episodeCount: 12, titles: [title('en', 'A cour of it')],
      handles: [partOf({ uri: 'anilist:500', origin: 'anilist', id: '500' })],
    })),
    await answer('media', media('anilist:500', {
      score: 0.8, type: 'TV', episodeCount: 24, startDate: '2026-04-12', titles: [title('en', 'The whole run')],
    })),

    // F. THE HIDE RULE, clause 1: a folded season row a run is part of
    await answer('media', media('anilist:900', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-07-14', titles: [title('en', 'Folded away')],
      handles: [partOf({ uri: 'nf:900-1', origin: 'nf', id: '900-1' })],
    })),
    await answer('media', media('nf:900-1', { score: 0.2, type: 'TV', episodeCount: 24, titles: [title('en', 'Netflix season one')] })),

    // F2. clause 3: a season row hanging off its OWN title, under a container a run is attached from
    await answer('media', media('nf:800-1', {
      score: 0.2, type: 'TV', episodeCount: 24, titles: [title('en', 'Under its own title')],
      handles: [sameAs({ uri: 'nf:800', origin: 'nf', id: '800', scope: 'CONTAINER' })],
    })),
    await answer('media', media('anilist:800', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-07-14', titles: [title('en', 'The run itself')],
      handles: [partOfShow({ uri: 'nf:800', origin: 'nf', id: '800' })],
    })),
    // F3. the control for the per-run clause: the same shape, from a metadata catalogue
    await answer('media', media('anilist:820', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-10-11', titles: [title('en', 'Second cour')],
      handles: [partOfShow({ uri: 'nf:800', origin: 'nf', id: '800' })],
    })),

    // F4. the control for the container clause: a show nothing is part of keeps its card
    await answer('media', media('tvdb:40', { score: 0.4, type: 'TV', titles: [title('en', 'A show with no run')] })),

    // F5. the slot fence of 5.4 P5: a single-season show list, once under a run and once alone
    await answer('media', media('tvdb:50', {
      score: 0.4, type: 'TV', titles: [title('en', 'A show with a run')],
      episodes: [
        episode('tvdb:50-1', 'tvdb:50', { episodeNumber: 1, seasonNumber: 1, titles: [title('en', 'One')] }),
        episode('tvdb:50-2', 'tvdb:50', { episodeNumber: 2, seasonNumber: 1, titles: [title('en', 'Two')] }),
      ],
    })),
    await answer('media', media('anilist:500x', {
      score: 0.8, type: 'TV', episodeCount: 2, startDate: '2026-07-14', titles: [title('en', 'The run it follows to')],
      handles: [partOfShow({ uri: 'tvdb:50', origin: 'tvdb', id: '50' })],
    })),
    await answer('media', media('tvdb:51', {
      score: 0.4, type: 'TV', titles: [title('en', 'A show with no run at all')],
      episodes: [
        episode('tvdb:51-1', 'tvdb:51', { episodeNumber: 1, seasonNumber: 1, titles: [title('en', 'One')] }),
        episode('tvdb:51-2', 'tvdb:51', { episodeNumber: 2, seasonNumber: 1, titles: [title('en', 'Two')] }),
      ],
    })),

    // G. clause 2: an `INCLUDES` source onto a run's member. `plugin:range` is 2e, so the edge is
    // written by hand below, which is the only way this clause can be exercised at this step
    await answer('media', media('jw:600-1', { score: 0.2, type: 'TV', episodeCount: 24, titles: [title('en', 'JustWatch season')] })),
    await answer('media', media('anilist:600', {
      score: 0.8, type: 'TV', episodeCount: 12, startDate: '2026-07-14', titles: [title('en', 'Held by a range')],
    })),

    // H. THE ANOMALIES: a row whose own list contradicts its own count, and the control beside it
    await answer('media', media('mal:960', {
      score: 0.9, type: 'TV', episodeCount: 2, titles: [title('en', 'Miscounted')],
      episodes: [
        episode('mal:960-1', 'mal:960', { episodeNumber: 1, titles: [title('en', 'One')] }),
        episode('mal:960-2', 'mal:960', { episodeNumber: 2, titles: [title('en', 'Two')] }),
        episode('mal:960-3', 'mal:960', { episodeNumber: 3, titles: [title('en', 'Three')] }),
      ],
    })),
    await answer('media', media('mal:961', {
      score: 0.9, type: 'TV', episodeCount: 2, titles: [title('en', 'Counted right')],
      episodes: [
        episode('mal:961-1', 'mal:961', { episodeNumber: 1, titles: [title('en', 'One')] }),
        episode('mal:961-2', 'mal:961', { episodeNumber: 2, titles: [title('en', 'Two')] }),
      ],
    })),
  ])

  // THE ONE HAND-WRITTEN ROW. `plugin:range` writes the active `INCLUDES` of 3.4 and is step 2e, so
  // clause 2 of 6.1 has no producer yet; the row is stamped with that plugin's id, which no plugin in
  // this pass owns, so no diff of this pass touches it.
  const { query } = await graphReady()
  await query(
    `MATCH (a:Media {uri: 'jw:600-1'}), (b:Media {uri: 'anilist:600'})
     CREATE (a)-[:LINK {key: 'fixture-includes', kind: 'INCLUDES', by: 'plugin:range', version: 1,
       status: 'active', reason: 'range', confidence: 1.0, fromStart: 1, fromEnd: 12, toStart: 1, toEnd: 12}]->(b)`
  )

  resetPassState()
  await runPass()
}, 300_000)

afterAll(async () => {
  await closeGraph()
})

// THE ATTACHMENT IS TO THE TARGET'S CLUSTER, not to the row the claim named (5.4 P2's scan ends
// `-[:MEMBER_OF]->(k:Cluster)`). One hop out of a member, expanded, which is the walk of 3.5
// materialized once per pass instead of per read.
// Mutation: key the attachment on `link.toUri` instead of `clusterOf(link.toUri)` and the edge names
// a row rather than a cluster, so a page reaching for the show's offers finds one catalogue of two.
test('a PART_OF out of a member attaches the run cluster to the TARGET CLUSTER', async () => {
  const attached = await attachmentsFrom('anilist:100')
  const shows = await clusterIdOf('tvdb:10')
  expect(shows, 'the two show rows are one cluster').toBe(await clusterIdOf('trakt:10'))
  expect(attached.map(row => ({ target: row.target, via: row.via }))).toEqual([{ target: shows, via: 'asserted' }])
  expect((attached[0]!.supports as string[]).length, "the PART_OF link's own key, so a trace descends").toBe(1)
})

// A CONTAINER POINTING AT ANOTHER CONTAINER IS `show-show`, AND NEVER A RUN LINK (`db.ts:300-301`):
// a show that names another show says nothing about which run a page should follow to.
// Mutation: drop the `show-show` branch of `viaOf` and `trakt:20` follows to `tvdb:20`, which is a
// show page redirecting to a show page with no episode and no offer at the end of it.
test('a container naming a container is show-show, and is never the preferred run', async () => {
  const attached = await attachmentsFrom('tvdb:20')
  expect(attached.map(row => ({ target: row.target, via: row.via }))).toEqual([
    { target: await clusterIdOf('trakt:20'), via: 'show-show' },
  ])
  const container = await clusterOf('trakt:20')
  expect(container!.preferredRun, 'the RUN attached to it, never the other show').toBe(await clusterIdOf('anilist:200'))

  expect(viaOf({ fromScope: 'CONTAINER', toScope: 'CONTAINER', reasons: ['asserted'] })).toBe('show-show')
  expect(viaOf({ fromScope: 'RUN', toScope: 'CONTAINER', reasons: ['cross-scope', 'containing'] }), 'the most specific reason wins').toBe('containing')
  expect(
    preferredRunOf({
      container: 'cl:show',
      attachments: [{ from: 'cl:other-show', to: 'cl:show', via: 'show-show', supports: [] }],
      clusters: new Map([['cl:other-show', {
        id: 'cl:other-show', scope: 'CONTAINER', key: 'tvdb:1', members: ['tvdb:1'], owned: true, startDay: 1, runLength: null,
      }]]),
    }),
    'a show is not a run, whatever it is attached to'
  ).toBe(null)
})

// THE EARLIEST PARSEABLE START DAY, TIES BY KEY (`preferAttachedRun`, `db.ts:319-323,338`): "a show
// page with no episode and no offer is what splitting the spaces cost".
// Mutation: sort descending and a show opens on its LATEST cour; drop the key tie-break and two
// undated runs swap the show's landing page depending on which row was read first.
test('preferredRun is the earliest dated run, and ties go to the cluster key', async () => {
  const dated = await clusterOf('tvdb:30')
  expect(dated!.preferredRun, 'July before September').toBe(await clusterIdOf('anilist:301'))
  const undated = await clusterOf('tvdb:31')
  expect(undated!.preferredRun, 'no day anywhere, so the lower key').toBe(await clusterIdOf('anilist:310'))
  expect((await clusterOf('tvdb:40'))!.preferredRun, 'a show with no run follows to nothing').toBe(null)
})

// THE ONE EXCEPTION OF 5.4 P5, which only `preferredRun` can complete: a container with a run
// attached anywhere FOLLOWS to it and mints no slots, and only a container with NO run keeps the
// live-action show page that "lost every episode and offer" once (`db.ts:319-323`, 2026-09-05).
// Mutation: drop the `preferredRun === null` test from the fence and `tvdb:50` draws its own list
// beside the run's, which is `mergeByEpisodeNumber` over an input that is not one run.
test('a container with a run mints no slots, and one without a run still does', async () => {
  const followed = await rowsOf(
    'MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)<-[:SLOT_OF]-(s:Slot) RETURN count(s) AS total',
    { uri: 'tvdb:50' }
  )
  expect(Number(followed[0]!.total), 'it follows to the run instead').toBe(0)
  expect((await clusterOf('tvdb:50'))!.preferredRun).toBe(await clusterIdOf('anilist:500x'))

  const alone = await rowsOf(
    'MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)<-[:SLOT_OF]-(s:Slot) RETURN count(s) AS total',
    { uri: 'tvdb:51' }
  )
  expect(Number(alone[0]!.total), 'the control: one season, no run, so its own list stands').toBe(2)
})

// THE SPAN OF 5.4 P2 AND 4.4: the season whose OWN episode days cover the run's start and which is
// longer than it. The season carries no start date of its own, which is exactly why the rule reads
// the episode days (`crunchyroll/extractor.ts:189` sets `startDate` only on the series row).
// Mutation: read the season's `startDate` instead of its episodes' days and nothing qualifies at all,
// because a Crunchyroll season row has none; drop the `> runLength` test and a season the same length
// as the run is read as holding it.
test('span: exactly one season may hold a run, and it emits its evidence', async () => {
  const links = await linksBetween('anilist:400', 'cr:400-1')
  const span = links.find(link => link.reason === 'span')
  expect(span, 'the season holds the run').toBeTruthy()
  expect(span!.status).toBe('active')
  expect(span!.by).toBe('plugin:containment')
  expect(JSON.parse(String(span!.evidence))).toEqual({
    first: dayOf('2026-07-07'),
    last: dayOf('2026-07-21'),
    startDay: dayOf('2026-07-14'),
    theirCount: 3,
    runLength: 2,
  })
})

// TWO COVERING SEASONS IS A REFUSAL, WRITTEN (5.4 P2): a catalogue whose seasons overlap cannot be
// read either way, and picking one would put a container badge and a hidden season card on a guess.
// Mutation: take the first candidate instead of refusing and `cr:410-1` silently holds a run that
// `cr:410-2` covers just as well.
test('span: two candidates refuse, and the refusal names both', async () => {
  for (const season of ['cr:410-1', 'cr:410-2']) {
    const links = await linksBetween('anilist:410', season)
    const span = links.find(link => link.reason === 'span')
    expect(span, `${season} is a written refusal`).toBeTruthy()
    expect(span!.status).toBe('refused')
    expect(JSON.parse(String(span!.evidence)).candidates).toEqual(['cr:410-1', 'cr:410-2'])
  }
  expect(spanVerdict([]), 'zero is silence, not a refusal').toEqual({ ok: true, candidates: [] })
})

// A CATALOGUE SEASON THAT IS PART OF A LONGER RUN attaches with `via: 'part'` in the other direction,
// "so the run's page can list the seasons as links, never as episodes" (5.4 P2).
// Mutation: stamp the reason instead and a run's page cannot tell a season it CONTAINS from the show
// it sits under, which is the one distinction the two directions exist for.
test("a season that is part of a longer run attaches with via 'part'", async () => {
  const attached = await attachmentsFrom('cr:500-1')
  expect(attached.map(row => ({ target: row.target, via: row.via }))).toEqual([
    { target: await clusterIdOf('anilist:500'), via: 'part' },
  ])
  expect(viaOf({ fromScope: 'RUN', toScope: 'RUN', reasons: ['asserted'] })).toBe('part')
})

// THE HIDE RULE OF 6.1, all three clauses, each with the control that must stay drawn.
// Mutation: drop any one clause and its season row comes back as its own card beside the run (the
// three `nf:80987039-n` rows of 8.1); drop the per-run test and a `mal:` row a run is part of stops
// being a card, which is a work disappearing from every listing.
test('the hide rule hides a folded season, a ranged season and a season under its own title', async () => {
  const folded = await clusterOf('nf:900-1')
  expect(folded!.hidden, 'clause 1: a PART_OF target of a run').toBe(true)
  expect(folded!.hiddenBy).toEqual([await clusterIdOf('anilist:900')])

  const ranged = await clusterOf('jw:600-1')
  expect(ranged!.hidden, 'clause 2: an INCLUDES source onto a run').toBe(true)
  expect(ranged!.hiddenBy).toEqual([await clusterIdOf('anilist:600')])

  const underItsTitle = await clusterOf('nf:800-1')
  expect(underItsTitle!.hidden, 'clause 3: a PART_OF source into a container a run is attached from').toBe(true)
  expect(underItsTitle!.hiddenBy).toEqual(
    [await clusterIdOf('anilist:800'), await clusterIdOf('anilist:820')].sort()
  )

  const run = await clusterOf('anilist:900')
  expect(run!.hidden, 'the run it hides behind is the card').toBe(false)
  const perRun = await clusterOf('anilist:820')
  expect(perRun!.hidden, 'the control: the same shape from a per-run metadata origin is never hidden').toBe(false)
  const lonelyShow = await clusterOf('tvdb:40')
  expect(lonelyShow!.hidden, 'the control: a container with no run keeps its card (`db.ts:389`)').toBe(false)
  expect(lonelyShow!.card, 'and the card itself').not.toBe(null)
})

// FOLD IS A KIND, NEVER A VISIBILITY (6.5): the page that lists its OWN rows in its OWN numbering,
// which is what a folded Netflix season opened from a bookmark draws.
// Mutation: return `FOLD` for every hidden cluster and the season under its own title (clause 3, a
// container's part rather than a fold) renders 24 rows of a run it only points at.
test('a season cluster whose members are all held by runs is a FOLD', async () => {
  expect((await clusterOf('nf:900-1'))!.kind, 'a PART_OF target of a run').toBe('FOLD')
  expect((await clusterOf('jw:600-1'))!.kind, 'an INCLUDES source onto a run').toBe('FOLD')
  expect((await clusterOf('nf:800-1'))!.kind, 'a part of a container, which is not a fold').toBe('RUN')
  expect((await clusterOf('anilist:900'))!.kind).toBe('RUN')
  expect((await clusterOf('tvdb:40'))!.kind).toBe('CONTAINER')
})

// THE TWO ANOMALIES OF 5.5 THIS STEP ADDS, each beside a control that must report nothing.
// Mutation: compare `s.number` against the count instead of `runLength` and `over-length` fires on
// every cluster whose sources disagree; drop the `countDistinct IS NOT NULL` test and every row with
// no list at all reports `count-disagrees`.
test('over-length and count-disagrees fire, and the row that agrees with itself reports neither', async () => {
  expect(await anomalyRulesOf('mal:960')).toEqual(expect.arrayContaining(['over-length', 'count-disagrees']))
  expect(await anomalyDetail('mal:960', 'over-length')).toBe('3 listed against a length of 2 that 1 of its sources agree on')
  expect(await anomalyDetail('mal:960', 'count-disagrees')).toBe('mal:960 states 2 episodes and lists 3 distinct ones')
  expect(await anomalyRulesOf('mal:961'), 'the control: a list that matches its own count').toEqual([])
})

// IDEMPOTENCE IS THE CONTRACT (5.1), and an attachment is the easy way to break it: a `via` chosen by
// array order rewrites every edge on every pass.
// Mutation: drop the sort in `viaOf` or in `attachmentsOf` and a second pass rewrites rows nothing
// moved, which is a re-render of every open page per flush.
test('a second pass over the same graph writes nothing', async () => {
  const again = await runPass()
  expect(again.changes).toEqual([])
})

// THE INVARIANT OF 3.5, FIRED AND THEN CLEARED. The containment edge joins two rows a CHAIN of
// `SAME_AS` welded, which guard 6 cannot see: it asks about the pair, and the pair is joined through
// a third row. So the pass without this plugin leaves `part-of-inside` at 1.
// Mutation: drop `invariantRepairs` from the output and the second count stays 1; retract the
// containment edge instead of the `SAME_AS` and the run loses the container it is a part of.
test('a PART_OF inside a cluster retracts the SAME_AS that welded it, never the containment', async () => {
  await ingestAnswers([
    await answer('media', media('anilist:750', {
      score: 0.8, type: 'TV', episodeCount: 12, titles: [title('en', 'The part')],
      handles: [
        partOf({ uri: 'mal:750', origin: 'mal', id: '750' }),
        sameAs(media('kitsu:750', { score: 0.3 })),
      ],
    })),
    await answer('media', media('kitsu:750', {
      score: 0.3, type: 'TV', episodeCount: 12, titles: [title('en', 'The middle')],
      handles: [sameAs(media('mal:750', { score: 0.9 }))],
    })),
    await answer('media', media('mal:750', { score: 0.9, type: 'TV', episodeCount: 24, titles: [title('en', 'The whole')] })),
  ])

  const { query } = await graphReady()
  await runPass([profilePlugin, directPlugin, aggregatePlugin])
  const before = await checkInvariants(query)
  expect(before.counts['part-of-inside'], 'the chain welded a part into its own whole').toBe(1)
  expect(await clusterIdOf('anilist:750')).toBe(await clusterIdOf('mal:750'))

  await runPass()
  const after = await checkInvariants(query)
  expect(after.counts, 'and the repair clears every one of the four').toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })
  expect(await clusterIdOf('anilist:750'), 'the part left the cluster').not.toBe(await clusterIdOf('mal:750'))

  const repaired = await linksBetween('anilist:750', 'kitsu:750')
  expect(repaired.find(link => link.reason === 'inside')?.kind, 'the edge that says why').toBe('PART_OF')
  expect(repaired.find(link => link.kind === 'SAME_AS')?.status, 'guard 6 refused the weld it contradicts').toBe('refused')
  const kept = await linksBetween('anilist:750', 'mal:750')
  expect(kept.find(link => link.reason === 'asserted')?.status, 'the containment edge stands').toBe('active')

  // the declared precedence, as a rule: a lower class loses, and within a class the later row does
  const strong = { fromUri: 'a:1', toUri: 'b:1', key: 'k1', className: 'run-id', seq: 9 }
  const weak = { fromUri: 'a:1', toUri: 'c:1', key: 'k2', className: 'title', seq: 1 }
  expect(weakerSameAs(weak, strong), 'the lower class is named first').toBeLessThan(0)
  expect(weakerSameAs(
    { ...strong, key: 'k3', seq: 12 },
    { ...strong, key: 'k4', seq: 3 }
  ), 'within a class, the later seq is the weaker').toBeLessThan(0)
}, 120_000)

// A REAL RECORDED PAGE, the only case here that meets shapes nobody chose. It REPORTS its numbers
// rather than asserting a threshold on them, because a figure pinned to one walk fails on the next
// walk rather than on the next bug. What is asserted is what must hold whatever the page contains.
test('the 800 recorded rows attach, hide and hold the invariants', async () => {
  if (!existsSync(CORPUS)) {
    console.warn(`no corpus at ${CORPUS}: run \`npm run corpus:walk\` to record one. This case did not run.`)
    return
  }
  const rows: AnswerRow[] = []
  for (const line of readFileSync(CORPUS, 'utf-8').split('\n')) {
    if (rows.length >= 800) break
    if (!line.trim()) continue
    rows.push(JSON.parse(line) as AnswerRow)
  }
  expect(rows.length, 'a recorded page is about 800 rows (2026-09-12)').toBeGreaterThan(100)

  const ingested = await replayAnswers(rows)
  expect(ingested.quarantined).toEqual([])

  const started = Date.now()
  const pass = await runPass()
  const passMs = Date.now() - started

  const { query } = await graphReady()
  expect((await checkInvariants(query)).counts).toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })

  const [clusters] = await rowsOf('MATCH (c:Cluster) RETURN count(c) AS total')
  const [attached] = await rowsOf('MATCH ()-[a:ATTACHED_TO]->() RETURN count(a) AS total')
  const vias = await rowsOf('MATCH ()-[a:ATTACHED_TO]->() RETURN a.via AS via, count(a) AS total ORDER BY via')
  const [hidden] = await rowsOf('MATCH (c:Cluster) WHERE c.hidden RETURN count(c) AS total')
  const kinds = await rowsOf('MATCH (c:Cluster) RETURN c.kind AS kind, count(c) AS total ORDER BY kind')
  const [preferred] = await rowsOf('MATCH (c:Cluster) WHERE c.preferredRun IS NOT NULL RETURN count(c) AS total')
  const [spans] = await rowsOf(
    "MATCH ()-[l:LINK]->() WHERE l.by = 'plugin:containment' AND l.reason = 'span' RETURN count(l) AS total"
  )
  console.info('plugin:containment over 800 corpus rows:', JSON.stringify({
    clusters: Number(clusters!.total),
    attachments: Number(attached!.total),
    via: Object.fromEntries(vias.map(row => [String(row.via), Number(row.total)])),
    hidden: Number(hidden!.total),
    kinds: Object.fromEntries(kinds.map(row => [String(row.kind), Number(row.total)])),
    preferredRun: Number(preferred!.total),
    spans: Number(spans!.total),
    iterations: pass.iterations,
    passMs,
    containmentMs: pass.runs.filter(run => run.id === 'plugin:containment').map(run => run.ms),
  }, null, 2))

  const again = await runPass()
  expect(again.changes, 'the same page twice is the same view').toEqual([])
  console.info(`the second pass over the same graph: ${again.ms} ms, ${again.iterations} iteration(s), nothing written`)
}, 600_000)

// A DOWNGRADE IS NOT AN INDEPENDENT CONTAINMENT FACT, so the repair above must not read one: it is
// the exclusion guard 6 already makes (`DOWNGRADE_REASONS`), and guard 4's own rule is that a
// standing disagreement inside a component is REPORTED (5.5) and never retracted, since refusing
// every link of such a component empties it and welds it back on the next pass.
//
// THE ONE THAT IS EASY TO MISS IS TRANSIENT. Guard 7 reads `Cluster.runLength` where a cluster holds
// the run side and the row's own count where none does yet, which is EVERY row on the first iteration
// of a pass (`runSideLength`). So two folding rows of one run downgrade against each other on
// iteration 1 (3 against 11, with no cluster to weigh them against) and pass on iteration 2 (3 and 11
// against the cluster's 13, both shorter, neither FINISHED). A repair that latched onto that
// iteration-1 edge made it permanent, because the refusal it caused is what keeps its own trigger
// true. Measured on the corpus, 2026-09-12: `nf:82010449-1` left its cluster with `PART_OF` edges to
// all eight members, `anilist-206521` and `anilist-208829` lost their shape, and 179 further `SPLIT`
// lines came with them.
// Mutation: drop the `DOWNGRADE_REASONS` test in `invariantRepairs` and the three rows below come
// back as two clusters with seven `inside` edges between them.
test('a downgrade PART_OF inside one cluster is never read as a containment fact', async () => {
  await ingestAnswers([
    // The two identity claims into the metadata row sit ON the metadata row: a folding origin's
    // SAME_AS into an id space its own data cannot carry is an `address` pointer now and enters no
    // cluster (3.3), so the weld this case is about has to be stated by a claimer that could state
    // it. `jw` naming `nf` stays where it is, because a JustWatch offer IS a Netflix id it read.
    await answer('media', media('anilist:990', {
      score: 0.8, type: 'TV', episodeCount: 13, startDate: '2026-07-14', titles: [title('en', 'Downgraded inside')],
      handles: [sameAs(media('nf:990-1', { score: 0.2 })), sameAs(media('jw:990-1', { score: 0.2 }))],
    })),
    await answer('media', media('nf:990-1', {
      score: 0.2, type: 'TV', episodeCount: 3, titles: [title('en', 'Downgraded inside')],
    })),
    await answer('media', media('jw:990-1', {
      score: 0.2, type: 'TV', episodeCount: 11, titles: [title('en', 'Downgraded inside')],
      handles: [sameAs(media('nf:990-1', { score: 0.2 }))],
    })),
  ])
  await runPass()

  expect(
    (await linksBetween('nf:990-1', 'jw:990-1')).filter(link => link.reason === 'inside'),
    'the repair never reads a downgrade, so it writes nothing here'
  ).toEqual([])
  expect(await clusterIdOf('nf:990-1'), 'the three rows are one cluster').toBe(await clusterIdOf('anilist:990'))
  expect(await clusterIdOf('jw:990-1')).toBe(await clusterIdOf('anilist:990'))
  expect(
    (await linksBetween('anilist:990', 'nf:990-1')).find(link => link.kind === 'SAME_AS')?.status,
    'and the weld the transient downgrade would have cost is still active'
  ).toBe('active')

  const { query } = await graphReady()
  expect((await checkInvariants(query)).counts).toEqual({
    'includes-inside': 0, 'part-of-inside': 0, 'cross-scope-link': 0, 'double-membership': 0,
  })
}, 300_000)
