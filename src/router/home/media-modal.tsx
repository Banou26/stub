import type { GetMediaModalSubscription, GetReleasingMediaPageSubscription } from '../../generated/graphql'
import type { Episode } from '../../generated/schema/types.generated'
import type { RouteParams } from '../path'
import type { WatchSource } from '../../components/source-selector'

import { css } from '@emotion/react'
import {
  FloatingFocusManager, FloatingOverlay, FloatingPortal,
  useClick, useFloating, useInteractions
} from '@floating-ui/react'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { useSubscription } from 'urql'
import { Link, Redirect, useLocation, useParams } from 'wouter'

import { MediaDescriptionContentType, OriginFilter } from '../../generated/graphql'
import YoutubeMinimalPlayer from '../../components/yt-minimal-player'
import { LucidePause, LucidePlay } from 'lucide-react'
import VolumeControl from '../../components/volume-control'
import TextEllipsis from '../../components/text-ellipsis'
import Collapsible from '../../components/collapsible'
import { gql } from '../../generated'
import { AggregatedUri, fromAggregatedUri, isAggregatedUri, isUri, matchAggregatedUris } from '../../utils/uri'
import { getRoutePath, Route } from '../path'
import { getPlayer } from '../../sources/players'
import SourceSelector from '../../components/source-selector'

const style = css`
/* Above the sticky header (z-index 100) + the category bar (z-index 1) so the
   "All/Anime/Series/Movies" tabs don't paint over the modal. Stays below the
   fullscreen source players (z-index 9999999) launched from within it. */
z-index: 1000;
padding: 5rem 1rem;
background-color: hsla(0, 0%, 0%, 0.439);
animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);

@media (min-width: 1024px) {
    padding: 5rem 1rem;
}
@media (min-width: 1440px) {
    padding: 5rem 4rem;
}

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 80rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  margin: auto;

  @media (min-width: 1024px) {
      width: 100rem;
  }
  @media (min-width: 1440px) {
      width: 130rem;
  }
  @media (min-width: 2560px) {
      width: 180rem;
  }


  .trailer {
    --yt-top-margin: -24.5rem;
    --yt-height: 150.25rem;
    --trailer-height: 101rem;
    position: relative;
    overflow: hidden;
    height: var(--trailer-height);
    background-size: cover;
    background-position: center;
    .player {
      border-radius: 1rem 1rem 0 0;
      overflow: hidden;
      height: var(--trailer-height);
      user-select: none;

      youtube-video {
        grid-area: container;
        pointer-events: none;
        margin-top: var(--yt-top-margin) !important;
        height: var(--yt-height) !important;
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
    & > .header {
      display: flex;
      gap: 1rem;

      & > .title {
        font-size: 3rem;
        font-weight: 600;
        cursor: default;
      }

      & > .origins {
        display: flex;
        gap: 1rem;
        align-items: center;

        & > .origin {
          height: 4rem;
          & > img {
            height: 4rem;
            width: 4rem;
          }
        }
      }
    }

    & > .description {
      white-space: pre-wrap;
      margin-top: 2.5rem;
      cursor: default;

      &.collapsed {
        max-height: 20rem;
      }
    }

    .episodes {
      margin-top: 4rem;
      border-top: 0.1rem solid rgba(255, 255, 255, 0.1);
      .episode {
        position: relative;
        display: flex;
        border-bottom: 0.1rem solid rgba(255, 255, 255, 0.1);
        color: rgb(255, 255, 255);
        text-decoration: none;
        overflow: hidden;
        height: 10rem;

        & > .episode-link {
          position: absolute;
          inset: 0;
          z-index: 0;
          color: inherit;
          text-decoration: none;
        }

        &:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }

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
          flex-direction: column;
          /*align-items: center;*/
          justify-content: center;

          & > .header {
            display: flex;

            & > .title {
             font-size: 2rem;
             font-weight: bold;
            }
            & > .origins {
              position: relative;
              z-index: 1;
              display: flex;
              align-items: center;
              margin-left: 1rem;
            }
          }

          & > .description {
            margin-top: 0.5rem;
            max-height: 6rem;
            overflow: hidden;

            * > .ellipsis {
              max-height: 6rem;
              white-space: pre-wrap;
              overflow: hidden;
            }
          }
        }

        .side {
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
        shortDescriptions {
          language
          shortDescription
        }
        thumbnails {
          url
        }
        handles {
          ...EpisodeFragment
          episodeNumber
          titles {
            title
          }
          shortDescriptions {
            language
            shortDescription
          }
          thumbnails {
            url
          }
        }
      }
      handles {
        ...MediaFragment
        handles {
          ...MediaFragment
          episodes {
            ...EpisodeFragment
          }
        }
        episodes {
          ...EpisodeFragment
        }
      }
      episodeCount
    }
  }
`)

