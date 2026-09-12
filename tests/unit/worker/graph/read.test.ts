/**
 * The read path of section 6, against a real engine seeded through the real ingest and one real pass.
 *
 * WHAT EACH GROUP IS FOR. The read has exactly three ways to be wrong and all three are silent. It
 * can draw a card that should be hidden, or hide one that should be drawn, which is a page that is
 * subtly the wrong shape; it can answer a payload the SCHEMA then nulls, which takes the whole page
 * down for one missing field; or it can wake on the wrong event, which is a page that never updates
 * and reads as a slow source. So the closed set is executed through a real yoga against the real
 * generated schema with the CLIENT'S OWN DOCUMENTS, read out of the client files rather than retyped,
 * and every wake rule is asserted with the control that must NOT wake beside it.
 *
 * Every case names the mutation that reddens it.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'

import type { AnswerRow } from '../../../../src/worker/graph/answers'

import { createSchema, createYoga } from 'graphql-yoga'

import { typeDefs } from '../../../../src/generated/schema/typeDefs.generated'
import { enableGraph } from '../../../../src/worker/graph'
import { closeGraph } from '../../../../src/worker/graph/engine'
import { ingestAnswers, replayAnswers } from '../../../../src/worker/graph/ingest'
import { graphReady } from '../../../../src/worker/graph/schema'
import { resetPassState, runPlugins } from '../../../../src/worker/graph/plugins/runner'
import { DEFAULT_PLUGINS } from '../../../../src/worker/graph/scheduler'
import {
  addressUris, createMediaReader, createPageReader, episodesOf, memberUrisOf, pageClusters, readStore,
  resolveMedia, setReadStore,
} from '../../../../src/worker/graph/read'
import { answer, episode, media, rowsOf, title } from './plugins/fixtures'

const CORPUS = new URL('../../../../corpus/season/summer-2026/answers.jsonl', import.meta.url).pathname

const sameAs = (node: Record<string, unknown>) => ({ relation: 'SAME_AS', node })
const partOf = (node: Record<string, unknown>) => ({ relation: 'PART_OF', node: { ...node, scope: 'CONTAINER' } })

const MS_PER_DAY = 86_400_000
const weekly = (from: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(from) + index * 7 * MS_PER_DAY).toISOString().slice(0, 10))

const MUSHOKU = weekly('2021-01-10', 11)

// ---------------------------------------------------------------------------------------------
// The documents, READ OUT OF THE CLIENT rather than retyped, so a closed-set case can never pass
// against a copy of the document the app has since changed. `gql(`...`)` is the only shape they take
// (`src/generated/gql.ts` is what registers them), so one regex finds every one of them.

const sourceOf = (file: string): string => readFileSync(new URL(file, import.meta.url).pathname, 'utf-8')

const gqlBlocks = (source: string): string[] =>
  [...source.matchAll(/gql\(`([\s\S]*?)`\)/g)].map(match => match[1]!)

const documentNamed = (file: string, name: string): string => {
  const block = gqlBlocks(sourceOf(file)).find(entry =>
    entry.includes(`subscription ${name}(`) || entry.includes(`fragment ${name} on`))
  if (!block) throw new Error(`no document named ${name} in ${file}: the client renamed it`)
  return block
}

const MEDIA_FRAGMENT = documentNamed('../../../../src/worker/resolvers/media/fragment.ts', 'MediaFragment')
const EPISODE_FRAGMENT = documentNamed('../../../../src/worker/resolvers/episode/fragment.ts', 'EpisodeFragment')
const HOME_PAGE = documentNamed('../../../../src/router/home/index.tsx', 'GetReleasingMediaPage')
const SEARCH_PAGE = documentNamed('../../../../src/router/search/index.tsx', 'SearchMediaPage')
const MEDIA_MODAL = documentNamed('../../../../src/router/home/media-modal.tsx', 'GetMediaModal')

// ---------------------------------------------------------------------------------------------
// One yoga over the REAL generated schema, whose resolvers are read.ts and nothing else. It is the
// only way to prove the closed set: a field missing from a card is not an absent key here, it is a
// null on a non-null field, which nulls its parent and, through `MediaPage.nodes: [Media!]!`, the
// whole page. `vitest.config.ts` inlines yoga so one graphql realm exists.

const sliced = (values: unknown[] | undefined, count?: number | null): unknown[] =>
  (values ?? []).slice(0, count ?? undefined)

const server = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers: {
      Query: {},
      Mutation: {},
      Subscription: {
        mediaPage: {
          subscribe: async function* (_parent: unknown, args: { input: { nodes?: { uri: string }[] | null } }) {
            const uris = (args.input.nodes ?? []).map(node => node.uri)
            yield { mediaPage: { nodes: await pageClusters(uris.length ? uris : undefined) } }
          },
        },
        media: {
          subscribe: async function* (_parent: unknown, args: { input: { uri?: string | null } }) {
            yield { media: await resolveMedia(args.input.uri ?? '') }
          },
        },
      },
      Media: {
        categories: (parent: { categories?: string[] }) => parent.categories ?? [],
        handles: (parent: { handles?: unknown[] }) => parent.handles ?? [],
        relations: (parent: { relations?: unknown[] }) => parent.relations ?? [],
        episodes: (parent: { _id: string }) => episodesOf(parent._id),
        descriptions: (parent: { descriptions?: unknown[] }, args: { input?: { count?: number | null } }) =>
          sliced(parent.descriptions, args.input?.count),
        shortDescriptions: (parent: { shortDescriptions?: unknown[] }, args: { input?: { count?: number | null } }) =>
          sliced(parent.shortDescriptions, args.input?.count),
      },
      Episode: {
        handles: (parent: { handles?: unknown[] }) => parent.handles ?? [],
        shortDescriptions: (parent: { shortDescriptions?: unknown[] }) => parent.shortDescriptions ?? [],
        descriptions: (parent: { descriptions?: unknown[] }) => parent.descriptions ?? [],
      },
    } as never,
  }),
  maskedErrors: false,
})

/** Drives one subscription document and returns its single payload, refusing any error it carried. */
const execute = async (document: string, variables: Record<string, unknown>) => {
  const response = await server.handleRequest(
    new Request('http://d/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ query: document, variables }),
    }),
    {}
  )
  const text = await response.text()
  const payloads = [...text.matchAll(/^data: (.+)$/gm)].map(match => JSON.parse(match[1]!))
  for (const entry of payloads) {
    if (entry.errors) throw new Error(`the document answered errors: ${JSON.stringify(entry.errors)}`)
  }
  return payloads[0]?.data
}

