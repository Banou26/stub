import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useCallback, useMemo, useState } from 'preact/compat'
import { LucidePause, LucidePlay } from 'lucide-react'

import { gql } from '../../generated'
import { YoutubeMinimalPlayer } from '../../components/yt-minimal-player'
import { VolumeControl } from '../../components/volume-control'
import { useRoute } from 'wouter'
import { getRouterRoutePath, Route } from '../path'
import TextEllipsis from '../../components/text-ellipsis'

const style = css`
height: 70vh;
.player-wrapper {
  position: absolute;
  width: 100%;
  height: calc(100vh - 5rem);
  user-select: none;

  youtube-video {
    height: 250vh !important;
    width: 100% !important;
    margin-top: -75vh;
  }

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
    overflow: hidden;
    max-height: 10rem;
    white-space: pre-wrap;
  }
}
`

const GET_THEATHER_MEDIA = gql(`
  subscription GetTheatherMedia($input: MediaInput!, $shortDescriptionInput: MediaShortDescriptionInput!) {
    media(input: $input) {
      ...MediaFragment
      titles {
        language
        title
        score
      }
      shortDescriptions(input: $shortDescriptionInput) {
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
  const [matchMediaRoute] = useRoute(getRouterRoutePath(Route.MEDIA))
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
      },
      shortDescriptionInput: {
        count: 1
      }
    },
    pause: !selectedMedia
  })
  const theaterMedia = data?.media ?? selectedMedia

  // todo: instead of just selecting 0, should make a query that selects the wanted language and sort by score
  const title = useMemo(() => theaterMedia?.titles?.at(0)?.title, [theaterMedia])
  const shortDescription = useMemo(() => theaterMedia?.shortDescriptions?.at(0)?.shortDescription, [theaterMedia])
  const trailer = useMemo(() => theaterMedia?.trailers?.at(0), [theaterMedia])

  const [playerPaused, setPlayerPaused] = useState(false)
  const [playerMuted, setPlayerMuted] = useState(true)
  const [playerVolume, setPlayerVolume] = useState(0.25)

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
              paused={playerPaused || matchMediaRoute}
              onError={onTrailerError}
              volume={playerMuted ? 0 : playerVolume}
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
          <VolumeControl
            defaultMuted={playerMuted}
            onMutedUpdate={setPlayerMuted}
            defaultVolume={playerVolume}
            onVolumeUpdate={volume => setPlayerVolume(volume)}
          />
        </div>
        <div className="title">{title}</div>
        <TextEllipsis className="short-description">
          {shortDescription}
        </TextEllipsis>
      </div>
    </div>
  )
}

export default HomeHeader
