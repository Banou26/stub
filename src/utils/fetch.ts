import { serverProxyFetch } from '@fkn/lib'

export const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  serverProxyFetch(input, init)
