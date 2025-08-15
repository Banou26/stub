import type { Resolvers as MainThreadResolvers } from '../worker.ts'

import { expose } from 'osra'

import { yoga } from './yoga'

export const resolvers = {
  HANDLE_REQUEST: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { headers, body, method } = init ?? {}
    const res = await yoga.handleRequest(new Request(input, { headers, body, method }), {})
    return {
      headers: Object.fromEntries(res.headers.entries()),
      body: res.body
    }
  }
}

export type Resolvers = typeof resolvers

const { FETCH } = await expose<MainThreadResolvers>(
  resolvers,
  { local: globalThis as unknown as Worker, remote: globalThis as unknown as Worker }
)

const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { body, ...rest } = await FETCH(input, init)
  return new Response(body, rest)
}

export {
  fetch
}
