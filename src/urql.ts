import { makeScannarr2 } from 'scannarr'
import { targets } from 'laserr'

import { fetch } from './utils/fetch'

export const { client } = makeScannarr2({
  origins: targets,
  context: async () => ({
    fetch
  })
})
