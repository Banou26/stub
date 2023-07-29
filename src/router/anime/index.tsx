import { css } from '@emotion/react'
import { useState, useEffect, useMemo, HTMLAttributes, forwardRef, useRef } from 'react'
import { useQuery } from '@apollo/client'
import { Link, useSearchParams } from 'react-router-dom'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { autoUpdate, shift, useFloating } from '@floating-ui/react'
import ReactPlayer from 'react-player'
import { VolumeX, Volume2, Volume1, Volume, Play } from 'react-feather'
import DOMPurify from 'dompurify'
import * as marked from 'marked'

import useNamespacedLocalStorage from '../../utils/use-local-storage'
import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
import { Media, MediaSort } from '../../generated/graphql'
import { GET_CURRENT_SEASON } from '../anime/season'
import { Route, getRoutePath } from '../path'
import Title2 from '../../components/title2'
import useScrub from '../../utils/use-scrub'

import './index.css'
import PreviewModal, { GET_MEDIA } from './preview-modal'
import { MinimalPlayer } from '../../components/minimal-player'
import { getSeason } from '../../utils/date'
import Header from '../../components/header'

const headerStyle = css`
animation-name: showBackgroundAnimation;
animation-duration: 1ms; /* Firefox requires this to apply the animation */
animation-direction: alternate;
animation-timeline: scroll(block nearest);

@keyframes showBackgroundAnimation {
  from {
    background-color: transparent;
  }
  10% {
    background-color: rgb(35, 35, 35);
  }
  to {
    background-color: rgb(35, 35, 35);
  }
}
`