// ---------------------------------------------------------------------------------------------
// The fixtures. One run with everything a listing document selects, the catalogue season that hides
// behind it, a second unrelated run as the control, and a third run that a later claim retires into
// the first, which is the only way an `Alias` row is ever written.

const mushokuAnswers = async () => [
  await answer('media', media('anilist:108465', {
    url: 'https://anilist.test/108465', score: 0.8, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: MUSHOKU[0],
    season: 'WINTER', seasonYear: 2021, popularity: 900, averageScore: 82, isAdult: false,
    genres: ['Adventure', 'Fantasy'], tags: ['Isekai'], categories: ['ANIME', 'SERIES'],
    titles: [title('en', 'Mushoku Tensei Jobless Reincarnation')],
    shortDescriptions: [{ language: 'en', shortDescription: 'A man is reborn.', score: 0.8 }],
    descriptions: [{ language: 'en', description: '<p>A man is reborn in a world of magic.</p>', score: 0.8 }],
    covers: [{ language: 'en', url: 'https://cover.test/1.jpg', color: '#112233', score: 0.8 }],
    banners: [{ language: 'en', url: 'https://banner.test/1.jpg', score: 0.8 }],
    trailers: [{ uri: 'yt:abc', origin: 'yt', id: 'abc', url: 'https://yt.test/abc', thumbnail: 'https://yt.test/abc.jpg' }],
    nextAiringEpisode: { episodeNumber: 12, airingAt: '2021-04-04' },
    // A RELATION NODE WITH NO `origin` AND NO `id`, which is the shape Q5 is about: `Media.origin` is
    // `String!` inside a `[MediaRelationEdge!]!`, so one of these unnormalized nulls the whole media.
    relations: [{ relation: 'SEQUEL', format: 'TV', node: { uri: 'anilist:127720', titles: [title('en', 'Part 2')] } }],
    handles: [
      sameAs(media('mal:39535', { score: 0.9 })),
      sameAs(media('anizip:14758', {})),
      partOf(media('nf:80987039-1', { score: 0.2 })),
    ],
  })),
  await answer('media', media('mal:39535', {
    url: 'https://mal.test/39535',
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 11, startDate: MUSHOKU[0],
    season: 'WINTER', seasonYear: 2021, popularity: 950, averageScore: 84,
    genres: ['Fantasy'], tags: ['Isekai'], categories: ['ANIME', 'SERIES'],
    titles: [title('en', 'Mushoku Tensei')],
    covers: [{ language: 'en', url: 'https://cover.test/mal.jpg', color: '#445566', score: 0.9 }],
  })),
  // the episode supplier: eleven numbered rows and ONE SPECIAL, which is the row today's read drops
  await answer('media', media('anizip:14758', {
    url: 'https://anizip.test/14758', type: 'TV', episodeCount: 11, titles: [title('en', 'Mushoku Tensei')],
    episodes: [
      ...MUSHOKU.map((day, index) => episode(`anizip:14758-${index + 1}`, 'anizip:14758', {
        episodeNumber: index + 1, releaseDate: day, titles: [title('en', `Episode ${index + 1}`)],
        thumbnails: [{ url: `https://thumb.test/${index + 1}.jpg` }],
        shortDescriptions: [{ language: 'en', shortDescription: `About episode ${index + 1}.`, score: 1 }],
      })),
      episode('anizip:14758-s1', 'anizip:14758', {
        episodeNumber: null, titles: [title('en', 'Eris the Special')],
      }),
    ],
  })),
  // THE CATALOGUE SEASON, answering for itself so it is OWNED: an unowned cluster is hidden with an
  // EMPTY `hiddenBy`, and the second hop of 6.1 would then have nothing to follow
  await answer('media', media('nf:80987039-1', {
    url: 'https://nf.test/80987039-1', score: 0.2, scope: 'CONTAINER', type: 'TV', status: 'FINISHED',
    titles: [title('en', 'Mushoku Tensei: Season 1')],
    covers: [{ language: 'en', url: 'https://cover.test/nf.jpg', score: 0.2 }],
  })),
]

