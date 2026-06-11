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

const RETRYABLE_STATUSES = new Set([429, 503])
const MAX_RETRIES = 2
const MAX_RETRY_DELAY_MS = 15_000

const retryDelay = (response: Response, attempt: number) => {
  const header = response.headers.get('retry-after')
  const seconds = Number(header)
  const headerMs =
    header && Number.isFinite(seconds) ? seconds * 1_000
    : header ? new Date(header).getTime() - Date.now()
    : NaN
  const delay = Number.isFinite(headerMs) && headerMs > 0 ? headerMs : 1_000 * 2 ** attempt
  return Math.min(delay, MAX_RETRY_DELAY_MS)
}

export const fetchWithBackoff = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init)
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_RETRIES) return response
    await new Promise(resolve => setTimeout(resolve, retryDelay(response, attempt)))
  }
}
