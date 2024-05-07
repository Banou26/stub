import { getIntrospectionQuery } from 'graphql'
import { makeScannarrClient } from 'scannarr'
import { call, makeCallListener, registerListener } from 'osra'

import WorkerUrl from './yoga-worker?worker&url'

import { fetch } from './utils/fetch'
import { Resolvers as WorkerResolvers } from './yoga-worker'

const worker = new Worker(WorkerUrl, { type: 'module' })

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

const introspectionSchema = await target(
  'HANDLE_REQUEST',
  {
    input: 'http://d/graphql',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variables: {},
        query: getIntrospectionQuery({ descriptions: false }),
      }),
    }
  }
)
  .then(res => new Response(res.body, res))
  .then(res => res.json())
  .then(({ data }) => data)

export const { client } = makeScannarrClient({
  introspectionSchema,
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
      }
    )

    return new Response(
      body,
      rest
    )
  }
})
