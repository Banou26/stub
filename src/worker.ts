import type { Resolvers as WorkerResolvers } from './worker/yoga'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'
import { fetch } from './utils/fetch'
import { refusesSeedAsset } from './utils/export-flag'

const worker = new Worker()

const resolvers = {
  // 404, never 503: `fetchWithBackoff` retries a 503 three times, and this refusal is the same shape
  // as the asset simply not being published yet, which the loader already answers undefined to.
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
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

const { handleRequest, setUserKeys, registerRemoteSource, unregisterRemoteSource, remotePicker, remotePlayer, selectRemoteRelease, exportStore } = await expose<WorkerResolvers>(
  {},
  {
    transport: worker,
    key: 'yoga'
  }
)

export {
  handleRequest,
  setUserKeys,
  registerRemoteSource,
  unregisterRemoteSource,
  remotePicker,
  remotePlayer,
  selectRemoteRelease,
  exportStore
}
