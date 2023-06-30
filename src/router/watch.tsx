import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { useParams } from 'react-router-dom'
import { declarativeNetRequestUpdateDynamicRules } from '@fkn/lib'

import { gql } from '../generated'
import { Uri } from '../../../../scannarr/src/utils'
import { GET_MEDIA } from './anime/preview-modal'
import { useEffect } from 'react'

const style = css`

`

export const GET_MEDIA_EPISODE = gql(`
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
        type
        url
        uri
        origin
        data
      }
    }
  }
`)

export default () => {
  const { episodeUri, uri } = useParams() as { episodeUri: Uri, uri: Uri }
  const mediaUri = episodeUri.split('-')[0]
  console.log('episodeUri', episodeUri, uri)

  return (
    <div css={style}>
    </div>
  )
}
