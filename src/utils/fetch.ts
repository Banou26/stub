import type { FetchType } from '../../../../scannarr/src'

import { fetch } from '@fkn/lib'

export const cachedFetch: FetchType = (input, init) =>
  fetch(
    input.toString(),
    {
      ...init,
      proxyCache: (1000 * 60 * 60 * 5).toString()
    }
  )
