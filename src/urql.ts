import { makeScannarrClient } from 'scannarr'
import { call, makeCallListener, registerListener } from 'osra'

import workerUrl from './yoga-worker?url'

import { fetch } from './utils/fetch'
import { Resolvers as WorkerResolvers } from './yoga-worker'

const worker = new Worker(workerUrl, { type: 'module' })

const target = call<WorkerResolvers>(worker, { key: 'yoga-server' })

const resolvers = {
  YOGA_FETCH: makeCallListener(async ({ input, init }: { input: RequestInfo, init?: RequestInit }) => {
    const res = await fetch(input, init)
    return {
      ...res,
      body: res.body
    }
  })
}

export type Resolvers = typeof resolvers

registerListener({
  target: worker as unknown as Worker,
  // @ts-ignore
  resolvers,
  key: 'yoga-fetch'
})

export const { client } = makeScannarrClient({
  context: async () => ({
    fetch
  }),
  handleRequest: async (input: RequestInfo | URL, init?: RequestInit | undefined) => {
    const { body, ...rest } = await target(
      'HANDLE_REQUEST',
      {
        input: input.toString(),
        init: init && {
          method: init.method,
          headers: init.headers,
          body: init.body
        }
      })

    return new Response(
      body,
      rest
    )
  }
})
