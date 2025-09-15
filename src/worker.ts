import type { Resolvers as WorkerResolvers } from './worker/yoga'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'
import { fetch } from './utils/fetch'

const worker = new Worker()

const resolvers = {
  FETCH: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init)
    return {
      headers: Object.fromEntries(response.headers.entries()),
      body: response.body
    }
  }
}

export type Resolvers = typeof resolvers

expose<typeof resolvers>(
  resolvers,
  {
    local: worker,
    remote: worker,
    key: 'fetch'
  }
)

const { HANDLE_REQUEST: handleRequest } = await expose<WorkerResolvers>(
  {},
  {
    local: worker,
    remote: worker,
    key: 'yoga'
  }
)

export {
  handleRequest
}
