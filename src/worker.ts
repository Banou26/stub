import type { Resolvers } from './worker/index'

import { expose }  from 'osra'

// @ts-expect-error
import WORKER_URL from './worker/index?url'

const worker = new Worker(WORKER_URL, { type: 'module' })

const { HANDLE_REQUEST } = await expose<Resolvers>(
  {},
  { local: worker, remote: worker }
)
