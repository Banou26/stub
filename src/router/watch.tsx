import { css } from '@emotion/react'
import { Uri } from '../../../../scannarr/src/utils'
import { useQuery } from '@apollo/client'
import { GET_MEDIA } from './anime/preview-modal'
import { useParams } from 'react-router-dom'

const style = css`

`

export default () => {
  const { episodeUri, uri } = useParams() as { episodeUri: Uri, uri: Uri }
  const mediaUri = episodeUri.split('-')[0]
  const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA_EPISODE, { variables: { uri: mediaUri! }, skip: !mediaUri })

  return (
    <div css={style}>
      {

      }
    </div>
  )
}
