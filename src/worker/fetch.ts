import type { Resolvers } from '../worker'

import { expose } from 'osra'

const exposePromise = expose<Resolvers>(
  {},
  {
    local: globalThis as unknown as Worker,
    remote: globalThis as unknown as Worker,
    key: 'fetch'
  }
)

export const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { FETCH } = await exposePromise
  const { body, ...rest } = await FETCH(input, init)
  return new Response(body, rest)
}
