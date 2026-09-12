/**
 * What a JustWatch row needs to reach a run, now that an address asserts nothing.
 *
 * THE CASE. Until 2026-09-12 a JustWatch row reached its cluster through the handles it echoed back
 * from the asked uri. Those echoes carry `provenance: 'address'` and are refused (3.3, decision 1),
 * so the only remaining route into a cluster is `plugin:title`, which needs a title, and
 * `normalizeMedia` computed one and never put it on the media it returned: 132 of the 138 JustWatch
 * media answers on the recorded season carry none. A row with no title can never join, and the offers
 * it carries (the providers, which are the whole value of the source) never reach the run.
 *
 * WHY THE FIXTURE IS THE REAL EXTRACTOR. The JustWatch row here is what
 * `sources/justwatch/extractor.ts` answers for an aggregated uri, against a stubbed `ctx.fetch`, and
 * not a row retyped into this file. A hand-written row would pass whatever the extractor does, which
 * is exactly the thing under test: delete the `titles` line in `normalizeMedia` and arm B below goes
 * red, because its fixture is then arm A's.
 *
 * THREE ARMS, EACH IN ITS OWN YEAR, sharing one graph and one pass. `plugin:title` buckets by year
 * and the exact-key scan joins within a year, so an arm cannot be compared against another arm's
 * rows; every "and not this one" assertion below reads that separation as well as its own rule.
 *
 * - A: the recording's shape. The same row with its titles blanked, which is what the corpus holds.
 * - B: the row as the fix emits it, which is the deliverable.
 * - C: a JustWatch season that FOLDS, 23 episodes against a run of 11, titled exactly like its run.
 *   It is the control on the other side: a title is a route, never a licence, and the count veto has
 *   to keep this one out of the cluster while the containment edge still carries its offers.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import type { Media as GQLMedia } from '../../../../src/generated/schema/types.generated'

import { enableGraph } from '../../../../src/worker/graph'
import { closeGraph } from '../../../../src/worker/graph/engine'
import { ingestAnswers } from '../../../../src/worker/graph/ingest'
import { resetPassState, runPlugins } from '../../../../src/worker/graph/plugins/runner'
import { DEFAULT_PLUGINS } from '../../../../src/worker/graph/scheduler'
import { resolvers } from '../../../../src/sources/justwatch/extractor'
import { answer, media, rowsOf, sameAs, title } from './plugins/fixtures'

const JW_API = 'https://apis.justwatch.com/graphql'
const SHOW_TITLE = 'Mushoku Tensei Jobless Reincarnation'

type Arm = {
  /** the arm's own year bucket, which is what keeps the three of them from being compared */
  year: number
  objectId: number
  seasonObjectId: number
  netflixId: string
  anilist: string
  mal: string
  kitsu: string
  /** how long JustWatch says its season is, against the run's eleven */
  seasonLength: number
}

const ARM_A: Arm = { year: 1911, objectId: 111111, seasonObjectId: 1111, netflixId: '80000011', anilist: '9101', mal: '9102', kitsu: '9103', seasonLength: 11 }
const ARM_B: Arm = { year: 1912, objectId: 222222, seasonObjectId: 2222, netflixId: '80000012', anilist: '9201', mal: '9202', kitsu: '9203', seasonLength: 11 }
const ARM_C: Arm = { year: 1913, objectId: 333333, seasonObjectId: 3333, netflixId: '80000013', anilist: '9301', mal: '9302', kitsu: '9303', seasonLength: 23 }

const jwUri = (arm: Arm) => `jw:${arm.objectId}-${arm.seasonObjectId}`
const runUris = (arm: Arm) => [`anilist:${arm.anilist}`, `kitsu:${arm.kitsu}`, `mal:${arm.mal}`]
const addressOf = (arm: Arm) => `ag:(anilist:${arm.anilist},jw:${arm.objectId}-${arm.seasonObjectId})`

// JustWatch's own payload, trimmed to what `normalizeMedia` reads. One Netflix offer, because that is
// what has to survive the journey, and a year with no day, which is every recorded JustWatch row.
const jwNode = (arm: Arm) => ({
  id: `ts${arm.objectId}`,
  objectId: arm.objectId,
  objectType: 'SHOW',
  content: {
    title: SHOW_TITLE,
    fullPath: '/us/tv-show/a-show',
    posterUrl: null,
    shortDescription: 'A man is reborn.',
    originalReleaseYear: arm.year,
  },
  offers: [{
    monetizationType: 'FLATRATE',
    standardWebURL: `https://www.netflix.com/title/${arm.netflixId}`,
    package: { clearName: 'Netflix', shortName: 'nfx' },
  }],
  extraOffers: [],
  seasons: [{
    objectId: arm.seasonObjectId,
    totalEpisodeCount: arm.seasonLength,
    content: { seasonNumber: 1, isReleased: true, originalReleaseYear: arm.year },
    episodes: [],
  }],
})

