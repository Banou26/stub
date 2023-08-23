import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fromScannarrUri } from 'scannarr/src/utils/uri2'
// import { useQuery as useApolloQuery } from '@apollo/client'
import { gql, useQuery } from 'urql'

import PreviewModal, { GET_MEDIA } from './anime/preview-modal'
import { getCurrentSeason } from '../../../../laserr/src/targets/anilist'
import { MediaSort } from 'scannarr/src'


const GET_TEST = `#graphql
  # fragment GetEpisodeTestFragment on Episode {
  #   origin
  #   id
  #   uri
  #   url

  #   airingAt
  #   number
  #   mediaUri
  #   timeUntilAiring
  #   thumbnail
  #   title {
  #     romanized
  #     english
  #     native
  #   }
  #   description
  # }

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
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
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
    # episodes {
    #   edges {
    #     node {
    #       ...GetEpisodeTestFragment
    #     }
    #   }
    # }
  }

  query GetMediaTest ($season: MediaSeason!, $seasonYear: Int!, $sort: [MediaSort]!) {
    Page {
      media(season: $season, seasonYear: $seasonYear, sort: $sort) {
        ...GetMediaTestFragment
        handles {
          edges {
            node {
              ...GetMediaTestFragment
              # handles {
              #   edges {
              #     node {
              #       origin
              #       id
              #       uri
              #       url
              #     }
              #   }
              # }
              # episodes {
              #   edges {
              #     node {
              #       handles {
              #         edges {
              #           node {
              #             ...GetEpisodeTestFragment
              #           }
              #         }
              #       }
              #     }
              #   }
              # }
            }
          }
        }
        # episodes {
        #   edges {
        #     node {
        #       ...GetEpisodeTestFragment
        #       handles {
        #         edges {
        #           node {
        #             ...GetEpisodeTestFragment
        #           }
        #         }
        #       }
        #     }
        #   }
        # }
      }
    }
  }
`

export default () => {
  // return <PreviewModal/>

  // return <img src="https://artworks.thetvdb.com/banners/v4/episode/9862554/screencap/64c56a26d211f.jpg"/>
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')

  useEffect(() => {
    if (mediaUri) return
    setSearchParams({ details: `scannarr:(mal:54112,anizip:17806,anilist:159831,animetosho:17806,cr:GJ0H7QGQK,anidb:17806,kitsu:46954,notifymoe:fJAnfp24g,livechart:11767,tvdb:429310)` })
  }, [mediaUri, setSearchParams])

  const currentSeason = getCurrentSeason()

  const [result] = useQuery({
    query: GET_TEST,
    variables: {
      season: currentSeason.season,
      seasonYear: currentSeason.year,
      sort: [MediaSort.Popularity]
    },
    pause: !mediaUri
  })

  console.log('data', result.data)

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
