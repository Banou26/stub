import type { FetchInit } from '../worker/backoff'

import { cloud } from '@fkn/lib'

export const fetch = (input: RequestInfo | URL, init?: FetchInit) =>
  cloud.fetch(input, init)
