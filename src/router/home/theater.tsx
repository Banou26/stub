import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useCallback, useMemo, useState } from 'preact/compat'

import { gql } from '../../generated'
import { YoutubeMinimalPlayer } from '../../components/yt-minimal-player'
import { LucidePause, LucidePlay, Volume } from 'lucide-react'

const style = css`
height: 70vh;
.player-wrapper {
  position: absolute;
  width: 100%;
  height: calc(100vh - 5rem);
  user-select: none;
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

.information {
  position: absolute;
  inset: 0;
  left: 10rem;
  max-width: 75rem;
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;

  .player-controls {
    padding: 2.5rem 0;
    display: flex;
    align-items: center;
    gap: 1rem;

    & > span {
      position: relative;
      width: 3rem;
      height: 3rem;
      cursor: pointer;

      .icon-body {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      .icon-outline {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
    }
  }

  .title {
    font-size: 4rem;
    font-weight: bold;
    margin-bottom: 1rem;
    user-select: none;
  }

  .short-description {
    font-size: 2rem;
    margin-bottom: 1rem;
    user-select: none;
  }
}
`

const GET_THEATHER_MEDIA = gql(`
  subscription GetTheatherMedia($input: MediaInput!) {
    media(input: $input) {
      _id
      uri
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
      trailers {
        uri
        origin
        id
        url
        thumbnail
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
  const selectedMedia = useMemo(() => hasHighQualityMedia ? mediaNodes.at(mediaIndex) : undefined, [hasHighQualityMedia, mediaNodes, mediaIndex])
  const [{ data }] = useSubscription({
    query: GET_THEATHER_MEDIA,
    variables: {
      input: {
        uri: selectedMedia?.uri
      }
    },
    pause: !selectedMedia
  })
  const theaterMedia = data?.media ?? selectedMedia

  // todo: instead of just selecting 0, should make a query that selects the wanted language and sort by score
  const title = useMemo(() => theaterMedia?.titles?.at(0)?.title, [theaterMedia])
  const shortDescription = useMemo(() => theaterMedia?.shortDescriptions?.at(0)?.shortDescription, [theaterMedia])
  const trailer = useMemo(() => theaterMedia?.trailers?.at(0), [theaterMedia])

  const [playerPaused, setPlayerPaused] = useState(Boolean(trailer))

  const onTrailerError = useCallback(() => {
    setBannedMediaIndexes([...bannedMediaIndexes, mediaIndex])
  }, [bannedMediaIndexes, mediaIndex])

  return (
    <div css={style} className='theater'>
      <div className="player-wrapper">
        {
          trailer?.url && (
            <YoutubeMinimalPlayer
              url={trailer.url}
              paused={playerPaused}
              onError={onTrailerError}
              className="player"
            />
          )
        }
        <div className="shadow"/>
      </div>
      <div className="information" css={style}>
        <div className="player-controls">
          <span className="playback">
            {
              playerPaused
                ? <LucidePlay className="icon-outline" size={30} strokeWidth={3} color="black" onClick={() => setPlayerPaused(false)} />
                : <LucidePause className="icon-outline" size={30} strokeWidth={3} color="black" onClick={() => setPlayerPaused(true)} />
            }
            {
              playerPaused
                ? <LucidePlay className="icon-body" size={30} onClick={() => setPlayerPaused(false)}/>
                : <LucidePause className="icon-body" size={30} onClick={() => setPlayerPaused(true)}/>
            }
          </span>
          <span className="volume">
            <Volume className="icon-outline" size={30} strokeWidth={3} color="black"/>
            <Volume className="icon-body" size={30}/>
          </span>
        </div>
        <div className="title">{title}</div>
        <div className="short-description">{shortDescription}</div>
      </div>
    </div>
  )
}

export default HomeHeader