const GET_MEDIA_MODAL_ORIGINS = gql(`
  subscription GetMediaModalOrigins($input: OriginPageInput!) {
    originPage(input: $input) {
      nodes {
        ...OriginFragment
      }
    }
  }
`)

const Episode = (
  { episode, index, mediaUri }:
  { episode: NonNullable<GetMediaModalSubscription['media']>['episodes'][number], index: number, mediaUri: string }
) => {
  const origins =
    episode.uri
      ? fromAggregatedUri(episode.uri as AggregatedUri)?.handleUrisValues
      : undefined
  const originIds = [...new Set(origins?.map(origin => origin.origin) ?? [])]
  const [{ data: originData }] = useSubscription({
    query: GET_MEDIA_MODAL_ORIGINS,
    variables: { input: { ids: originIds, filters: [OriginFilter.IsNotApiOnly] } },
    pause: !originIds
  })

  const sources: WatchSource[] = (originData?.originPage?.nodes ?? [])
    .map(origin => {
      const handle = episode?.handles.find(h => h.origin === origin.id)
      const sourceUri = handle?.uri
      const playable = Boolean(getPlayer(origin.id) && handle?.url)
      const watchPath =
        sourceUri && episode.uri
          ? getRoutePath(Route.WATCH, { mediaUri, episodeUri: episode.uri, sourceUri })
          : undefined
      return {
        id: origin.id,
        name: origin.name ?? origin.id,
        icon: origin.icon,
        color: origin.color,
        href: playable ? watchPath : (handle?.url ?? undefined),
        external: !playable,
        active: false,
      } satisfies WatchSource
    })
    .filter(source => source.href)
    .sort((a, b) => Number(a.external) - Number(b.external))
    .slice(0, 5)

  return (
    <div className="episode">
      {
        episode.uri
          ? (
            <Link
              className="episode-link"
              href={getRoutePath(Route.WATCH, { mediaUri, episodeUri: episode.uri })}
            />
          )
          : undefined
      }
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
              <div className="header">
                <div className="title">{episode.titles.at(0)?.title}</div>
                <span className="origins">
                  <SourceSelector compact sources={sources} />
                </span>
              </div>
              {
                episode.shortDescriptions?.at(0)
                  ? (
                    <div className="description">
                      <TextEllipsis className="ellipsis">
                        {episode.shortDescriptions?.at(0)?.shortDescription}
                      </TextEllipsis>
                    </div>
                  )
                  : undefined
              }
            </div>
          )
          : (
            <div className="content">
              <div className="header">
                <div className="title">Episode {index + 1}</div>
              </div>
            </div>
          )
      }
      <div className="side">
        <span className="date">
        </span>
      </div>
    </div>
  )
}

