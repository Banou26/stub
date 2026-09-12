// The trace contract as the PAGE sees it, plus the one place this page reaches the worker.
//
// The bundle type is written out here rather than imported from the worker half. Two reasons, both
// load bearing: the two halves were built at the same time against one agreed shape, so neither can
// import the other's types, and `src/worker.ts` spawns a Worker and awaits an osra handshake AT
// MODULE SCOPE, so a page that statically imports it cannot be rendered in a test at all. The import
// below is therefore dynamic and happens only when a trace is actually asked for.

import { getRoutePath, Route } from '../path'

/** The cluster a uri reached, named three ways because a bug report quotes whichever it has. */
export type TraceResolved = {
  clusterId: string
  aggUri: string
  scope: string
  kind: string | null
  /**
   * The clusters this address ALSO reaches and this bundle is not about: an `ag:(a,b)` whose members
   * sit in two clusters resolves to one, and the other's members are absent from `members`. Optional
   * because a worker build without it sends nothing here, never because it may be skipped.
   */
  otherClusters?: string[]
}

/**
 * Why a uri reached no cluster. Four distinct answers, and the page says which one applies rather
 * than showing an empty graph: the engine is off, the graph holds nothing, no row exists for that
 * uri, or the row exists and carries no cluster yet.
 */
export type TraceReason = 'no-row' | 'no-cluster' | 'graph-empty' | 'not-enabled'

/** One uri the cluster carries. `via` says how it got in, `owned` whether this cluster owns the row. */
export type TraceMember = {
  uri: string
  origin: string
  owned: boolean
  scope: string | null
  title: string | null
  episodeCount: number | null
  countKind: string | null
  startDate: string | null
  via: 'member' | 'placeholder'
}

/** A CLAIMS row: an origin's own statement, straight from the answer that carried it. Never derived. */
export type TraceClaim = {
  fromUri: string
  toUri: string
  kind: string
  claimer: string
  provenance: string
  answerSeq: number
  targetScope: string | null
  key: string
}

/**
 * A LINK row, active or REFUSED.
 *
 * A refused row is the most valuable one in the bundle, because the question a reader arrives with is
 * usually "why is this not here", so nothing here is filtered by status. `evidence` and `gates` stay
 * JSON STRINGS: their content is per rule, and the page parses them for display rather than the
 * bundle reshaping them. `supports` names the edge keys this link was derived from, which is the
 * descent the inspector walks.
 */
export type TraceLink = {
  fromUri: string
  toUri: string
  kind: string
  status: string
  by: string
  reason: string
  confidence: number | null
  version: number | null
  evidence: string | null
  supports: string[]
  gates: string | null
  key: string
}

/**
 * A run attached to a container, with who attached it and on what evidence.
 *
 * `supports` is optional here and required on the worker's own type: it arrived with the read layer
 * after this contract was agreed, and an optional field means the page renders it when it is there
 * without refusing a bundle that predates it.
 */
export type TraceAttachment = {
  runUri: string
  containerUri: string
  via: string
  by: string
  evidence: string | null
  supports?: string[]
}

/** One episode filling a slot: which uri, from which origin, and by which rule (`via`). */
export type TraceFill = {
  episodeUri: string
  origin: string
  via: string
  by: string
  number: number | null
  supports: string[]
}

/** One slot of the cluster, in the order the cluster itself holds them. */
export type TraceSlot = {
  slotId: string
  number: number | null
  title: string | null
  fills: TraceFill[]
}

/** An EPISODE_LINK row, active or refused, carrying both ends' numbers so a pairing reads at a glance. */
export type TraceEpisodeLink = {
  fromUri: string
  toUri: string
  kind: string
  status: string
  by: string
  reason: string
  fromNumber: number | null
  toNumber: number | null
  evidence: string | null
  supports: string[]
  key: string
}

/**
 * A HAS_EPISODE row: one source's own episode list, as one edge per episode.
 *
 * Source truth, like a claim, and in the bundle for one reason: a `via: member` fill's `supports`
 * names exactly these keys, so with the table absent every such descent ended in "not in this
 * bundle". `answerSeq` carries it one step further, to the answer the list arrived in.
 */
export type TraceEpisodeSource = {
  fromUri: string
  toUri: string
  claimer: string
  answerSeq: number
  key: string
}

/** An episode level CLAIMS row. Same shape as a media claim, minus the target scope. */
export type TraceEpisodeClaim = {
  fromUri: string
  toUri: string
  kind: string
  claimer: string
  provenance: string
  answerSeq: number
  key: string
}

/** The run length the cluster settled on, with where it came from and how many origins agreed. */
export type TraceRunLength = {
  value: number | null
  from: string | null
  tier: string | null
  witnesses: number | null
}

/** A rule that fired on this cluster and did not like what it saw. */
export type TraceAnomaly = { rule: string, detail: string }

/**
 * One request to an origin and what came back. A declined ask is half the answer to "why is X
 * missing".
 *
 * `seq` is the ask's own sequence, which is what the page draws: `at` is null by contract (the `Ask`
 * table carries no timestamp) and a column that can never carry anything is not drawn at all.
 */
export type TraceAsk = {
  seq?: number
  origin: string
  outcome: string
  reason: string | null
  at: number | null
}

/** One stored answer, by sequence. A claim names a seq, and `traceAnswer` loads that answer's bytes. */
export type TraceAnswerRow = { seq: number, uri: string, origin: string, operation: string, bytes: number }

/**
 * Everything the page draws, for one asked uri, in one osra call.
 *
 * `resolved` null means the uri reached no cluster and `reason` says which of the four cases it was.
 * Nothing here is invented: a field the graph does not carry is null, so the page can render the word
 * null rather than something that looks like data.
 */
