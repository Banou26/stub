import type { Resolvers as WorkerResolvers } from './worker/yoga'
import type { FetchInit } from './worker/backoff'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'
import { fetch } from './utils/fetch'
import { refusesSeedAsset } from './utils/export-flag'

const worker = new Worker()

const resolvers = {
  // 404, never 503: `fetchWithBackoff` retries a 503 three times, and this refusal is the same shape
  // as the asset simply not being published yet, which the loader already answers undefined to.
  fetch: (input: RequestInfo | URL, init?: FetchInit) =>
    refusesSeedAsset(location.href, input)
      ? new Response(null, { status: 404, statusText: 'the season seed is switched off for this page' })
      : fetch(input, init)
}

export type Resolvers = typeof resolvers

expose<typeof resolvers>(
  resolvers,
  {
    transport: worker,
    key: 'fetch'
  }
)

const { handleRequest, setUserKeys, registerRemoteSource, unregisterRemoteSource, remotePicker, remotePlayer, selectRemoteRelease, exportStore, exportAnswers, exportAsks, graphCounts, setGraphEnabled } = await expose<WorkerResolvers>(
  {},
  {
    transport: worker,
    key: 'yoga'
  }
)

// The graph engine is opt in while the store migration runs. The worker has no view of the page's
// query string, so the flag is read here and handed over as soon as the osra channel is up.
void setGraphEnabled(new URLSearchParams(location.search).has('graph'))

export {
  handleRequest,
  setUserKeys,
  registerRemoteSource,
  unregisterRemoteSource,
  remotePicker,
  remotePlayer,
  selectRemoteRelease,
  exportStore,
  exportAnswers,
  exportAsks,
  graphCounts
}
