import type { Resolvers } from '../worker'

import { expose } from 'osra'

const exposePromise = expose<Resolvers>(
  {},
  {
    transport: globalThis,
    key: 'fetch'
  }
)

export const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { FETCH } = await exposePromise
  const { body, ...rest } = await FETCH(input, init)
  return new Response(body, rest)
}
