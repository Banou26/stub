import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'
import type { RouteParams } from '../path'

import { css } from '@emotion/react'
import {
  FloatingFocusManager, FloatingOverlay, FloatingPortal,
  useClick, useFloating, useInteractions
} from '@floating-ui/react'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useSubscription } from 'urql'
import { Redirect, useParams } from 'wouter'

import { gql } from '../../generated'
import { AggregatedUri, matchAggregatedUris } from '../../utils/uri'
import { YoutubeMinimalPlayer } from '../../components/yt-minimal-player'
import { LucidePause, LucidePlay } from 'lucide-react'
import { VolumeControl } from '../../components/volume-control'

const style = css`
padding: 5rem;
background-color: hsla(0, 0%, 0%, 0.439);
animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 120rem;
  height: 200rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  margin: auto;

  .trailer {
    position: relative;
    width: 120rem;
    overflow: hidden;
    height: 67.5rem;
    .player {
      border-radius: 1rem 1rem 0 0;
      width: 120rem;
      overflow: hidden;
      height: 67.5rem;
      user-select: none;

      youtube-video {
        grid-area: container;
        pointer-events: none;
        margin-top: -11rem !important;
        height: 89.25rem !important;
      }
    }
    .player-controls {
      position: absolute;
      bottom: 0rem;
      padding: 2.5rem;
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
  }

  .content {
    padding: 2.5rem;
    .title {
      font-size: 2rem;
      font-weight: 600;
    }

    .description {
      margin-top: 1.5rem;
    }
  }
}
`

const GET_MEDIA_MODAL = gql(`
  subscription GetMediaModal($input: MediaInput!) {
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

export default ({ mediaNodes }: { mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }) => {
  const params = useParams<RouteParams['MEDIA']>()
  const media = mediaNodes.find(media => matchAggregatedUris(media.uri as AggregatedUri, params.uri as AggregatedUri))
  const [{ data }] = useSubscription({
    query: GET_MEDIA_MODAL,
    variables: {
      input: {
        uri: media?.uri
      }
    },
    pause: !media
  })

  const title = useMemo(() => media?.titles?.at(0)?.title, [media])
  const description = useMemo(() => media?.descriptions?.at(0)?.description, [media])
  const shortDescription = useMemo(() => media?.shortDescriptions?.at(0)?.shortDescription, [media])
  const trailer = useMemo(() => media?.trailers?.at(0), [media])

  useEffect(() => {
    console.log('media', media)
  }, [media])

  const [open, onOpenChange] = useState(Boolean(params))
  const { refs, context } = useFloating({
    open,
    onOpenChange: (_, ev) => {
      if (ev?.target !== refs.reference.current) return
      onOpenChange(false)
    }
  })
  const click = useClick(context)
  const {getReferenceProps, getFloatingProps} = useInteractions([click])

  const [playerPaused, setPlayerPaused] = useState(false)
  const [playerMuted, setPlayerMuted] = useState(true)
  const [playerVolume, setPlayerVolume] = useState(0.25)

  if (!open) return <Redirect to="/" />

  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll css={style} ref={refs.setReference} {...getReferenceProps()}>
        <FloatingFocusManager context={context}>
          <div className="modal" ref={refs.setFloating} {...getFloatingProps()}>
            <div className="trailer">
              {
                trailer?.url && (
                  <YoutubeMinimalPlayer
                    url={trailer?.url}
                    className="player"
                    paused={playerPaused}
                    volume={playerMuted ? 0 : playerVolume}
                  />
                )
              }
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
            </div>
            <div className="content">
              <div className="title">{title}</div>
              <div className="description">{shortDescription}</div>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}
