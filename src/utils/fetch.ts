import type { FetchType } from '../../../../scannarr/src'

import { fetch } from '@fkn/lib'

export const cachedDelayedFetch: FetchType = (input, init) =>
  fetch(
    input,
    {
      ...init,
      proxyCache: (1000 * 60 * 60 * 5).toString(),
      proxyDelay: (500).toString()
    }
  )