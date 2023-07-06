import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { useParams } from 'react-router-dom'
import { declarativeNetRequestUpdateDynamicRules } from '@fkn/lib'

import { gql } from '../generated'
import { Uri, mergeScannarrUris } from '../../../../scannarr/src/utils'
import { GET_MEDIA } from './anime/preview-modal'
import { useEffect } from 'react'

const style = css`

`

export const GET_MEDIA_EPISODE = gql(`#graphql
  query GetMediaEpisode($uri: String!, $origin: String, $id: String) {
    Episode(uri: $uri, origin: $origin, id: $id) {
      handler
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
      handles {
        edges {
          node {
            handler
            origin
            id
            uri
          }
        }
      }
      playback {
        edges {
          node {
            type
            url
            uri
            origin
            data
          }
        }
      }
    }
  }
`)

export default () => {
  const { mediaUri, episodeUri } = useParams() as { mediaUri: Uri, episodeUri: Uri }
  const episodeId = episodeUri.split('-')[1]
  console.log('mediaUri', mediaUri)
  console.log('episodeUri', episodeUri)
  console.log('episodeId', episodeId)
  const uri = mergeScannarrUris([mediaUri, episodeUri])
  console.log('uri', uri)
  // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  const { error: error2, data: { Episode: episode } = {} } = useQuery(
    GET_MEDIA_EPISODE,
    {
      variables: { uri },
      skip: !uri
    }
  )
  console.log('episode', episode)
  // if (error) console.error(error)
  if (error2) console.error(error2)

  return (
    <div css={style}>
    </div>
  )
}
