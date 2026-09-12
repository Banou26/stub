// The answer log reaches a page ONLY through `?export=answers`, and only as a window function, for
// the same reason the store export does (see ./store-export.ts): a query field would be permanent
// product surface, and a flagged window function exists only on a page that asked for it. Its
// ABSENCE is what tells a caller the flag never reached the app, which otherwise looks exactly like
// a session that answered nothing.
//
// The log fills behind `?graph=1` and nothing else, so a page carrying this flag alone installs a
// function that THROWS rather than one that answers an empty list: a log that is off and a log that
// is empty are different facts about a session.
//
// `__stubGraphCounts` rides the same flag and the same rule. It is the other half of one question:
// the log says what the sources answered, the counts say what the ingest made of it, and a walk that
// reads only the first cannot tell a working tee from one that quarantined every row.
//
// `__stubExportAsks` rides it too, and is the third: the `Ask` log says which questions the app's own
// consumer put through `similarMedia` and what each came to, which is the only record of a source
// that answered nothing at all (7.3).
import type { GraphQLRequest } from './utils/graphql-stream'

import { readAnswersExportFlag, readQueryProbeFlag } from './utils/export-flag'
import { streamGraphQL } from './utils/graphql-stream'
import { exportAnswers, exportAsks, graphCounts, handleRequest } from './worker'

declare global {
  interface Window {
    __stubExportAnswers?: () => Promise<unknown>
    __stubExportAsks?: () => Promise<unknown>
    __stubGraphCounts?: () => Promise<unknown>
    __stubGraphQL?: (query: string, variables?: Record<string, unknown>, options?: { settleMs?: number }) => Promise<unknown>
  }
}

/**
 * Put one document through the worker the way the app's own client does, and answer what it SETTLES
 * on.
 *
 * `handleRequest` is the function urql's fetch exchange calls (`src/urql.ts`), so this reaches the
 * real yoga, the real resolvers and whichever read store the page's flags selected. That is the whole
 * point: a probe that rebuilt the read itself could not tell the two stores apart, and a check that
 * read the DOM would be measuring the renderer.
 *
 * Every read in this app is a SUBSCRIPTION, so the answer arrives as a stream that yields again each
 * time the store moves. It collects payloads for `settleMs` and returns the LAST one, plus the count,
 * because the first payload of a cold page is routinely an empty list that a later one fills.
 */
const probe = async (query: string, variables: Record<string, unknown> = {}, options: { settleMs?: number } = {}) =>
  streamGraphQL(handleRequest as GraphQLRequest, query, variables, { settleMs: options.settleMs })

if (readAnswersExportFlag(location.href)) {
  window.__stubExportAnswers = () => exportAnswers()
  window.__stubExportAsks = () => exportAsks()
  window.__stubGraphCounts = () => graphCounts()
}

if (readQueryProbeFlag(location.href)) {
  window.__stubGraphQL = (query, variables, options) => probe(query, variables, options)
}
