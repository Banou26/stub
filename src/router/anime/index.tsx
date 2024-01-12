import { css } from '@emotion/react'
import { useState, useEffect, useMemo, HTMLAttributes, forwardRef, useRef } from 'react'
// import { Link, useSearchParams } from 'react-router-dom'
import { autoUpdate, shift, useFloating } from '@floating-ui/react'
import { Play } from 'react-feather'
import DOMPurify from 'dompurify'
import * as marked from 'marked'
import { useQuery } from 'urql'

import { Media, MediaSort } from '../../generated/graphql'
import { GET_CURRENT_SEASON } from '../anime/season'
import { Route, getRoutePath } from '../path'
import Title2 from '../../components/title2'

import './index.css'
import PreviewModal, { GET_PREVIEW_MODAL_MEDIA as GET_MEDIA } from './preview-modal'
import { MinimalPlayer } from '../../components/minimal-player'
import { getSeason } from '../../utils/date'
import Header from '../../components/header'
import EpisodeCard from '../../components/episode-card'
import { getCurrentSeason } from 'laserr/src/targets/anilist'
import { Link, useLocation, useSearch } from 'wouter'
import { ReactJSXElement } from '@emotion/react/types/jsx-namespace'

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

padding-top: 0;

a:has(>h2) {
  h2 {
    display: inline-block;
    font-size: 1.5rem;
    font-weight: 600;
    @media (min-width: 1024px) {
      font-size: 2rem;
    }
    @media (min-width: 1440px) {
      font-size: 2.25rem;
    }
    @media (min-width: 2560px) {
      font-size: 4rem;
      font-weight: bold;
    }
  }
}

