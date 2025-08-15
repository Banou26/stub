import type { Resolvers as WorkerResolvers } from './worker/utils'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'
// import { fetch } from './utils/fetch'

const worker = new Worker()

const resolvers = {
  FETCH: async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init)
    return {
      headers: Object.fromEntries(res.headers.entries()),
      body: res.body
    }
  }
}

export type Resolvers = typeof resolvers

const { HANDLE_REQUEST: handleRequest } = await expose<WorkerResolvers>(
  resolvers,
  { local: worker, remote: worker }
)

export {
  handleRequest
}
