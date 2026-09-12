// The app's ONE entry point into the graph trace page.
//
// Section 7.5 puts this panel "behind `?trace=1` on the modal", and until 2026-09-13 the route
// existed with nothing in the app linking to it: the only way to reach a populated trace was a
// client-side navigation the UI never offered, which had to be typed into a console. A debug page
// nobody can get to from the thing they are debugging is a page nobody uses.
//
// A wouter `<Link>`, so the click is a CLIENT-SIDE navigation and the worker, with its engine and
// everything ingested into it so far, survives the hop. The href still carries the engine flags
// (`debugTracePath`), because the same string pasted into a bug report arrives as a full load, and
// that load has to come up with the engine on.

import { css } from '@emotion/react'
import { Link, useSearch } from 'wouter'

import { debugTracePath, sessionSearch } from './trace'
import { readTraceFlag } from '../../utils/export-flag'

const style = css`
  font-size: 1.2rem;
  padding: 0.15rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.3rem;
  white-space: nowrap;

  &:hover { border-color: rgba(255, 255, 255, 0.5); }
`

/**
 * A link to the trace of one uri, drawn only in a session opened with `?trace=1`.
 *
 * Renders nothing at all without the flag or without a uri, so a caller can hand it whatever it has
 * while the store is still answering.
 *
 * THE FLAG IS THE SESSION'S, not the route's (`sessionSearch`). A media view rewrites its own url
 * without the query as the cluster's address grows, so reading `useSearch()` alone drew this link for
 * a few hundred milliseconds and then never again, which measured on a real build as no link at all.
 * The route's query is still read and still wins, so a client-side navigation that adds the flag
 * turns the link on without a reload.
 */
export const TraceLink = ({ uri }: { uri?: string | null }) => {
  const search = sessionSearch(useSearch())
  if (!uri || !readTraceFlag(`?${search}`, 'http://d/')) return null
  return (
    <Link css={style} data-trace-link={uri} href={debugTracePath({ uri, search })} title="what the graph holds for this uri">
      graph trace
    </Link>
  )
}

export default TraceLink