.header-serie {
  position: absolute;

  display: flex;
  justify-content: space-between;
  align-items: center;

  width: 100%;
  height: calc(100vh - 5rem);

  padding-bottom: 0;

  .serie-title {
    font-size: 4rem;
    font-weight: 700;
  }

  .header-serie-content {
    position: absolute;
    top: 47.5rem;
    @media (min-width: 2560px) {
      top: 40rem;
    }

    z-index: 20;

    display: flex;
    flex-direction: column;
    align-items: flex-start;

    padding: 5rem 5rem;
    @media (min-width: 2560px) {
      padding: 5rem 10rem;
    }

    padding-top: 0;
    padding-bottom: 0;
    text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;

    
    .header-serie-title {
      > h1 {
        font-size: 1.5rem;
        font-weight: 700;
        
        @media (min-width: 1024px) {
          font-size: 2rem;
        }
        @media (min-width: 1440px) {
          font-size: 2.5rem;
        }
        @media (min-width: 2560px) {
          font-size: 3rem;
        }
      }
      color: #fff;
      max-width: 75rem;
    }

    .header-serie-description {
      font-size: 1.25rem;
      @media (min-width: 1024px) {
        font-size: 1.6rem;
        margin-top: .5rem;
      }
      @media (min-width: 2560px) {
        font-size: 1.8rem;
        margin-top: 2rem;
      }
      font-weight: 500;
      line-height: 1.5;
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
      font-size: 2.5rem;
      font-weight: 700;
      @media (min-width: 2560px) {
        font-size: 3rem;
      }
      padding: 1rem 0;
      margin: 0;
      text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;
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

    .volume-area-wrapper {
      z-index: 25;
      bottom: unset;
      top: 43rem;
      @media (min-width: 2560px) {
        top: 35rem;
        left: 9rem;
      }
      left: 4rem;
    }
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

.section {
  position: relative;
  padding: 2.5rem 0 2.5rem 0rem;
  @media (min-width: 2560px) {
    padding: 5rem 0 5rem 0rem;
  }

  & > a {
    margin-left: 5rem;
    @media (min-width: 2560px) {
      margin-left: 10rem;
    }
  }
}

.section:not(:first-of-type) {
  margin-top: 1rem;
  @media (min-width: 1440px) {
    margin-top: 2.5rem;
  }
  @media (min-width: 2560px) {
    margin-top: 5rem;
  }
}

div.section.first-section {
  margin-top: 0;
  padding-top: 70vh;
  h2 {
    color: #fff;
    text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
}

.section-items .section-items {
  display: grid;
  grid-auto-flow:column;
  width: 100%;
  overflow: auto;
  margin: 0 0 1rem 0;
  gap: 2.5rem;
  padding-bottom: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: hsl(253, 3.5%, 53.5%) #0f0f0f;

  & > div:first-of-type {
    margin-left: 5rem;
    @media (min-width: 2560px) {
      margin-left: 10rem;
    }
  }
}

@-moz-document url-prefix() {
  .section-items .section-items {
    padding-bottom: 1.5rem;
    scrollbar-width: initial;
  }
}

.draggable {
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
  &.active > * {
    pointer-events: none;
  }
}

.title-hovercard {
  display: grid;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  user-select: none;

  transform: scale(0.95);
  transition: transform .2s ease, opacity .2s ease;

  width: 50rem;
  margin-top: 29rem;
  @media (min-width: 2560px) {
    width: 70rem;
    margin-top: 37.5rem;
  }

  &:hover {
    transform: scale(1);
    opacity: 1;
  }

  a {
    color: #fff;
    text-decoration: none;
  }

  .content {
    padding: 1.5rem;
    width: 50rem;

    @media (min-width: 2560px) {
      padding: 2rem;
      width: 70rem;
    }

    .title {
      margin-bottom: .25rem;
      font-size: 1.5rem;
      font-weight: 600;

      @media (min-width: 2560px) {
        margin-bottom: .5rem;
        font-size: 2rem;
      }
    }

    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: .5rem;

      @media (min-width: 2560px) {
        margin-bottom: 1rem;
      }

      font-size: 1.5rem;
      font-weight: 600;
    }

    .description {
      display: flex;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 1.25rem;
      font-weight: 500;
    }
  }

  .title-hovercard-player {
    position: relative;
    display: grid;
    grid-template: "container";
    background-color: #000;
    overflow: hidden;
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    user-select: none;

    overflow: hidden;

    height: 28rem;
    width: 50rem;
    @media (min-width: 2560px) {
      height: 39.25rem;
      width: 70rem;
    }

    & > a > div:first-of-type {
      grid-area: container;
      pointer-events: none;

      margin-top: -6.9rem;
      height: 42rem !important;
      width: 50rem !important;
      @media (min-width: 2560px) {
        margin-top: -10.3rem;
        height: 60rem !important;
        width: 70rem !important;
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
        ? descriptionText.length > 150
          ? `${descriptionText.slice(0, descriptionText.indexOf(' ', 150)).replace(/[,.]$/, '')}...`
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
        redirectTo={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}
        className="title-hovercard-player"
      />
      <Link
        to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}
        ref={setContentRef}
      >
        <div className="content">
          <div className='title'>
            {
              media.title?.english
                ?? media.title?.romanized
                ?? media.title?.native
            }
          </div>
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

const parseTextDescription = (text: string | undefined) =>
  text &&
  new DOMParser()
    .parseFromString(
      DOMPurify.sanitize(
        marked.parse(text)
      ),
      'text/html'
    )
    .body
    .innerText

const getEllipsedDescription = (text: string | undefined) =>
  text &&
  text.length > 225
    ? `${text.slice(0, text.indexOf(' ', 225)).replace(/[,.]$/, '')}...`
    : text

const Draggable = (
  { children, isDragging, setIsDragging }:
  { children: ReactJSXElement, isDragging, setIsDragging: (val: boolean) => void }
) => {
  if ('ontouchstart' in document.documentElement) return children
  const [ourRef, setOurRef] = useState<HTMLDivElement | null>(null)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const [isDraggingTimeout, setIsDraggingTimeout] = useState<number>()
  const mouseCoords = useRef({
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0
  })
  const handleDragStart = (e: MouseEvent) => {
    if (
      e.offsetX > e.target.clientWidth ||
      e.offsetY > e.target.clientHeight
    ) {
      return
    }
    if (!ourRef || !(ourRef as Node).contains(e.target)) return
    e.preventDefault();
    const slider = ourRef.children[0];
    const startX = e.pageX - slider.offsetLeft;
    const startY = e.pageY - slider.offsetTop;
    const scrollLeft = slider.scrollLeft;
    const scrollTop = slider.scrollTop;
    mouseCoords.current = { startX, startY, scrollLeft, scrollTop }
    setIsMouseDown(true)
    setIsDraggingTimeout(setTimeout(() => setIsDragging(true), 150))
  }
  const handleDragEnd = (e) => {
    setIsMouseDown(false)
    setIsDragging(false)
    if (isDraggingTimeout) clearTimeout(isDraggingTimeout)
    if (!ourRef) return
  }
  const handleDrag = (e) => {
    if (!isMouseDown || !ourRef) return;
    e.preventDefault();
    const slider = ourRef.children[0];
    const x = e.pageX - slider.offsetLeft;
    const y = e.pageY - slider.offsetTop;
    const walkX = (x - mouseCoords.current.startX);
    const walkY = (y - mouseCoords.current.startY);
    slider.scrollLeft = mouseCoords.current.scrollLeft - walkX;
    slider.scrollTop = mouseCoords.current.scrollTop - walkY;
  }

  useEffect(() => {
    if (!ourRef) return
    const root = window
    root.addEventListener('mousedown', handleDragStart)
    root.addEventListener('mouseup', handleDragEnd)
    root.addEventListener('mousemove', handleDrag)
    return () => {
      root.removeEventListener('mousedown', handleDragStart)
      root.removeEventListener('mouseup', handleDragEnd)
      root.removeEventListener('mousemove', handleDrag)
    }
  }, [ourRef, isMouseDown, setIsDragging, isDraggingTimeout])

  return (
    <div ref={ref => setOurRef(ref)} className={`draggable ${isDragging ? 'active' : ''}`}>
      {/* <div ref={ourRef} onMouseDown={handleDragStart} onMouseUp={handleDragEnd} onMouseMove={handleDrag} className="draggable"> */}
      {children}
    </div>
  )
}

const Anime = () => {
  const searchParams = new URLSearchParams(useSearch())
  const mediaUriModal = searchParams.get('details')
  const currentSeason = useMemo(() => getCurrentSeason(), [])
  const [currentSeasonResult] = useQuery(
    {
      query: GET_CURRENT_SEASON,
      variables: {
        season: currentSeason.season,
        seasonYear: currentSeason.year,
        sort: [MediaSort.Popularity]
      }
    }
  )
  const { error, data: { Page } = {} } = currentSeasonResult

  const randomNum = useMemo(() => Math.floor(Math.random() * Math.min(10, Page?.media?.length ?? 0)), [Page?.media?.length])
  const theaterMedia = useMemo(() => Page?.media.at(randomNum), [Page, randomNum])
  const [getMediaResult] = useQuery({ query: GET_MEDIA, variables: { uri: theaterMedia?.uri }, pause: !theaterMedia })
  const { error: error2, data: { Media } = {} } = getMediaResult

  if (error) console.error(error)
  if (error2) console.error(error2)

  const descriptionText = useMemo(
    () => parseTextDescription(Media?.description),
    [Media?.description]
  )

  const ellipsedDescriptionText = useMemo(
    () => getEllipsedDescription(descriptionText),
    [descriptionText]
  )

  const {x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate, placement: 'top', middleware: [shift()] })
  const [hoverCardMedia, setHoverCardMedia] = useState<Media | undefined>(undefined)
  const [hoverCardTriggerTimeout, setHoverCardTriggerTimeout] = useState<number | undefined>(undefined)

  const titleCards = useMemo(() =>
    Page?.media?.map(media =>
      <Title2
        key={media.uri}
        media={media}
        to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}
        onMouseEnter={e => {
          setHoverCardMedia(undefined)
          refs.setReference(e.target)
          setHoverCardTriggerTimeout(
            window.setTimeout(() => {
              if (refs.reference.current !== e.target) return
              setHoverCardMedia(media)
            }, 400)
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
  , [Page?.media, hoverCardTriggerTimeout])

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

  const [isDragging, setIsDragging] = useState(false);

  return (
    <>
      <Header css={headerStyle}/>
      <div css={style}>
        <div className="header-serie">
          {
            Media && (
              <div className="player-wrapper">
                <MinimalPlayer ref={setHeaderTrailerRef} media={Media} paused={headerTrailerPaused} className="player"/>
                <div className="shadow"/>
                <div className="header-serie-content">
                  <div className="header-serie-title">
                    <h1>
                      {
                        Media.title?.english
                        ?? Media.title?.romanized
                        ?? Media.title?.native
                      }
                    </h1>
                  </div>
                  <div className="header-serie-description">
                    {ellipsedDescriptionText}
                  </div>
                  <Link to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: Media.uri }).toString()}`}>
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
            <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
              <div className="section-items">
                {titleCards}
              </div>
            </Draggable>
            {
              !isDragging && hoverCardMedia && (
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
            <h2>Latest episodes</h2>
          </Link>
          <div className="section-items">
            <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
              <div className="section-items">
                {
                  Page
                    ?.media
                    ?.flatMap(media => media.episodes?.edges.map(edge => ({ node: { ...edge.node, media } })) ?? [])
                    .filter(({ node }) => node.airingAt < Date.now() + 1000 * 60 * 60 * 12)
                    .filter(({ node }) => node.airingAt > Date.now() - 1000 * 60 * 60 * 24 * 7)
                    .sort((a, b) => b.node.airingAt - a.node.airingAt)
                    .map(({ node: episode }) =>
                      <EpisodeCard
                        key={episode.uri}
                        to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: episode.media.uri }).toString()}`}
                        style={{ backgroundImage: `url(${episode.media.coverImage.at(0).default})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                        episode={episode}
                      />
                    )
                }
              </div>
            </Draggable>
          </div>
        </div>
        <PreviewModal/>
      </div>
    </>
  )
}

export default Anime