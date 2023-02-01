import type { FetchType } from '../../../../scannarr/src'

import { serverProxyFetch } from '@fkn/lib'

export const cachedFetch: FetchType = (input, init) =>
  serverProxyFetch(
    input.toString(),
    {
      ...init,
      proxyCache: (1000 * 60 * 60 * 5).toString()
    }
  )
