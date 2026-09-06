import type { Resolvers } from '../worker'

import { expose } from 'osra'

import { withBackoff, type FetchInit } from './backoff'

const exposePromise = expose<Resolvers>(
  {},
  {
    transport: globalThis,
    key: 'fetch'
  }
)

export const fetch = (input: RequestInfo | URL, init?: FetchInit) =>
  exposePromise.then(({ fetch }) => fetch(input, init))

export const fetchWithBackoff = withBackoff(fetch)