// the control run: nothing relates it to the one above, so every "and not this one" below names it
const samuraiAnswers = async () => [
  await answer('media', media('anilist:182616', {
    url: 'https://anilist.test/182616', score: 0.8, type: 'TV', status: 'RELEASING', episodeCount: 12, startDate: '2026-07-17',
    season: 'SUMMER', seasonYear: 2026, popularity: 400, averageScore: 75,
    genres: ['Action'], tags: ['Historical'], categories: ['ANIME', 'SERIES'],
    titles: [title('en', 'The Elusive Samurai')],
    covers: [{ language: 'en', url: 'https://cover.test/2.jpg', score: 0.8 }],
    handles: [sameAs(media('mal:60059', { score: 0.9 }))],
  })),
  await answer('media', media('mal:60059', {
    url: 'https://mal.test/60059', score: 0.9, type: 'TV', status: 'RELEASING', episodeCount: 12, categories: ['ANIME', 'SERIES'],
    titles: [title('en', 'The Elusive Samurai')],
  })),
]

// a run of its own in pass one, retired into Mushoku's cluster in pass two, which is what writes the
// `Alias` row statement 1b's second half reads
const strayAnswers = async () => [
  await answer('media', media('kitsu:42323', {
    url: 'https://kitsu.test/42323', score: 0.3, type: 'TV', status: 'FINISHED', episodeCount: 11, categories: ['ANIME', 'SERIES'],
    titles: [title('en', 'Mushoku Tensei')],
  })),
]

const weldAnswer = async () =>
  answer('media', media('mal:39535', {
    score: 0.9, type: 'TV', status: 'FINISHED', episodeCount: 11,
    titles: [title('en', 'Mushoku Tensei')],
    handles: [sameAs(media('kitsu:42323', { score: 0.3 }))],
  }))