const style = css`
position: relative;

/* padding: 5rem 10rem; */
padding-top: 0;

h2 {
  font-size: 4rem;
  /* padding: 5rem; */
  padding-top: 5rem;
  padding-left: 5rem;
  /* padding-bottom: 2rem; */
}

.header-serie {
  position: absolute;

  display: flex;
  justify-content: space-between;
  align-items: center;

  width: 100%;
  /* height: calc(100vh - 5rem); */
  /* height: 100%; */
  height: calc(100vh - 5rem);

  padding-bottom: 0;

  .serie-title {
    font-size: 4rem;
    font-weight: 700;
  }

  .header-serie-content {
    position: absolute;

    top: 40rem;

    z-index: 20;

    display: flex;
    flex-direction: column;
    align-items: flex-start;

    /* height: 100%; */
    /* width: 100%; */
    padding: 5rem;
    padding-top: 0;
    padding-bottom: 0;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;

    
    .header-serie-title {
      font-size: 2rem;
      font-weight: 700;
      color: #fff;
    }

    .header-serie-description {
      margin-top: 2rem;
      margin-left: 1rem;
      font-size: 1.8rem;
      font-weight: 400;
      line-height: 1.5;
      /* color: #aaa; */
      color: #fff;
      max-width: 50rem;
    }
  }

  .player-wrapper {
    display: inline;
    width: 100%;

    a {
      text-decoration: none;
    }

    .watch {
      background: none;
      border: none;
      outline: none;
      cursor: pointer;
      color: #fff;
      font-size: 3rem;
      font-weight: 700;
      padding: 1rem;
      margin: 0;
      margin: 1rem;
      text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
      transition: all 0.2s ease-in-out;
      display: flex;
      align-items: center;

      svg {
        margin-right: 1rem;
      }

      &:hover {
        color: #aaa;
      }
    }
  }

  .player {
    height: calc(100vh - 5rem) !important;
    overflow: hidden;
    & > div:first-of-type {
      grid-area: container;
      height: 140vh !important;
      width: 100% !important;
      margin-top: -20vh;
      pointer-events: none;
    }
    /* & > div:first-child {
      width: 100% !important;
      height: calc(100vh - 5rem) !important;
      iframe {
        height: 100% !important;
        pointer-events: none;
      }
    } */

    .volume-area-wrapper {
      z-index: 25;
      bottom: unset;
      top: 35rem;
      left: 4.5rem;
    }
  }

  .shadow {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 30vh;

    /* background-color: rgb(15, 15, 15); */
    background:
      linear-gradient(
        0deg,
        rgba(15, 15, 15, 1) 0%,
        rgba(15, 15, 15, 0.5) calc(100% - 10rem),
        rgba(15, 15, 15, 0) 100%
      );
  }
}

.section {
  position: relative;
  padding: 5rem 10rem;
}

.section:not(:first-of-type) {
  margin-top: 10rem;
}

div.section.first-section {
  margin-top: 0;
  padding-top: 65vh;
  h2 {
    color: #fff;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
}

.ScrollAreaRoot .section-items {
  display: grid;
  grid-auto-flow:column;
  width: 100%;
  overflow: auto;
  margin: 1.5rem 0;
  gap: 2.5rem;
  overflow: visible;
  /* &::-webkit-scrollbar{
    display: none;
  } */
}

.ScrollAreaRoot {
  margin: 2.5rem 0;
  overflow: visible;
  box-shadow: unset;
}

.title-hovercard {
  display: grid;
  /* height: 39.25rem; */
  width: 70rem;
  background-color: rgb(35, 35, 35);
  /* background-color: #000; */
  margin-top: 37.5rem;
  /* margin-top: 50rem; */
  /* overflow: hidden; */
  border-radius: 1rem;
  user-select: none;

  transform: scale(0.95);
  /* overflow: hidden; */
  transition: transform .2s ease, opacity .2s ease;
  /* opacity: 0; */

  &:hover {
    transform: scale(1);
    opacity: 1;
  }

  a {
    color: #fff;
    text-decoration: none;
  }

  .content {
    padding: 2rem;
    width: 70rem;

    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;

      font-size: 1.5rem;
      font-weight: bold;
    }

    .description {
      display: flex;
      overflow: hidden;
    }
  }

  .title-hovercard-player {
    position: relative;
    display: grid;
    grid-template: "container";
    height: 39.25rem;
    width: 70rem;
    /* background-color: rgb(35, 35, 35); */
    background-color: #000;
    /* margin-top: 37.5rem; */
    overflow: hidden;
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    user-select: none;

    /* transform: scale(0.95); */
    overflow: hidden;
    /* transition: transform .2s ease, opacity .2s ease; */
    /* opacity: 0; */

    /* &:hover {
      transform: scale(1);
      opacity: 1;
    } */

    & > a > div:first-of-type {
      grid-area: container;
      margin-top: -10.3rem;
      /* margin-top: -2.95rem; */
      height: 60rem !important;
      width: 70rem !important;
      pointer-events: none;
    }
  }
}
`

const hoverCardStyle = css`
background-color: rgb(35, 35, 35);
width: 64rem;
height: 36rem;

.volume-area-wrapper {
  position: absolute;
  bottom: 2rem;
  left: 1rem;

  display: grid;
  height: 2rem;

  .volume-area {
    display: flex;
    /* grid-template-columns: 4.8rem fit-content(0rem); */
    /* height: 100%; */
    cursor: pointer;
    color: #fff;

    .mute-button {
      color: #fff;
      border: none;
      background: none;
      height: 100%;
      width: 4.8rem;
      cursor: pointer;
    }

    .volume-panel {
      display: inline-block;
      width: 0;
      /* width: 100%; */
      /* width: 12rem; */
      height: 100%;
      -webkit-transition: margin .2s cubic-bezier(0.4,0,1,1),width .2s cubic-bezier(0.4,0,1,1);
      transition: margin .2s cubic-bezier(0.4,0,1,1),width .2s cubic-bezier(0.4,0,1,1);
      cursor: pointer;
      outline: 0;

      &.volume-control-hover {
        width: 6rem;
        /* width: 52px; */
        margin-right: 3px;
        -webkit-transition: margin .2s cubic-bezier(0,0,0.2,1),width .2s cubic-bezier(0,0,0.2,1);
        transition: margin .2s cubic-bezier(0,0,0.2,1),width .2s cubic-bezier(0,0,0.2,1);
      }

      .slider {
        height: 100%;
        min-height: 36px;
        position: relative;
        overflow: hidden;

        .slider-handle {
          /* left: 40px; */
          position: absolute;
          top: 50%;
          width: 12px;
          height: 12px;
          border-radius: 6px;
          margin-top: -6px;
          margin-left: -5px;
          /* background: #fff; */
        }
        .slider-handle::before, .slider-handle::after {
          content: "";
          position: absolute;
          display: block;
          top: 50%;
          left: 0;
          height: 3px;
          margin-top: -2px;
          width: 64px;
        }
        .slider-handle::before {
          left: -58px;
          background: #fff;
        }
        .slider-handle::after {
          left: 6px;
          background: rgba(255,255,255,.2);
        }
      }
    }
  }
}
`

