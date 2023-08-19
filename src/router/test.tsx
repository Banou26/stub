import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fromScannarrUri } from 'scannarr/src/utils/uri2'
// import { useQuery as useApolloQuery } from '@apollo/client'
import { gql, useQuery } from 'urql'

// import PreviewModal, { GET_MEDIA } from './anime/preview-modal'


const GET_TEST = `#graphql
  fragment GetMediaTestFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    description
    shortDescription
    popularity
    averageScore
    episodeCount
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
  }

  query GetMediaTest($uri: String!, $origin: String, $id: String) {
    Media(uri: $uri, origin: $origin, id: $id) {
      ...GetMediaTestFragment
      handles {
        edges @stream {
          node {
            ...GetMediaTestFragment
            handles {
              edges {
                node {
                  origin
                  id
                  uri
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`

export default () => {


  // return <img src="https://artworks.thetvdb.com/banners/v4/episode/9862554/screencap/64c56a26d211f.jpg"/>
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')

  useEffect(() => {
    if (mediaUri) return
    setSearchParams({ details: `scannarr:(mal:54112,anizip:17806,anilist:159831,animetosho:17806,cr:GJ0H7QGQK,anidb:17806,kitsu:46954,notifymoe:fJAnfp24g,livechart:11767,tvdb:429310)` })
  }, [mediaUri, setSearchParams])

  const [result] = useQuery({
    query: GET_TEST,
    variables: {
      uri: mediaUri
    },
    pause: !mediaUri
  })
  // console.log('result', result, result.hasNext)
  const { origin, id, url, ...rest } = result.data?.Media || {}

  console.log('data', rest)

  useEffect(() => {
    if (result.fetching || result.hasNext || result.hasNext === undefined || !result.data?.Media.uri) return
    setSearchParams({ details: result.data?.Media.uri })
  }, [result.hasNext, result.data?.Media.uri, setSearchParams])

  // return <PreviewModal/>
  return null
}