export type TraceBundle = {
  asked: string
  resolved: TraceResolved | null
  reason?: TraceReason
  members: TraceMember[]
  claims: TraceClaim[]
  links: TraceLink[]
  attachments: TraceAttachment[]
  episodes: TraceSlot[]
  episodeLinks: TraceEpisodeLink[]
  episodeClaims: TraceEpisodeClaim[]
  /** Optional for the same reason `cost` is: a worker build that does not send it refuses nothing. */
  episodeSources?: TraceEpisodeSource[]
  runLength: TraceRunLength
  anomalies: TraceAnomaly[]
  asks: TraceAsk[]
  answers: TraceAnswerRow[]
  counts: Record<string, number>
  /** What the bundle cost to build. Optional for the same reason `supports` above is. */
  cost?: { statements: number, ms: number }
}

/** What the page needs from the worker, and the only thing it asks of it. */
export type TraceApi = {
  traceGraph: (uri: string) => Promise<TraceBundle>
  traceAnswer: (seq: number) => Promise<unknown>
}


/** What a build with no trace layer gets told, in the words the page shows. */
export const NO_TRACE_LAYER =
  'this build of the worker exposes no traceGraph, so there is nothing to read a trace from'

const workerApi = async (): Promise<Partial<TraceApi>> =>
  await import('../../worker') as unknown as Partial<TraceApi>

/**
 * The bundle for one uri: an `ag:(...)` uri, a bare member uri, or a `cl:` cluster id.
 *
 * Refuses by throwing, and the two refusals are different: a worker that carries no trace layer says
 * so in `NO_TRACE_LAYER`, anything else is the worker's own error passed through untouched.
 */
export const loadTrace = async (uri: string): Promise<TraceBundle> => {
  const api = await workerApi()
  if (typeof api.traceGraph !== 'function') throw new Error(NO_TRACE_LAYER)
  return api.traceGraph(uri)
}

/**
 * The raw bytes of one stored answer, by sequence.
 *
 * Typed `unknown` on purpose: the worker half decides what an answer's bytes come back as, and the
 * inspector renders a string, a byte array, or a row object carrying its `raw`, without needing to be
 * told which. Refuses the same way `loadTrace` does.
 */
export const loadAnswer = async (seq: number): Promise<unknown> => {
  const api = await workerApi()
  if (typeof api.traceAnswer !== 'function') throw new Error(NO_TRACE_LAYER)
  return api.traceAnswer(seq)
}

/** The param the asked uri rides in, so a link into this page can be pasted into a bug report. */
export const TRACE_URI_PARAM = 'uri'

/**
 * The page flags this link carries over, and the only ones.
 *
 * A trace link is meant to survive being pasted, and a full load makes a new worker: without the
 * engine flag the pasted url lands on `not-enabled`, and `?store=graph` is kept beside it so a link
 * copied off a page reading through the graph reproduces that page rather than a neighbouring one.
 * Nothing else is copied, because every other flag on a media url is about what that view drew.
 */
const CARRIED_PARAMS = ['graph', 'store']

/**
 * A link to this page, with a uri prefilled when there is one.
 *
 * `search` is the query string of the page the link is being built on (wouter's `useSearch`, or
 * `location.search`); the flags above are copied out of it. Pass none and the link carries only the
 * uri, which is what a hand-typed trace is.
 */
export const debugTracePath = ({ uri, search }: { uri?: string, search?: string } = {}): string => {
  const path = getRoutePath(Route.DEBUG_TRACE)
  const params = new URLSearchParams()
  if (uri) params.set(TRACE_URI_PARAM, uri)
  const carried = searchParams(search ?? '')
  for (const name of CARRIED_PARAMS) {
    for (const value of carried.getAll(name)) params.append(name, value)
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/**
 * This page's own url with the graph engine turned on, for the one message that has advice to give.
 *
 * A reload is what it takes: the flags are read once in `src/worker.ts`, right after the worker is
 * spawned, so nothing a page does later can turn the engine on for the worker it already has.
 */
export const graphOnHref = (search: string, param = 'graph'): string => {
  const params = searchParams(search)
  params.set(param, param === 'store' ? 'graph' : '1')
  return `${getRoutePath(Route.DEBUG_TRACE)}?${params.toString()}`
}

const searchParams = (search: string): URLSearchParams =>
  new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

// The query string THIS TAB WAS OPENED WITH, read once.
//
// A session flag cannot be read off the current route, because the app rewrites media urls without
// their query: the modal replaces the path as the cluster's address grows (`shouldGrowAddress`), and
// every in-app link to a media page is built from the path alone. Measured 2026-09-13 on a real
// build, a page opened at `/media/ag:(anilist:108465)?graph=1&trace=1` had `location.search === ''`
// eight seconds later, so a link that read `useSearch()` was never drawn at all.
//
// Once, at module scope, for the same reason `?graph` and `?export=answers` are read once: these are
// decisions about a session, not state of a route.
const OPENED_WITH = typeof location === 'undefined' ? '' : location.search

/**
 * The flags a link on any page should reason about: what this tab was opened with, plus whatever the
 * current route still carries. The route wins on a key both spell.
 */
export const sessionSearch = (routeSearch = ''): string => {
  // `set` and not a spread of both lists: appending them leaves `graph=1&graph=1` in every href a
  // page built while both spellings agreed, which is harmless and reads like a bug
  const merged = searchParams(OPENED_WITH)
  for (const [name, value] of searchParams(routeSearch)) merged.set(name, value)
  return merged.toString()
}

/** The asked uri read back out of a query string. Absent is the empty string, never undefined. */
export const traceUriFromSearch = (search: string): string =>
  new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(TRACE_URI_PARAM) ?? ''
