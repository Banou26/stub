import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { useParams } from 'react-router-dom'

import { gql } from '../generated'
import { Uri } from '../../../../scannarr/src/utils'
import { GET_MEDIA } from './anime/preview-modal'

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
    }
  }
`)

export default () => {
  const { episodeUri, uri } = useParams() as { episodeUri: Uri, uri: Uri }
  const mediaUri = episodeUri.split('-')[0]
  // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  const { error: error2, data: { Episode: episode } = {} } = useQuery(GET_MEDIA_EPISODE, { variables: { uri: episodeUri! }, skip: !episodeUri })

  // if (error) console.error(error)
  if (error2) console.error(error2)

  // console.log('media', media)
  console.log('episode', episode)

  return (
    <div css={style}>
      {

      }
    </div>
  )
}