/** The row the real source answers for this arm's aggregated uri, as JSON the log could hold. */
const jwRow = async (arm: Arm): Promise<Record<string, unknown>> => {
  const subscribe = (resolvers.Subscription as never as { media: { subscribe: Function } }).media.subscribe
  const ctx = {
    fetch: async (url: string) => {
      if (url !== JW_API) throw new Error(`fixture has no route for ${url}`)
      return { json: async () => ({ data: { node: jwNode(arm) } }) }
    },
  }
  const { value } = await subscribe(undefined, { input: { uri: addressOf(arm) } }, ctx).next()
  const row = value?.media as GQLMedia | null
  if (!row) throw new Error(`the extractor answered no media for ${jwUri(arm)}`)
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}

// The metadata cluster the run IS: three titled, dated, counted rows joined by anilist's own claims,
// which are `source` claims and so the one thing here that is allowed to weld on its own.
const runAnswers = async (arm: Arm) => {
  const fields = {
    type: 'TV',
    categories: ['ANIME', 'SERIES'],
    episodeCount: 11,
    // day precision, day 3: a first of any month is read as year precision and drops its day (5.4 P0)
    startDate: `${arm.year}-04-03`,
  }
  return [
    await answer('media', media(`anilist:${arm.anilist}`, {
      ...fields, score: 0.8, titles: [title('en', SHOW_TITLE, 0.8)],
      handles: [sameAs(media(`mal:${arm.mal}`, { score: 0.9 })), sameAs(media(`kitsu:${arm.kitsu}`, { score: 0.3 }))],
    })),
    await answer('media', media(`mal:${arm.mal}`, { ...fields, score: 0.9, titles: [title('en', SHOW_TITLE, 0.9)] })),
    await answer('media', media(`kitsu:${arm.kitsu}`, { ...fields, score: 0.3, titles: [title('en', SHOW_TITLE, 0.3)] })),
  ]
}

const runPass = async () => {
  const report = await runPlugins(DEFAULT_PLUGINS, { reason: 'manual' }, { audit: true })
  expect(report.audit.ok, report.audit.differences.join('; ')).toBe(true)
  expect(report.runs.filter(run => run.failed).map(run => `${run.id}: ${run.failed}`)).toEqual([])
  return report
}

/** Every uri sharing a cluster with this one, which is what a weld means once `aggregate` has run. */
const clusterOf = async (uri: string): Promise<string[]> =>
  (await rowsOf(
    `MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)<-[:MEMBER_OF]-(o:Media)
     RETURN o.uri AS uri ORDER BY uri`,
    { uri }
  )).map(row => String(row.uri))

/**
 * The provider rows a run can reach: one active link out of any member of its cluster.
 *
 * ONE HOP FROM A MEMBER, which is the whole question. The offer hangs off the JustWatch row, so it is
 * reachable exactly when that row is in the cluster, and unreachable the moment it is not.
 */
const offersFrom = async (uri: string): Promise<string[]> =>
  (await rowsOf(
    `MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster)<-[:MEMBER_OF]-(:Media)-[l:LINK]->(t:Media)
     WHERE l.status = 'active' AND t.origin = 'nf'
     RETURN DISTINCT t.uri AS uri ORDER BY uri`,
    { uri }
  )).map(row => String(row.uri))

/**
 * Every link touching one uri, whoever wrote it, with the gates the title plugin records on its own.
 *
 * Touching rather than between a named pair: a title link is written between the two clusters'
 * `linkUri`s, which is the lowest-sorting member of each and therefore not a uri a case may name.
 */
const linksTouching = async (uri: string) =>
  (await rowsOf(
    `MATCH (x:Media)-[l:LINK]->(y:Media)
     WHERE x.uri = $uri OR y.uri = $uri
     RETURN x.uri AS fromUri, y.uri AS toUri, l.by AS by, l.kind AS kind, l.status AS status,
       l.reason AS reason, l.gates AS gates
     ORDER BY by, kind, fromUri, toUri`,
    { uri }
  )).map(row => ({
    from: String(row.fromUri),
    to: String(row.toUri),
    other: String(row.fromUri) === uri ? String(row.toUri) : String(row.fromUri),
    by: String(row.by),
    kind: String(row.kind),
    status: String(row.status),
    reason: String(row.reason),
    gates: row.gates === null || row.gates === undefined
      ? null
      : JSON.parse(String(row.gates)) as Record<string, string>,
  }))

