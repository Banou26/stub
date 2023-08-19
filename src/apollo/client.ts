import { ApolloClient, InMemoryCache } from '@apollo/client'

import cache from './cache'
// import { link } from './server'

import { targets } from 'laserr'
import { makeScannarr } from 'scannarr'

import { fetch } from '../utils/fetch'
// import { gql } from '../generated'

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


// setTimeout(async () => {
//   const p = performance.now()
//   const res =
//     client
//       .query({
//         query: gql(`#graphql
//         query GetMediaTest($uri: String!, $origin: String, $id: String) {
//           Media(uri: $uri, origin: $origin, id: $id) {
//             handler
//             origin
//             id
//             uri
//             url
//             title {
//               romanized
//               english
//               native
//             }
//             handles {
//               edges {
//                 node {
//                   handler
//                   origin
//                   id
//                   uri
//                   url
//                   title {
//                     romanized
//                     english
//                     native
//                   }
//                 }
//               }
//             }
//           }
//         }
//     `), variables: { uri: 'scannarr:bWFsOjU0MTEyLGFuaXppcDoxNzgwNixhbmlsaXN0OjE1OTgzMSxhbmltZXRvc2hvOjE3ODA2LGNyOkdKMEg3UUdRSyxhbmlkYjoxNzgwNixraXRzdTo0Njk1NCxub3RpZnltb2U6ZkpBbmZwMjRnLGxpdmVjaGFydDoxMTc2Nyx0dmRiOjQyOTMxMA==' }
//       })

//   console.log('res', res)
//   console.log('done apollo', performance.now() - p)
// }, 3000)


// const client = new ApolloClient({
//   cache,
//   // @ts-expect-error
//   link
// })

export default client
