import { serverProxyFetch } from '@fkn/lib'

export const fetch: typeof globalThis.fetch = (input, init) => serverProxyFetch(input, init)
