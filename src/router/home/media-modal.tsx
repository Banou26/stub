import { MediaDescriptionContentType, type GetReleasingMediaPageSubscription } from '../../generated/graphql'
import type { RouteParams } from '../path'

import { css } from '@emotion/react'
import {
  FloatingFocusManager, FloatingOverlay, FloatingPortal,
  useClick, useFloating, useInteractions
} from '@floating-ui/react'
import { useMemo, useState } from 'preact/hooks'
import { useSubscription } from 'urql'
import { Redirect, useParams } from 'wouter'

import { gql } from '../../generated'
import { AggregatedUri, fromAggregatedUri, isAggregatedUri, isUri, matchAggregatedUris } from '../../utils/uri'
import { YoutubeMinimalPlayer } from '../../components/yt-minimal-player'
import { LucidePause, LucidePlay } from 'lucide-react'
import { VolumeControl } from '../../components/volume-control'
import { getRoutePath, Route } from '../path'
import { EPISODE_FRAGMENT } from '../../worker/resolvers/episode/fragment'
import { MEDIA_FRAGMENT } from '../../worker/resolvers/media/fragment'

const style = css`
padding: 5rem;
background-color: hsla(0, 0%, 0%, 0.439);
animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 120rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  margin: auto;

  .trailer {
    position: relative;
    overflow: hidden;
    height: 67.5rem;
    .player {
      border-radius: 1rem 1rem 0 0;
      overflow: hidden;
      height: 67.5rem;
      user-select: none;

      youtube-video {
        grid-area: container;
        pointer-events: none;
        margin-top: -21.5rem !important;
        height: 110.25rem !important;
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

  & > .content {
    padding: 2.5rem;
    & > .title {
      font-size: 3rem;
      font-weight: 600;
    }

    .description {
      white-space: pre-wrap;
      margin-top: 2.5rem;
    }

    .episodes {
      margin-top: 4rem;
      border-top: 0.1rem solid rgba(255, 255, 255, 0.1);
      .episode {
        display: flex;
        height: 7rem;
        border-bottom: 0.1rem solid rgba(255, 255, 255, 0.1);
        color: rgb(255, 255, 255);
        text-decoration: none;
        overflow: hidden;
        height: 10rem;
        cursor: pointer;

        .number {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: bold;
          min-width: 7.5rem;
        }

        .thumbnail {
          margin: auto 0;
          height: 7.5rem;
          background-color: rgba(255, 255, 255, .1);
          border-radius: .5rem;
          margin-right: 2.5rem;
        }

        .content {
          display: flex;
          align-items: center;

          .title {
            font-size: 2rem;
            font-weight: bold;
          }
        }
      }
    }
  }
}
`

const GET_MEDIA_MODAL = gql(`
  subscription GetMediaModal($input: MediaInput!, $descriptionInput: MediaDescriptionInput!) {
    media(input: $input) {
      ...MediaFragment
      titles {
        language
        title
        score
      }
      descriptions(input: $descriptionInput) {
        language
        description
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
      episodes {
        ...EpisodeFragment
        episodeNumber
        titles {
          title
        }
        thumbnails {
          url
        }
      }
      handles {
        episodes {
            ...EpisodeFragment
        }
      }
      episodeCount
    }
  }
`)

const MediaModal = ({ mediaNodes }: { mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }) => {
  const params = useParams<RouteParams['MEDIA']>()
  const foundMedia = mediaNodes.find(media => matchAggregatedUris(media.uri as AggregatedUri, params.uri as AggregatedUri))
  const [{ data }] = useSubscription({
    query: GET_MEDIA_MODAL,
    variables: {
      input: {
        uri: foundMedia?.uri
      },
      descriptionInput: {
        type: MediaDescriptionContentType.Html,
        count: 1
      }
    },
    pause: !foundMedia
  })
  const media = data?.media ?? foundMedia
  const title = useMemo(() => media?.titles?.at(0)?.title, [media])
  const description = useMemo(() => media && 'descriptions' in media && media?.descriptions?.at(0)?.description, [media])
  const trailer = useMemo(() => media?.trailers?.at(0), [media])

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

  if (media?.uri && isAggregatedUri(media.uri) && params.uri && isAggregatedUri(params.uri)) {
    const mediaAggregatedUris = fromAggregatedUri(media.uri)?.handleUris ?? []
    const paramsAggregatedUris = fromAggregatedUri(params.uri)?.handleUris ?? []
    if (mediaAggregatedUris.length > paramsAggregatedUris.length) {
      return <Redirect to={getRoutePath(Route.MEDIA, { uri: media.uri })} replace={true} />
    }
  }
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
              {/* todo: implement an expandable description */}
              { description ? <div className="description" dangerouslySetInnerHTML={{ __html: description }} /> : undefined}
              <div className="episodes">
                {
                  media &&
                  'episodes' in media &&
                  media
                    .episodes
                    ?.map((episode, index) =>
                      <div className="episode">
                        <div className="number">{episode.episodeNumber}</div>
                        {
                          episode.thumbnails?.at(0)
                            ? <img className="thumbnail" src={episode.thumbnails?.at(0)?.url}></img>
                            : undefined
                        }
                        {
                          episode.titles?.length
                            ? (
                              <div className="content">
                                <div className="title">{episode.titles.at(0)?.title}</div>
                              </div>
                            )
                            : (
                              <div className="content">
                                <div className="title">Episode {index + 1}</div>
                              </div>
                            )
                        }
                        <div className="date"></div>
                      </div>
                    )
                }
              </div>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}

export default MediaModal
