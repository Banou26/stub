import type { Resolvers } from './worker/index'

import { expose }  from 'osra'

// @ts-expect-error
import Worker from './worker/index?worker'

const worker = new Worker()

const { HANDLE_REQUEST } = await expose<Resolvers>(
  {},
  { local: worker, remote: worker }
)
