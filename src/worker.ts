import type { Resolvers as WorkerResolvers } from './worker/yoga'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'
import { fetch } from './utils/fetch'

const worker = new Worker()

const resolvers = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)
}

export type Resolvers = typeof resolvers

expose<typeof resolvers>(
  resolvers,
  {
    transport: worker,
    key: 'fetch'
  }
)

const { handleRequest } = await expose<WorkerResolvers>(
  {},
  {
    transport: worker,
    key: 'yoga'
  }
)

export {
  handleRequest
}
