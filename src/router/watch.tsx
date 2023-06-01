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
  // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  const { error: error2, data: { Episode: episode } = {} } = useQuery(GET_MEDIA_EPISODE, { variables: { uri: episodeUri! }, skip: !episodeUri })
  console.log('episode', episode)
  // if (error) console.error(error)
  if (error2) console.error(error2)

  // console.log('media', media)

  useEffect(() => {
    // console.log('requesting access', requestAccess())
    console.log(
      'declarativeNetRequestUpdateDynamicRules',
      declarativeNetRequestUpdateDynamicRules(
        {
          addRules:
            [
              {
                id: 1,
                priority: 1,
                action: {
                  type: 'modifyHeaders',
                  responseHeaders: [{
                    header: 'Content-Security-Policy',
                    operation: 'set',
                    value: `frame-ancestors 'self' *;`
                  }]
                },
                condition: {
                  urlFilter: 'https://static.crunchyroll.com/vilos-v2/web/vilos/player.html',
                  resourceTypes: ['sub_frame']
                }
              }
            ]
        }
      )
    )
  }, [])

  return (
    <div css={style}>
      {
        episode?.playback?.url
          ? (
            // <iframe src="https://www.crunchyroll.com/affiliate_iframeplayer?aff=af-44915-aeey&amp;media_id=810793&amp;video_format=0&amp;video_quality=0&amp;auto_play=0" width="720" height="480" allowfullscreen="" allow="encrypted-media"></iframe>
            <iframe
              src="https://www.crunchyroll.com/affiliate_iframeplayer?aff=af-44915-aeey&media_id=854994&video_format=0&video_quality=0&auto_play=0"
              width="720"
              height="480"
              allowFullScreen={true}
              allow="encrypted-media"
            />
          )
          : undefined
      }
    </div>
  )
}
