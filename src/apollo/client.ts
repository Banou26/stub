import { ApolloClient, InMemoryCache } from '@apollo/client'

import cache from './cache'
// import { link } from './server'

import { targets } from 'laserr'
import { makeScannarr } from 'scannarr'

import { fetch } from '../utils/fetch'

const { client } = makeScannarr({
  origins: targets,
  context: async () => ({
    fetch: (...args: Parameters<typeof window.fetch>) => fetch(...args)
  }),
  policies: {
    Media: {
      description: {
        // todo: fix the priority, seems to be fucked
        originPriority: ['animetosho', 'mal', 'anilist', 'cr'],
        merge: (existing, incoming) => incoming
      }
    }
  }
})

// const client = new ApolloClient({
//   cache,
//   // @ts-expect-error
//   link
// })

export default client