/** One row's `MediaProfile.format`, which is the column the title plugin's format gate reads. */
const formatsOf = async (uri: string): Promise<(string | null)[]> =>
  (await rowsOf(
    'MATCH (p:MediaProfile)-[:PROFILE_OF]->(m:Media {uri: $uri}) RETURN p.format AS format', { uri }
  )).map(row => (row.format === null || row.format === undefined ? null : String(row.format)))

/** The claims into a cluster member that carry the address stamp: the route that no longer exists. */
const addressClaimsFrom = async (uri: string): Promise<string[]> =>
  (await rowsOf(
    `MATCH (a:Media {uri: $uri})-[c:CLAIMS]->(b:Media)
     WHERE c.provenance = 'address' RETURN b.uri AS uri ORDER BY uri`,
    { uri }
  )).map(row => String(row.uri))

let ROW_A: Record<string, unknown>
let ROW_B: Record<string, unknown>
let ROW_C: Record<string, unknown>

beforeAll(async () => {
  ROW_B = await jwRow(ARM_B)
  ROW_C = await jwRow(ARM_C)
  // THE RECORDING'S SHAPE: the same row with its titles blanked, which is what the corpus holds for
  // 132 of its 138 JustWatch rows and what this source emitted until the fix
  ROW_A = { ...await jwRow(ARM_A), titles: [] }

  await enableGraph(true)
  await ingestAnswers([
    ...await runAnswers(ARM_A), ...await runAnswers(ARM_B), ...await runAnswers(ARM_C),
    await answer('media', ROW_A), await answer('media', ROW_B), await answer('media', ROW_C),
  ])
  resetPassState()
  await runPass()
}, 300_000)

afterAll(async () => {
  await closeGraph()
})

// The bridge from the source fix to this file. Both halves are the premise every case below rests on:
// the row carries a title now, and the ONLY thing it claims into the run is the address echo.
//
// Mutation: delete the `titles` line in `normalizeMedia` and this goes red first.
test('the row the source answers carries a title, and its only claim into the run is an address echo', async () => {
  expect((ROW_B.titles as { title: string }[]).map(entry => entry.title)).toEqual([SHOW_TITLE])
  expect((ROW_A.titles as unknown[]), 'the recording, for contrast').toEqual([])

  // the echo, and nothing else: the show container and the Netflix offer are both PART_OF, which
  // claims containment rather than identity and unions nothing
  expect(await addressClaimsFrom(jwUri(ARM_B))).toEqual([`anilist:${ARM_B.anilist}`])
  const handles = ROW_B.handles as { relation: string, provenance?: string, node: { uri: string } }[]
  expect(
    handles.filter(handle => handle.relation === 'SAME_AS' && handle.provenance !== 'address'),
    'nothing this source says about itself claims to BE a metadata row'
  ).toEqual([])
  expect(handles.map(handle => handle.node.uri)).toContain(`nf:${ARM_B.netflixId}`)
})

// ARM A, today's behaviour and the 41 recording-level failures: no title, so no route, so the offers
// are unreachable from the run. The address echo is present and does nothing, which is the point.
//
// Mutation: stop blanking `ROW_A`'s titles and this arm welds exactly like arm B, which is the A/B in
// one line. The echo that does nothing here is refused in two places, neither of them mutated for this
// file: `plugin:direct` consumes no `address` claim at all (`direct.ts`, the provenance table), and
// guard 3 refuses any proposal supported by one (`guards.ts`, `address-only`).
test('a titleless JustWatch row stays in its own cluster and its offers never reach the run', async () => {
  const members = await clusterOf(`mal:${ARM_A.mal}`)
  expect(members, 'the metadata cluster formed').toEqual(
    [`anilist:${ARM_A.anilist}`, `kitsu:${ARM_A.kitsu}`, `mal:${ARM_A.mal}`]
  )
  expect(members, 'and the JustWatch row is not in it').not.toContain(jwUri(ARM_A))
  expect(await clusterOf(jwUri(ARM_A))).toEqual([jwUri(ARM_A)])

  expect(await offersFrom(`mal:${ARM_A.mal}`), 'the providers are unreachable from the run').toEqual([])
  // THE CONTROL, and it is the half that matters: the offer exists and this query can see it. Anchored
  // on the JustWatch row's own cluster the same walk answers, so the emptiness above is the missing
  // membership and not a query that can never return anything.
  expect(await offersFrom(jwUri(ARM_A))).toEqual([`nf:${ARM_A.netflixId}`])
})