const TitleHoverCard = forwardRef<HTMLInputElement, HTMLAttributes<HTMLDivElement> & { media: Media }>(({ media, ...rest }, ref) => {
  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (contentRef === null) return
    const resizeObserver = new ResizeObserver(() => {
      setContentHeight(contentRef.clientHeight)
    })
    resizeObserver.observe(contentRef as HTMLDivElement)
    return () => {
      resizeObserver.disconnect()
    }
  })

  const descriptionText = useMemo(
    () =>
      media?.description
        ? new DOMParser().parseFromString(DOMPurify.sanitize(marked.parse(media?.description)), 'text/html').body.innerText
        : undefined,
    [media?.description]
  )

  const ellipsedDescriptionText = useMemo(
    () =>
      descriptionText
        ? descriptionText.length > 225
          ? `${descriptionText.slice(0, descriptionText.indexOf(' ', 225)).replace(/[,.]$/, '')}...`
          : descriptionText
        : undefined,
    [descriptionText]
  )

  return (
    <div
      ref={ref}
      {...{
        ...rest,
        style: {
          ...rest.style,
          top: contentHeight ? `calc(${rest.style.top}px + ${contentHeight / 2}px)` : rest.style.top
        }
      }}
      className="title-hovercard"
    >
      <MinimalPlayer
        media={media}
        redirectTo={{ pathname: getRoutePath(Route.ANIME), search: new URLSearchParams({ details: media.uri }).toString() }}
        className="title-hovercard-player"
      />
      <Link
        to={{ pathname: getRoutePath(Route.ANIME), search: new URLSearchParams({ details: media.uri }).toString() }}
        ref={setContentRef}
      >
        <div className="content">
          <div className="top">
            <span className="episodes">
              {media.episodeCount ?? '?'} Episodes
            </span>
            {
              media.startDate
                ? (
                  <span className="date">
                    {getSeason(new Date(media.startDate.year, media.startDate.month, media.startDate.day))} {media.startDate.year}
                  </span>
                )
                : <span className="date"/>
            }
          </div>
          <div className="description">
            {ellipsedDescriptionText}
          </div>
        </div>
      </Link>
    </div>
  )
})