const runPass = async () => {
  const report = await runPlugins(DEFAULT_PLUGINS, { reason: 'manual' }, { audit: true })
  expect(report.audit.ok, report.audit.differences.join('; ')).toBe(true)
  expect(report.runs.filter(run => run.failed).map(run => `${run.id}: ${run.failed}`)).toEqual([])
  return report
}

const clusterIdOf = async (uri: string): Promise<string> => {
  const [row] = await rowsOf('MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster) RETURN c.id AS id', { uri })
  return String(row!.id)
}

let RUN_ID = ''
let CONTROL_ID = ''
let SEASON_ID = ''
let STRAY_ID = ''

beforeAll(async () => {
  await enableGraph(true)
  await ingestAnswers([...await mushokuAnswers(), ...await samuraiAnswers(), ...await strayAnswers()])
  resetPassState()
  await runPass()
  STRAY_ID = await clusterIdOf('kitsu:42323')
  // the weld, and the SECOND pass: `kitsu:42323`'s cluster retires into Mushoku's and leaves an Alias
  await ingestAnswers([await weldAnswer()])
  await runPass()
  RUN_ID = await clusterIdOf('mal:39535')
  CONTROL_ID = await clusterIdOf('mal:60059')
  SEASON_ID = await clusterIdOf('nf:80987039-1')
}, 300_000)

afterAll(async () => {
  setReadStore('legacy')
  await closeGraph()
})

// ---------------------------------------------------------------------------------------------
// 6.1, the page.

// Mutation: drop `WHERE NOT c.hidden` from the whole-store statement in read.ts and the season
// appears as its own card, which is the "opening Mushoku adds no season card" fixture of 8.1.
test('a page with no uris lists every visible cluster and no hidden one', async () => {
  const cards = await pageClusters(undefined)
  const ids = cards.map(card => card._id).sort()

  expect(ids).toContain(RUN_ID)
  expect(ids).toContain(CONTROL_ID)
  expect(ids, 'the catalogue season hides behind the run it holds').not.toContain(SEASON_ID)
  // and the control that proves the rig can see a hidden row at all: it IS in the store, hidden
  const [season] = await rowsOf('MATCH (c:Cluster {id: $id}) RETURN c.hidden AS hidden, c.hiddenBy AS hiddenBy', { id: SEASON_ID })
  expect(season!.hidden).toBe(true)
  expect(season!.hiddenBy).toEqual([RUN_ID])
})

// Mutation: delete the `withHiddenRuns` second hop (return only the visible seeds) and this answers
// [], which is a search only unogs or JustWatch answered drawing nothing at all.
test('a page seeded with a hidden row draws the run it hides behind, never the row', async () => {
  const cards = await pageClusters(['nf:80987039-1'])
  expect(cards.map(card => card._id)).toEqual([RUN_ID])
})

test('and a page seeded with a visible member draws that member\'s own cluster', async () => {
  const cards = await pageClusters(['mal:39535'])
  expect(cards.map(card => card._id)).toEqual([RUN_ID])
})

