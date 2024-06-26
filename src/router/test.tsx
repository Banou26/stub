import { useMemo } from 'react'
import { gql, useQuery, useSubscription } from 'urql'

import { GraphQLTypes } from 'scannarr'
// import { GET_CURRENT_SEASON } from './anime/season'
import { getCurrentSeason } from 'laserr/src/targets/anilist'
// import { GET_PREVIEW_MODAL_MEDIA } from './anime/preview-modal'
import { useLocation, useSearch } from 'wouter'


// export const GET_LATEST_EPISODES = `#graphql
//   fragment GetLatestEpisodesEpisodeFragment on Episode {
//     origin
//     id
//     uri
//     url

//     number
//     mediaUri
//     media {
//       handles {
//         edges {
//           node {
//             uri
//           }
//         }
//       }

//       origin
//       id
//       uri

//       url
//       title {
//         romanized
//         english
//         native
//       }
//       coverImage {
//         color
//         default
//         extraLarge
//         large
//         medium
//         small
//       }
//       bannerImage
//     }
//     title {
//       romanized
//       english
//       native
//     }
//     description
//     airingAt
//     thumbnail
//   }

//   query GetLatestEpisodes($input: EpisodePageInput!) {
//     episodePage(input: $input) {
//       nodes {
//         handles {
//           edges @stream {
//             node {
//               handles {
//                 edges {
//                   node {
//                     uri
//                   }
//                 }
//               }
//               ...GetLatestEpisodesEpisodeFragment
//             }
//           }
//         }
//         ...GetLatestEpisodesEpisodeFragment
//       }
//     }
//   }
// `

// const query = gql`
//   query GetEpisodeTest($input: EpisodePageInput!) {
//     episodePage(input: $input) {
//       nodes {
//         uri
//         handles {
//           edges @stream {
//             node {
//               uri
//               media {
//                 uri
//               }
//             }
//           }
//         }
//         media {
//           uri
//           handles {
//             edges {
//               node {
//                 uri
//               }
//             }
//           }
//         }
//       }
//     }
//   }
// `


export default () => {
  // const [lastEpisodesResult] = useQuery({
  //   query: GET_LATEST_EPISODES,
  //   variables: { sort: ['LATEST'] }
  // })

  // console.log('lastEpisodesResult', lastEpisodesResult.data?.Page.episode[0], lastEpisodesResult.data?.Page.episode[0]?.media, lastEpisodesResult)

  // return (
  //   <div>
  //     <pre>{JSON.stringify(lastEpisodesResult.data, null, 2)}</pre>
  //   </div>
  // )


  // const currentSeason = useMemo(() => getCurrentSeason(), [])
  // const [currentSeasonResult] = useQuery(
  //   {
  //     query: GET_CURRENT_SEASON,
  //     variables: {
  //       input: {
  //         season: currentSeason.season,
  //         seasonYear: currentSeason.year,
  //         sorts: [GraphQLTypes.MediaSort.Popularity]
  //       }
  //     }
  //   }
  // )

  // console.log('currentSeasonResult', currentSeasonResult.data)
  // const searchParams = new URLSearchParams(useSearch())
  // const mediaUri = searchParams.get('details')
  // const [fooResult] = useSubscription(
  //   {
  //     query: GET_PREVIEW_MODAL_MEDIA,
  //     variables: { input: { uri: mediaUri! } },
  //     pause: !mediaUri
  //   }
  // )
  // console.log('fooResult', fooResult?.data?.media?.episodes, fooResult?.data?.media, fooResult.error)
  return


  // const [searchParams, setSearchParams] = useSearchParams()
  // const mediaUri = searchParams.get('details')
  // useEffect(() => {
  //   if (mediaUri) return
  //   setSearchParams({ details: `scannarr:(mal:54112,anizip:17806,anilist:159831,animetosho:17806,cr:GJ0H7QGQK,anidb:17806,kitsu:46954,notifymoe:fJAnfp24g,livechart:11767,tvdb:429310)` })
  // }, [mediaUri, setSearchParams])

  // return <PreviewModal/>

  // return <img src="https://artworks.thetvdb.com/banners/v4/episode/9862554/screencap/64c56a26d211f.jpg"/>

  // const currentSeason = getCurrentSeason()

  // const [result] = useQuery({
  //   query: GET_TEST,
  //   variables: {
  //     season: currentSeason.season,
  //     seasonYear: currentSeason.year,
  //     sort: [MediaSort.Popularity]
  //   },
  //   pause: !mediaUri
  // })

  // console.log('data', result.data)

  // console.log('result', result, result.hasNext)
  // const { origin, id, url, ...rest } = result.data?.Media || {}

  // if (result.error) console.error(result.error)

  // console.log('data', rest)
  // console.log('episode', rest?.episodes?.edges?.[0]?.node)

  // useEffect(() => {
  //   if (result.fetching || result.hasNext || result.hasNext === undefined || !result.data?.Media.uri) return
  //   setSearchParams({ details: result.data?.Media.uri })
  // }, [result.hasNext, result.data?.Media.uri, setSearchParams])

  return null
}
