import { makeServer } from 'scannarr'
import { targets } from 'laserr'

import { fetch } from '../utils/fetch'

const { server, link } = makeServer({
  // @ts-expect-error
  context: () => ({
    // @ts-expect-error
    fetch: (...args) => fetch(...args)
  }),
  resolversList: [
    ...targets.map(({ resolvers }) => resolvers)
  ],
  originPriority: ['anilist', 'mal', 'cr']
})

server.start()

export default server
export { link }

