import { serverProxyFetch } from '@fkn/lib'

export const fetch: typeof globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => serverProxyFetch(input, init)
