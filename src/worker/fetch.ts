import type { Resolvers } from '../worker'

import { expose } from 'osra'

const exposePromise = expose<Resolvers>(
  {},
  {
    transport: globalThis,
    key: 'fetch'
  }
)

export const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  exposePromise.then(({ fetch }) => fetch(input, init))
