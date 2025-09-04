import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useCallback, useMemo, useState } from 'preact/compat'

import { gql } from '../../generated'
import { getEllipsedDescription, parseTextDescription } from './utils'
import { YoutubeMinimalPlayer } from '../../components/yt-minimal-player'

const style = css`
height: 70vh;
.theater-content {
  position: absolute;
  width: 100%;
  height: calc(100vh - 5rem);

  .shadow {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 30vh;

    background:
      linear-gradient(
        0deg,
        rgba(15, 15, 15, 1) 0%,
        rgba(15, 15, 15, 0.5) calc(100% - 10rem),
        rgba(15, 15, 15, 0) 100%
      );
  }
}
`

const GET_THEATHER_MEDIA = gql(`
  subscription GetTheatherMedia($input: MediaInput!) {
    media(input: $input) {
      uri
      _id
      titles {
        language
        title
        score
      }
      descriptions {
        language
        description
      }
      shortDescriptions {
        language
        shortDescription
      }
      covers {
        language
        url
      }
      banners {
        language
        url
      }
      popularity
    }
  }
`)


const HomeHeader = ({ mediaNodes }: { mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }) => {
  const hasHighQualityMedia = mediaNodes.some((media) => media.score && media.score >= 0.8)
  const [bannedMediaIndexes, setBannedMediaIndexes] = useState<number[]>([])
  const mediaIndex = useMemo(() => {
    let index = Math.floor(Math.random() * Math.min(10, mediaNodes.length ?? 0))
    while (bannedMediaIndexes.includes(index)) {
      index = Math.floor(Math.random() * Math.min(10, mediaNodes.length ?? 0))
    }
    return index
  }, [hasHighQualityMedia, mediaNodes.length >= 10, bannedMediaIndexes])
  const theaterMedia = useMemo(() => hasHighQualityMedia ? mediaNodes.at(mediaIndex) : undefined, [hasHighQualityMedia, mediaNodes, mediaIndex])
  const trailer = useMemo(() => theaterMedia?.trailers?.at(0), [theaterMedia])
  // todo: re-impl media details loading for the theater
  // const [{ data }] = useSubscription({
  //   query: GET_THEATHER_MEDIA,
  //   variables: {
  //     input: {
  //       uri: theaterMedia?.uri
  //     }
  //   },
  //   pause: !theaterMedia || Boolean(trailer)
  // })

  const description = theaterMedia?.descriptions?.at(0)

  const descriptionText = useMemo(
    () => description ? parseTextDescription(description.description) : undefined,
    [description]
  )

  const ellipsedDescriptionText = useMemo(
    () => getEllipsedDescription(descriptionText),
    [descriptionText]
  )

  const [headerTrailerPaused, setHeaderTrailerPaused] = useState(Boolean(trailer))

  const onTrailerError = useCallback(() => {
    setBannedMediaIndexes([...bannedMediaIndexes, mediaIndex])
  }, [bannedMediaIndexes, mediaIndex])

  return (
    <div css={style} className='theater'>
      <div className="theater-content" css={style}>
        <div className="player-wrapper">
          {
            trailer?.url && (
              <YoutubeMinimalPlayer
                url={trailer.url}
                paused={headerTrailerPaused}
                onError={onTrailerError}
                className="player"
              />
            )
          }
          <div className="shadow"/>
        </div>
      </div>
    </div>
  )
}

export default HomeHeader