export default () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUriModal = searchParams.get('details')
  const currentSeason = useMemo(() => getCurrentSeason(), [])
  const { error, data: { Page } = {} } = useQuery(
    GET_CURRENT_SEASON,
    {
      variables: {
        season: currentSeason.season,
        seasonYear: currentSeason.year,
        sort: [MediaSort.Popularity]
      }
    }
  )
  const firstMedia = useMemo(() => Page?.media.at(0), [Page?.media.at(0)])
  const { data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: firstMedia?.uri }, skip: !firstMedia })
  const {x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate, placement: 'top', middleware: [shift()] })
  const [hoverCardMedia, setHoverCardMedia] = useState<Media | undefined>(undefined)
  const [hoverCardTriggerTimeout, setHoverCardTriggerTimeout] = useState<number | undefined>(undefined)

  const descriptionText = useMemo(
    () =>
      media?.description
        ? new DOMParser().parseFromString(DOMPurify.sanitize(marked.parse(media?.description)), 'text/html').body.innerText
        : undefined,
    [media?.description]
  )

  const ellipsedDescriptionText = useMemo(
    () =>
      descriptionText
        ? descriptionText.length > 225
          ? `${descriptionText.slice(0, descriptionText.indexOf(' ', 225)).replace(/[,.]$/, '')}...`
          : descriptionText
        : undefined,
    [descriptionText]
  )

  // console.log('Anime Page', Page)
  // console.log('Anime Page', Page)

  if (error) console.error(error)

  const titleCards = useMemo(() =>
    Page?.media?.map(media =>
      <Title2
        key={media.uri}
        media={media}
        onMouseEnter={e => {
          setHoverCardMedia(undefined)
          refs.setReference(e.target)
          setHoverCardTriggerTimeout(
            window.setTimeout(() => {
              if (refs.reference.current !== e.target) return
              setHoverCardMedia(media)
            }, 0)
          )
        }}
        onMouseLeave={(e) => {
          if (refs.floating.current === e.relatedTarget  || refs.floating.current?.contains(e.relatedTarget)) return
          if (hoverCardTriggerTimeout) clearTimeout(hoverCardTriggerTimeout)
          refs.setReference(null)
          setHoverCardMedia(undefined)
        }}
      />
    )
  , [Page?.media])

  const onHoverCardMouseLeave = () => {
    if (hoverCardTriggerTimeout) clearTimeout(hoverCardTriggerTimeout)
    refs.setReference(null)
    setHoverCardMedia(undefined)
  }

  const [headerTrailerRef, setHeaderTrailerRef] = useState<HTMLDivElement | null>()
  const [headerTrailerPaused, setHeaderTrailerPaused] = useState(!!mediaUriModal)

  useEffect(() => {
    if (!headerTrailerRef) return
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        if (!!mediaUriModal) {
          setHeaderTrailerPaused(true)
          return
        }
        setHeaderTrailerPaused(!entries[0]?.isIntersecting)
      },
      { threshold: [0.7] }
    )
    observer.observe(headerTrailerRef)
    return () => {
      observer.disconnect()
    }
  }, [headerTrailerRef])

  useEffect(() => {
    setHeaderTrailerPaused(!!mediaUriModal)
  }, [mediaUriModal])

  return (
    <>
      <Header css={headerStyle}/>
      <div css={style}>
        <div className="header-serie">
          {
            media && (
              <div className="player-wrapper">
                <MinimalPlayer ref={setHeaderTrailerRef} media={media} paused={headerTrailerPaused} className="player"/>
                <div className="shadow"/>
                <div className="header-serie-content">
                  <div className="header-serie-title">
                    <h1>{media.title?.english ?? media.title?.romaji}</h1>
                  </div>
                  <div className="header-serie-description">
                    {ellipsedDescriptionText}
                  </div>
                  <Link to={{ pathname: getRoutePath(Route.ANIME), search: new URLSearchParams({ details: media.uri }).toString() }}>
                    <button className="watch">
                      <Play/>
                      Watch
                    </button>
                  </Link>
                </div>
              </div>
            )
          }
        </div>
        <div className="section first-section">
          <Link to={getRoutePath(Route.ANIME_SEASON)}>
            <h2>Current season</h2>
          </Link>
          <div className="section-items">
            <ScrollArea.Root className="ScrollAreaRoot">
              <ScrollArea.Viewport className="ScrollAreaViewport">
                <div className="section-items">
                  {titleCards}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="ScrollAreaScrollbar" orientation="horizontal">
                <ScrollArea.Thumb className="ScrollAreaThumb" />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner className="ScrollAreaCorner" />
            </ScrollArea.Root>
            {
              hoverCardMedia && (
                <TitleHoverCard
                  media={hoverCardMedia}
                  ref={refs.setFloating}
                  onMouseLeave={onHoverCardMouseLeave}
                  style={{
                    position: strategy,
                    top: y ?? 0,
                    left: x ?? 0
                  }}
                />
              )
            }
          </div>
        </div>
        <div className="section">
          <Link to={getRoutePath(Route.ANIME_SEASON)}>
            <h2>Popular animes</h2>
          </Link>
          <div className="items">
            {/* {
              Page?.media?.map(media =>
                <Title2 key={media.uri} media={media} className="title card Tag"/>
              )
            } */}
          </div>
        </div>
        <PreviewModal/>
      </div>
    </>
  )
}
