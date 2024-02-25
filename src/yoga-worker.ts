import { call, makeCallListener, registerListener } from 'osra'
import { makeScannarrServer } from 'scannarr'
import { targets } from 'laserr'

import type { Resolvers as ParentResolvers } from './urql'

const target = call<ParentResolvers>(globalThis as unknown as Worker, { key: 'yoga-fetch' })

const { yoga } = makeScannarrServer({
  origins: targets,
  context: async () => ({
    fetch: async (input: RequestInfo | URL, init: RequestInit | undefined) => {
      const { body, ...rest } = await target(
        'YOGA_FETCH',
        {
          input: input.toString(),
          init: init && {
            ...init,
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
})

const resolvers = {
  HANDLE_REQUEST: makeCallListener(async ({ input, init }: { input: RequestInfo, init?: RequestInit }) => {
    const res = await yoga.handleRequest(new Request(input, init), {})
    return {
      ...res,
      body: res.body,
      headers: Object.fromEntries(res.headers.entries())
    }
  })
}

export type Resolvers = typeof resolvers

registerListener({
  target: globalThis as unknown as Worker,
  // @ts-ignore
  resolvers,
  key: 'yoga-server'
})