// ARM B, the deliverable: the same row, with the title the fix emits, joins the run through
// `plugin:title` and brings its offers with it.
//
// Mutation: delete the `titles` line in `normalizeMedia`, and this arm becomes arm A.
test('the same row carrying its title is welded to the run by plugin:title, and the offers follow', async () => {
  const members = await clusterOf(`mal:${ARM_B.mal}`)
  expect(members).toContain(jwUri(ARM_B))
  expect(members).toEqual(
    [`anilist:${ARM_B.anilist}`, jwUri(ARM_B), `kitsu:${ARM_B.kitsu}`, `mal:${ARM_B.mal}`]
  )
  expect(await offersFrom(`mal:${ARM_B.mal}`), 'the providers are reachable from the run')
    .toEqual([`nf:${ARM_B.netflixId}`])

  // and it welded nothing else: the other two arms are one year away each, which is the only thing
  // separating three runs that carry the same title
  expect(members).not.toContain(jwUri(ARM_A))
  expect(members).not.toContain(jwUri(ARM_C))
  expect(members).not.toContain(`mal:${ARM_A.mal}`)
  expect(members).not.toContain(`mal:${ARM_C.mal}`)
})

// WHICH GATES FIRED, read off the row rather than inferred from the outcome, and the answer is that
// ALL FOUR ARE SILENT. `silent` is the premise failing and never a verdict, and this row fails every
// premise: JustWatch publishes no `type`, so it names no format whatever its categories say
// (`formatOf`, and the anizip constant that rule exists for); neither side's titles name an ordinal;
// and a season dated by its year alone brings no day to the date gate.
//
// SO THE GATES PROTECT NOTHING HERE, and what does is named by the other cases: the year bucket (arm
// B welds neither of the other arms, which carry the same title), the title score itself, and the
// guards, of which the count veto is the one that fires (arm C).
//
// Mutation: make `gatesFor` return `refused` for a silent date (both sides must speak) and the link is
// written refused, arm B falls back to arm A, and this reads `date: 'refused'`.
test('the accepted link records its four gates, and every one of them is silent', async () => {
  const links = await linksTouching(jwUri(ARM_B))
  const accepted = links.find(link => link.by === 'plugin:title' && link.kind === 'SAME_AS')

  expect(accepted, `no title link at all: ${JSON.stringify(links)}`).toBeDefined()
  expect(accepted!.status).toBe('active')
  expect(accepted!.reason, 'the same normalized title on both sides').toBe('exact')
  expect(accepted!.other, 'and it points at a member of the run').toMatch(/^(anilist|kitsu|mal):92/)
  expect(accepted!.gates).toEqual({ format: 'silent', season: 'silent', date: 'silent', companion: 'silent' })

  // the control that keeps a silence readable as this ROW saying nothing rather than as the rig
  // producing nothing: the run's members do name a format, off the same column the gate reads
  expect(await formatsOf(jwUri(ARM_B)), 'JustWatch publishes no type, so it names no format').toEqual([null])
  expect(await formatsOf(`mal:${ARM_B.mal}`), 'and the row it welded to does').toEqual(['SERIES'])
})

// ARM C, the other side of the same rule: a title is a route into a cluster and never a licence to
// join it. JustWatch FOLDS anime cours, so its season is 23 against this run's 11, and the count veto
// has to refuse the weld while the containment edge still carries the offers.
//
// Mutation: give this arm's season 11 episodes instead of 23 and it welds exactly like arm B, which is
// what proves the count is the only thing keeping it out: same title, same year, same scope, same
// address echo. Deleting guard 7 in `plugins/guards.ts` reddens it the same way.
test('a folding JustWatch season with the run\'s own title is refused by the count veto, not welded', async () => {
  const members = await clusterOf(`mal:${ARM_C.mal}`)
  expect(members, 'a season holding two cours is not this run').not.toContain(jwUri(ARM_C))

  const links = await linksTouching(jwUri(ARM_C))
  const refused = links.find(link => link.kind === 'SAME_AS' && runUris(ARM_C).includes(link.other))
  expect(refused, `no verdict written at all: ${JSON.stringify(links)}`).toBeDefined()
  expect(refused!.status).toBe('refused')
  expect(refused!.reason, 'the guard that refused it, on the row').toBe('count-mismatch')
  // the refusal costs a weld and never the link: the run hangs under the folded season instead
  expect(
    links.some(link => link.kind === 'PART_OF' && link.status === 'active' && runUris(ARM_C).includes(link.other)),
    JSON.stringify(links)
  ).toBe(true)
})