const MediaModal = ({ mediaNodes }: { mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }) => {
  const params = useParams<RouteParams['MEDIA']>()
  const [, navigate] = useLocation()
  const foundMedia = mediaNodes.find(media => matchAggregatedUris(media.uri as AggregatedUri, params.uri as AggregatedUri))

  const [uri, setUri] = useState(params.uri)
  useEffect(() => {
    setUri(prev =>
      prev && isAggregatedUri(prev) && isAggregatedUri(params.uri) && matchAggregatedUris(prev, params.uri)
        ? prev
        : params.uri
    )
  }, [params.uri])

  const [{ data }] = useSubscription({
    query: GET_MEDIA_MODAL,
    variables: {
      input: {
        uri
      },
      descriptionInput: {
        type: MediaDescriptionContentType.Html
      }
    },
    pause: !uri
  })
  const media = data?.media ?? foundMedia
  const origins =
    data?.media?.uri
      ? fromAggregatedUri(data.media.uri as AggregatedUri)?.handleUrisValues
      : undefined
  const originIds = [...new Set(origins?.map(origin => origin.origin))]
  const [{ data: originData }] = useSubscription({
    query: GET_MEDIA_MODAL_ORIGINS,
    variables: { input: { ids: originIds!, filters: [OriginFilter.IsNotApiOnly] } },
    pause: !originIds
  })
  const title = useMemo(() => media?.titles?.at(0)?.title, [media])
  const description = useMemo(
    () =>
      media
      && 'descriptions' in media
      && (
        media
          .descriptions
          .sort((desc1, desc2) => desc2.description.length - desc1.description.length)
          ?.at(0)
          ?.description
      ),
    [media]
  )
  const cover = useMemo(() => media?.covers?.at(0), [media])

  const [bannedTrailerUris, setBannedTrailerUris] = useState<string[]>([])
  const [pinnedTrailerUri, setPinnedTrailerUri] = useState<string>()
  const selectedTrailer = useMemo(
    () => {
      const trailers = (media?.trailers ?? []).filter((trailer) => !bannedTrailerUris.includes(trailer.uri))
      return trailers.find(trailer => trailer.uri === pinnedTrailerUri) ?? trailers.at(0)
    },
    [media?.trailers, bannedTrailerUris, pinnedTrailerUri]
  )

  useEffect(() => {
    if (selectedTrailer?.uri && selectedTrailer.uri !== pinnedTrailerUri) setPinnedTrailerUri(selectedTrailer.uri)
  }, [selectedTrailer?.uri, pinnedTrailerUri])

  const onTrailerError = useCallback(() => {
    if (!selectedTrailer) return
    setBannedTrailerUris([...bannedTrailerUris, selectedTrailer.uri])
  }, [selectedTrailer, bannedTrailerUris])

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

  useEffect(() => {
    if (!media?.uri || !isAggregatedUri(media.uri) || !params.uri || !isAggregatedUri(params.uri)) return
    const mediaAggregatedUris = fromAggregatedUri(media.uri)?.handleUris ?? []
    const paramsAggregatedUris = fromAggregatedUri(params.uri)?.handleUris ?? []
    if (mediaAggregatedUris.length > paramsAggregatedUris.length) {
      navigate(getRoutePath(Route.MEDIA, { uri: media.uri }), { replace: true })
    }
  }, [media?.uri, params.uri])

  if (!open) return <Redirect to="/" />

  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll css={style} ref={refs.setReference} {...getReferenceProps()}>
        <FloatingFocusManager context={context}>
          <div className="modal" ref={refs.setFloating} {...getFloatingProps()}>
            <div className="trailer" style={!selectedTrailer?.url && cover ? { backgroundImage: `url(${cover.url})` } : {}}>
              {
                selectedTrailer?.url
                  ? (
                    <YoutubeMinimalPlayer
                      key={selectedTrailer.url}
                      url={selectedTrailer.url}
                      className="player"
                      onError={onTrailerError}
                      paused={playerPaused}
                      volume={playerMuted ? 0 : playerVolume}
                    />
                  )
                  : undefined
              }
              <div className={`player-controls ${!selectedTrailer?.url ? 'hidden' : ''}`}>
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
              <div className="header">
                <span className="title">{title}</span>
                <span className="origins">
                  {
                    originData
                      ?.originPage
                      ?.nodes
                      ?.map(origin => {
                        const link = media?.handles.find(handle => handle.origin === origin.id)?.url
                        if (!origin.icon) return undefined
                        return (
                          link
                            ? (
                              <a className="origin" href={link} target="_blank" rel="noreferrer" title={origin.name}>
                                <img src={origin.icon}/>
                              </a>
                            )
                            : (
                              <div className="origin">
                                <img src={origin.icon}/>
                              </div>
                            )
                        )
                      })
                      .filter(Boolean)
                  }
                </span>
              </div>
              {
                description
                  ? (
                    <Collapsible collapsedHeight={200} className="description">
                      <div dangerouslySetInnerHTML={{ __html: description }}/>
                    </Collapsible>
                  )
                  : undefined
              }
              <div className="episodes">
                {
                  media &&
                  'episodes' in media &&
                  media
                    .episodes
                    ?.map((episode, index) =>
                      <Episode key={episode.episodeNumber ?? episode.uri ?? index} episode={episode} index={index} mediaUri={media.uri} />
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