// the empty `UNWIND` of the engine facts: a statement run with no rows dies at runtime, and the
// symptom is a corrupt-statement error rather than an empty page
test('an empty uri list is answered without running a statement', async () => {
  expect(await pageClusters([])).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// 6.1, the incremental re-read and its removal rule.

// Mutation: make `apply` re-read the whole store (call `read` instead) and the control assertion
// below goes green while the scoping is gone; make it ignore the removal rule and the third does.
test('a view:changed re-reads the clusters it names, and only those', async () => {
  const { query } = await graphReady()
  const page = createPageReader()
  const before = await page.read([])
  expect(before.map(card => card._id)).toContain(RUN_ID)

  // both cards are edited UNDER the reader, which is the only way to tell a re-read from a cached row
  const retitle = async (id: string, titleText: string) => {
    const [row] = await query('MATCH (c:Cluster {id: $id}) RETURN c.card AS card', { id })
    const card = JSON.parse(String(row!.card)) as { titles: { title: string }[] }
    card.titles = [{ title: titleText, language: 'en', score: 1 } as never]
    await query('MATCH (c:Cluster {id: $id}) SET c.card = $card', { id, card: JSON.stringify(card) })
  }
  await retitle(RUN_ID, 'RE-READ')
  await retitle(CONTROL_ID, 'NOT RE-READ')

  const after = await page.apply([RUN_ID], [])
  const titleOf = (id: string) =>
    ((after.find(card => card._id === id)?.titles ?? []) as { title: string }[])[0]?.title

  expect(titleOf(RUN_ID), 'the named cluster is re-read').toBe('RE-READ')
  expect(titleOf(CONTROL_ID), 'and the one nobody named is not').not.toBe('NOT RE-READ')
})

// Mutation: drop the `cards.delete(row.id)` on a hidden row and a cluster that has just been folded
// away stays on the page forever, since nothing else ever names it again.
test('and a named cluster that comes back hidden or absent is REMOVED from the page', async () => {
  const { query } = await graphReady()
  const page = createPageReader()
  expect((await page.read([])).map(card => card._id)).toContain(CONTROL_ID)

  await query('MATCH (c:Cluster {id: $id}) SET c.hidden = true', { id: CONTROL_ID })
  expect((await page.apply([CONTROL_ID], [])).map(card => card._id)).not.toContain(CONTROL_ID)

  await query('MATCH (c:Cluster {id: $id}) SET c.hidden = false', { id: CONTROL_ID })
  expect((await page.apply([CONTROL_ID], [])).map(card => card._id)).toContain(CONTROL_ID)

  // naming a cluster that was never there changes nothing, and the page keeps what it had
  expect((await page.apply(['cl:no-such-cluster'], [])).map(card => card._id)).toContain(CONTROL_ID)

  // ABSENT, which is what a retirement looks like from the page's side: the row stops existing and
  // nothing else will ever name it again
  const card = JSON.stringify({ ...page.cards()[0], _id: 'cl:temporary', members: [] })
  await query(
    'CREATE (c:Cluster {id: $id, hidden: false, card: $card})', { id: 'cl:temporary', card }
  )
  const stale = createPageReader()
  expect((await stale.read([])).map(entry => entry._id)).toContain('cl:temporary')
  await query('MATCH (c:Cluster {id: $id}) DETACH DELETE c', { id: 'cl:temporary' })
  expect((await stale.apply(['cl:temporary'], [])).map(entry => entry._id)).not.toContain('cl:temporary')
})

// ---------------------------------------------------------------------------------------------
// 6.2, the detail resolve.

// Mutation: swap statements 1 and 1a (publication before membership) and the departed-member case
// below opens the wrong cluster's page.
test('a member uri, an aggregated uri and a cluster id all resolve to the one cluster', async () => {
  const byMember = await resolveMedia('mal:39535')
  expect(byMember?._id).toBe(RUN_ID)

  const byAddress = await resolveMedia(String(byMember!.uri))
  expect(byAddress?._id).toBe(RUN_ID)

  // the singleton path is GONE, so a one-source address routes here too
  const bySingleton = await resolveMedia('ag:(mal:39535)')
  expect(bySingleton?._id).toBe(RUN_ID)

  const byId = await resolveMedia(RUN_ID)
  expect(byId?._id).toBe(RUN_ID)
})

// Mutation: delete the `Alias` half of `resolveById` and a client holding the id a retired cluster
// published opens nothing, which is a bookmark that renders a shell and sits empty.
test('and a RETIRED cluster id resolves through its alias', async () => {
  expect(STRAY_ID, 'the stray had its own cluster in pass one').not.toBe(RUN_ID)
  const [alias] = await rowsOf('MATCH (a:Alias {id: $id}) RETURN a.clusterId AS clusterId', { id: STRAY_ID })
  expect(alias?.clusterId, 'pass two retired it into the run').toBe(RUN_ID)
  expect((await resolveMedia(STRAY_ID))?._id).toBe(RUN_ID)
})

// Mutation: return `resolved.id` unconditionally (never following `preferredRun`) and a show page
// draws a container with no episodes where it should draw its earliest attached run.
test('a container with a preferredRun follows to that run', async () => {
  const [season] = await rowsOf(
    'MATCH (c:Cluster {id: $id}) RETURN c.scope AS scope, c.preferredRun AS preferredRun', { id: SEASON_ID }
  )
  expect(season!.scope).toBe('CONTAINER')
  expect(season!.preferredRun, 'the run is attached to the season it is part of').toBe(RUN_ID)
  expect((await resolveMedia('nf:80987039-1'))?._id).toBe(RUN_ID)
})

// Mutation: drop the `holds` check in `resolveMedia` and `/media/:uri/:mediaUri` silently opens the
// cluster the first segment names even when the row the second names has left it.
test('the /media/:uri/:mediaUri fallthrough resolves the member when the cluster does not hold it', async () => {
  expect(await resolveMedia(CONTROL_ID)).toBeDefined()
  const through = await resolveMedia(CONTROL_ID, 'mal:39535')
  expect(through?._id, 'the control does not hold the run\'s member, so the member decides').toBe(RUN_ID)
  // and the control: a member the named cluster DOES hold leaves the resolve where it was
  expect((await resolveMedia(CONTROL_ID, 'mal:60059'))?._id).toBe(CONTROL_ID)
})

test('a uri nothing in the store names resolves to nothing, rather than to an empty row', async () => {
  expect(await resolveMedia('mal:00000000')).toBeUndefined()
  expect(await resolveMedia('')).toBeUndefined()
})

// ---------------------------------------------------------------------------------------------
// 6.4, the episode list.

// Mutation: remove the `episodeNumber != null` filter and the special is listed, which is the change
// decision 7 prices; remove the ordering assumption and the rows arrive unordered.
test('the episode list is ordered, and a special is dropped for parity with today', async () => {
  const episodes = await episodesOf(RUN_ID)
  expect(episodes.map(entry => entry.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

  // the control: the special IS in the materialized list, so the drop above is this read's and not
  // an absence in the store
  const [row] = await rowsOf('MATCH (c:Cluster {id: $id}) RETURN c.episodes AS episodes', { id: RUN_ID })
  const stored = JSON.parse(String(row!.episodes)) as { episodeNumber: number | null }[]
  expect(stored.filter(entry => entry.episodeNumber === null).length).toBe(1)
})

// Mutation: resolve the parent through its handles instead of by `_id` and a handle node is handed
// the cluster's whole list, which is the modal drawing every episode inside every badge.
test('a handle node answers an empty list, because its _id is its own uri', async () => {
  expect(await episodesOf('mal:39535')).toEqual([])
  expect(await episodesOf('')).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// 6.6, the wake.

// Mutation: make `wakes` return true unconditionally and the control assertion below goes green
// while every page in the app re-reads on every other page's event.
test('a detail view wakes on its own cluster and not on another', async () => {
  const reader = createMediaReader('mal:39535')
  expect((await reader.read())?._id).toBe(RUN_ID)

  expect(reader.wakes({ clusters: [RUN_ID], uris: [] })).toBe(true)
  expect(reader.wakes({ clusters: [CONTROL_ID], uris: ['mal:60059'] })).toBe(false)
  // a member uri names it too, which is how a retirement into another cluster reaches it
  expect(reader.wakes({ clusters: ['cl:elsewhere'], uris: ['anilist:108465'] })).toBe(true)
})

// Mutation: seed `wakeUris` from the resolved cluster only (drop `requested`) and a modal opened
// before its first source answered never wakes, which is a page stuck on its loading state.
test('and an EMPTY cluster waits on its requested uris until one exists', async () => {
  const reader = createMediaReader('ag:(mal:77777777,anilist:77777777)')
  expect(await reader.read()).toBeUndefined()
  expect(reader.clusterId()).toBeUndefined()

  expect(reader.wakes({ clusters: ['cl:anything'], uris: ['mal:77777777'] })).toBe(true)
  expect(reader.wakes({ clusters: ['cl:anything'], uris: ['anilist:77777777'] })).toBe(true)
  expect(reader.wakes({ clusters: ['cl:anything'], uris: ['mal:39535'] })).toBe(false)
})

test('memberUrisOf names every member of the clusters asked about, and nothing for none', async () => {
  expect(await memberUrisOf([RUN_ID])).toEqual(
    ['anilist:108465', 'anizip:14758', 'kitsu:42323', 'mal:39535'].sort()
  )
  expect(await memberUrisOf([])).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// Both spellings (step 3's cache note, decision Q9).

test('addressUris takes both spellings of a one-source address', () => {
  expect(addressUris('ag:(mal:39535)')).toEqual(['mal:39535'])
  expect(addressUris('mal:39535')).toEqual(['mal:39535'])
  expect(addressUris('')).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// THE CLOSED SET, through the real schema with the client's own documents.

// THE NON-NULL HALF NEEDS NO ASSERTION OF ITS OWN: `execute` throws on any error the document
// carried, and a null on a field the schema declares non-null IS an error, which propagates up to
// the nearest nullable parent. So a card missing `handles` does not fail one expectation here, it
// fails the whole page and the throw names it. What is asserted below is the other half: the fields
// the schema lets be null, which a thinned card would quietly answer null for.
const nonNull = (row: Record<string, unknown>, fields: readonly string[], where: string): void => {
  for (const field of fields) expect(row[field], `${where}.${field}`).not.toBeNull()
}

const HANDLE_NODE_FIELDS = ['_id', 'uri', 'origin', 'id', 'url'] as const

// Mutation: delete `handles` from `cardOf` in plugins/fields.ts. `Media.handles` is `[MediaHandle!]!`
// inside `MediaPage.nodes: [Media!]!`, so the WHOLE PAGE comes back null and this throws on the
// errors the document carried, which is the failure a card missing one field actually produces.
test('the home row document executes over cards with every selected field present', async () => {
  const data = await execute(`${HOME_PAGE}\n${MEDIA_FRAGMENT}`, {
    input: { nodes: [{ uri: 'mal:39535' }] },
    shortDescriptionInput: { count: 1 },
  })
  const nodes = data.mediaPage.nodes as Record<string, unknown>[]
  expect(nodes.length).toBe(1)
  const node = nodes[0]!

  nonNull(node, ['_id', 'uri', 'origin', 'id', 'url', 'score', 'episodeCount', 'popularity'], 'card')
  for (const field of ['titles', 'covers', 'banners', 'trailers']) {
    expect((node[field] as unknown[]).length, field).toBeGreaterThan(0)
  }
  expect((node.shortDescriptions as unknown[]).length, 'the document asks for one').toBe(1)

  const handles = node.handles as { relation: string, node: Record<string, unknown> }[]
  expect(handles.length, 'a card without handles nulls the whole page').toBeGreaterThan(0)
  for (const handle of handles) nonNull(handle.node, HANDLE_NODE_FIELDS, String(handle.node.uri))
})

// Mutation: any of `averageScore`, `nextAiringEpisode`, `banners` or `score` removed from `cardOf`
// turns its assertion below to null; removing `covers` nulls the page outright.
test('and so does the search page document, which selects the wider half of the set', async () => {
  const data = await execute(`${SEARCH_PAGE}\n${MEDIA_FRAGMENT}`, {
    input: { nodes: [{ uri: 'mal:39535' }] },
    shortDescriptionInput: { count: 1 },
  })
  const node = (data.mediaPage.nodes as Record<string, unknown>[])[0]!

  nonNull(node, ['score', 'averageScore', 'popularity', 'status', 'type', 'season', 'seasonYear'], 'card')
  expect(node.status).toBe('FINISHED')
  expect(node.type).toBe('TV')
  expect(node.season).toBe('WINTER')
  expect(node.seasonYear).toBe(2021)
  expect(node.genres).toEqual(expect.arrayContaining(['Fantasy']))
  expect(node.tags).toEqual(['Isekai'])
  expect(node.nextAiringEpisode).toEqual({ episodeNumber: 12, airingAt: '2021-04-04' })
  expect((node.covers as { color: string | null }[])[0]!.color, '`color` is selected only here').not.toBeNull()

  const handles = node.handles as { node: Record<string, unknown> }[]
  for (const handle of handles) nonNull(handle.node, HANDLE_NODE_FIELDS, String(handle.node.uri))
})

// Mutation: drop the `addressOf` normalization from the relations map in plugins/fields.ts. The
// fixture's relation node carries no `origin` and no `id`, `Media.origin` is `String!` inside a
// `[MediaRelationEdge!]!`, and the whole media comes back null.
test('the modal document executes over the detail view, relations and episodes included', async () => {
  const data = await execute(`${MEDIA_MODAL}\n${MEDIA_FRAGMENT}\n${EPISODE_FRAGMENT}`, {
    input: { uri: 'ag:(mal:39535)' },
    descriptionInput: { type: 'HTML' },
  })
  const media = data.media as Record<string, unknown>
  expect(media._id).toBe(RUN_ID)

  const relations = media.relations as { relation: string, node: { origin: string, id: string } }[]
  expect(relations.length).toBe(1)
  expect(relations[0]!.node.origin, 'derived from the uri, since the source node carried none').toBe('anilist')
  expect(relations[0]!.node.id).toBe('127720')

  const episodes = media.episodes as { episodeNumber: number, handles: unknown[] }[]
  expect(episodes.map(entry => entry.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

  for (const entry of episodes) {
    for (const handle of entry.handles as { node: Record<string, unknown> }[]) {
      nonNull(handle.node, ['_id', 'uri', 'origin', 'id', 'mediaUri'], String(handle.node.uri))
    }
  }
  for (const handle of media.handles as { node: Record<string, unknown> }[]) {
    nonNull(handle.node, HANDLE_NODE_FIELDS, String(handle.node.uri))
  }
  nonNull(media, ['_id', 'uri', 'origin', 'id', 'url', 'episodeCount'], 'media')
})

// ---------------------------------------------------------------------------------------------

test('the read store flag defaults to legacy and moves only when asked', () => {
  expect(readStore()).toBe('legacy')
  setReadStore('graph')
  expect(readStore()).toBe('graph')
  setReadStore('legacy')
  expect(readStore()).toBe('legacy')
})

// ---------------------------------------------------------------------------------------------

// BYTES PER CARD on a page nobody chose, which is the step 2 measurement the spec asks for and the
// price of the widened card. It REPORTS rather than asserts a threshold: a figure pinned to one walk
// fails on the next walk rather than on the next bug.
test('the recorded page reports its bytes per card', async () => {
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

  const seeded = (await pageClusters(undefined)).length
  const ingested = await replayAnswers(rows)
  expect(ingested.quarantined).toEqual([])
  await runPass()

  const cards = await pageClusters(undefined)
  expect(cards.length, 'the recorded page adds cards of its own').toBeGreaterThan(seeded)

  const sizes = cards.map(card => JSON.stringify(card).length).sort((a, b) => a - b)
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const handles = cards.reduce((sum, card) => sum + card.handles.length, 0)
  // what the widening COST, priced against the ten fields the card carried before it: the same rows
  // with `origin`, `id`, `url`, `handles`, `score`, `shortDescriptions`, `banners`, `trailers`,
  // `averageScore` and `nextAiringEpisode` taken back off
  const WIDENED = ['origin', 'id', 'url', 'handles', 'score', 'shortDescriptions', 'banners', 'trailers', 'averageScore', 'nextAiringEpisode']
  const narrow = cards
    .map(card => JSON.stringify(Object.fromEntries(Object.entries(card).filter(([key]) => !WIDENED.includes(key)))).length)
    .reduce((sum, size) => sum + size, 0)
  console.info(
    `bytes per card over ${cards.length} cards (${rows.length} recorded rows + the fixtures): ` +
    `mean ${Math.round(total / cards.length)}, median ${sizes[Math.floor(sizes.length / 2)]}, ` +
    `min ${sizes[0]}, max ${sizes.at(-1)}, whole page ${Math.round(total / 1024)} KiB, ` +
    `${(handles / cards.length).toFixed(1)} handles per card; the ten fields 6.1 adds cost ` +
    `${Math.round((total - narrow) / cards.length)} of those bytes per card ` +
    `(${(total / narrow).toFixed(2)}x the card before the widening)`
  )
}, 300_000)
