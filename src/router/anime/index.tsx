import { css } from '@emotion/react'
import { useState, useEffect, useMemo, HTMLAttributes, forwardRef, useRef } from 'react'
import { autoUpdate, shift, useFloating } from '@floating-ui/react'
import { Play } from 'react-feather'
import DOMPurify from 'dompurify'
import * as marked from 'marked'
import { useQuery, useSubscription } from 'urql'
import { getCurrentSeason } from 'laserr/src/targets/anilist'
import { Link, useLocation, useSearch } from 'wouter'
import { Grid } from 'react-virtualized'

import { Media, MediaSort, UserMediaStatus } from '../../generated/graphql'
import { GET_CURRENT_SEASON } from '../anime/season'
import { Route, getRoutePath } from '../path'
import Title2 from '../../components/title2'

import './index.css'
import PreviewModal, { GET_PREVIEW_MODAL_MEDIA as GET_MEDIA } from './preview-modal'
import { MinimalPlayer } from '../../components/minimal-player'
import { getSeason } from '../../utils/date'
import Header from '../../components/header'
import EpisodeCard from '../../components/episode-card'
import { ReactJSXElement } from '@emotion/react/types/jsx-namespace'
import { AuthResponse } from '../auth/mal'
import { useLocalStorageAuthStates } from '../auth/utils'
import SkeletonCard from '../../components/skeleton/skeleton-card'
import SkeletonSizable from '../../components/skeleton/skeleton-sizable'

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
    padding-bottom: .5rem;
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

  display: none;
  @media (min-width: 960px) {
    display: flex;
  }
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
    top: 46%;
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
        font-weight: 600;
        
        @media (min-width: 1024px) {
          font-size: 1.8rem;
        }
        @media (min-width: 1440px) {
          font-size: 2rem;
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
        font-size: 1.4rem;
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
      font-size: 2rem;
      font-weight: 500;
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
      top: 41%;
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

.header-mobile {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  @media (min-width: 960px) {
    display: none;
  }

  width: 100%;
  height: 35rem;
  padding-top: 3.5rem;
  @media (min-width: 640px) {
    height: 45rem;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .content {
    background-image: linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,0));
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    padding: 5rem 1rem 1rem 1rem;
    gap: 1rem;
    bottom: 0;

    .title {
      font-size: 1.25rem;
      @media (min-width: 640px) {
        font-size: 1.5rem;
      }
      font-weight: 500;
    }
    .watch {
      > button {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
      }
    }
  }
}

.section {
  position: relative;
  padding: .5rem 0 .5rem 0rem;
  @media (min-width: 1440px) {
    padding: 2.5rem 0 2.5rem 0rem;
  }
  @media (min-width: 2560px) {
    padding: 5rem 0 5rem 0rem;
  }

  & > a {
    margin-left: 1rem;
    @media (min-width: 1440px) {
      margin-left: 5rem;
    }
    @media (min-width: 2560px) {
      margin-left: 10rem;
    }
  }
}

.section:not(:first-of-type) {
  @media (min-width: 1440px) {
    margin-top: 2.5rem;
  }
  @media (min-width: 2560px) {
    margin-top: 5rem;
  }
}

div.section.first-section {
  margin-top: 0;
  @media (min-width: 960px) {
    padding-top: 70vh;
  }
  h2 {
    color: #fff;
    text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
}

.section-items .virtualized-list {
  display: grid;
  grid-auto-flow:column;
  width: 100% !important;
  overflow: auto;
  margin: 0 0 1rem 0;
  gap: 2.5rem;
  padding-bottom: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: hsl(253, 3.5%, 53.5%) #0f0f0f;

  & > div:first-of-type {
    margin-left: 1rem;
    @media (min-width: 1440px) {
      margin-left: 5rem;
    }
    @media (min-width: 2560px) {
      margin-left: 10rem;
    }
  }

  & > div:last-of-type {
    margin-right: 1rem;
    @media (min-width: 1440px) {
      margin-right: 5rem;
    }
    @media (min-width: 2560px) {
      margin-right: 10rem;
    }
  }
}

@-moz-document url-prefix() {
  .section-items .virtualized-list {
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

export const GET_USER_MEDIA_LIST = gql(`#graphql
  query GetUserMediaPage($input: UserMediaPageInput!) {
    userMediaPage(input: $input) {
      nodes {
        handles {
          edges {
            node {
              ...GetUserMediaListFragment
            }
          }
        }
        ...GetUserMediaListFragment
      }
    }
  }

  fragment GetUserMediaListFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    episodes {
      edges {
        node {
          origin
          id
          uri
          url
          number
          airingAt
          title {
            romanized
            english
            native
          }
          description
          thumbnail
        }
      }
    }
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
  }
`)

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
                media.title?.romanized
                ?? media.title?.english
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


export const GET_CURRENT_SEASON_SUBSCRIPTION = gql(/* GraphQL */`
  subscription GetCurrentSeason($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        handles {
          edges {
            node {
              ...GetMediaTestFragment
            }
          }
        }
        ...GetMediaTestFragment
      }
    }
  }

  fragment GetMediaTestFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    episodes {
      edges {
        node {
          origin
          id
          uri
          url
          number
          airingAt
          title {
            romanized
            english
            native
          }
          description
          thumbnail
        }
      }
    }
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
  }
`)

const Anime = () => {
  const searchParams = new URLSearchParams(useSearch())
  const mediaUriModal = searchParams.get('details')
  const currentSeason = useMemo(() => getCurrentSeason(), [])
  const [currentSeasonResult] = useSubscription(
    {
      query: GET_CURRENT_SEASON_SUBSCRIPTION,
      variables: {
        input: {
          season: currentSeason.season,
          seasonYear: currentSeason.year,
          sorts: [MediaSort.Popularity]
        }
      }
    }
  )

  const authStates = useLocalStorageAuthStates()

  const [{ data: userMediaPageData }] = useQuery(
    {
      query: GET_USER_MEDIA_LIST,
      variables: {
        input: {
          status: UserMediaStatus.Watching,
          authentications:
            authStates
              .map(authState => ({
                origin: authState.origin,
                type: authState.type,
                oauth2: authState.oauth2 && {
                  accessToken: authState.oauth2.accessToken,
                  tokenType: authState.oauth2.tokenType
                }
              }))
        }
      },
      pause: !authStates.length
    }
  )

  const userMediaPage = userMediaPageData?.userMediaPage

  const watchingCards = useMemo(() =>
    userMediaPage?.nodes?.map(media =>
      <Title2
        key={media.uri}
        media={media}
        to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}
        onMouseEnter={e => {
        }}
        onMouseLeave={(e) => {

        }}
      />
    )
  , [userMediaPage?.nodes])

  const { error, data: { mediaPage: _mediaPage } = {} } = currentSeasonResult
  const mediaPage = useMemo(() =>
    _mediaPage?.nodes && ({
      nodes:
        _mediaPage
          ?.nodes
          ?.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)) }),
    [_mediaPage?.nodes]
  )
  
  const randomNum = useMemo(() => Math.floor(Math.random() * Math.min(10, mediaPage?.nodes?.length ?? 0)), [mediaPage?.nodes?.length])
  const theaterMedia = useMemo(() => mediaPage?.nodes.at(randomNum), [mediaPage, randomNum])
  const [getMediaResult] = useSubscription({ query: GET_MEDIA, variables: { input: { uri: theaterMedia?.uri } }, pause: !theaterMedia })
  const { error: error2, data: { media } = {} } = getMediaResult

  if (error) console.error(error)
  if (error2) console.error(error2)

  const descriptionText = useMemo(
    () => parseTextDescription(media?.description),
    [media?.description]
  )

  const ellipsedDescriptionText = useMemo(
    () => getEllipsedDescription(descriptionText),
    [descriptionText]
  )

  const {x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate, placement: 'top', middleware: [shift()] })
  const [hoverCardMedia, setHoverCardMedia] = useState<Media | undefined>(undefined)
  const [hoverCardTriggerTimeout, setHoverCardTriggerTimeout] = useState<number | undefined>(undefined)

  const titleCards = useMemo(() =>
    mediaPage?.nodes?.map(media =>
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
  , [mediaPage?.nodes, hoverCardTriggerTimeout])

  const episodeCards = useMemo(() =>
    mediaPage
      ?.nodes
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
    , [mediaPage?.nodes])

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

  const titleCardHeight =
    window.matchMedia('(min-width: 2560px)').matches
      ? 350
      : window.matchMedia('(min-width: 1440px)').matches
        ? 300
        : 140
  const titleCardWidth =
    window.matchMedia('(min-width: 2560px)').matches
      ? 260
      : window.matchMedia('(min-width: 1440px)').matches
        ? 210
        : 135
  const listWidth = window.innerWidth

  const episodeCardHeight =
    window.matchMedia('(min-width: 2560px)').matches
      ? 250
      : window.matchMedia('(min-width: 1440px)').matches
        ? 200
        : 100
  const episodeCardWidth =
    window.matchMedia('(min-width: 2560px)').matches
      ? 410
      : window.matchMedia('(min-width: 1440px)').matches
        ? 360
        : 180

  const [showHeaderBg, setShowHeaderBg] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShowHeaderBg(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <>
      <Header css={headerStyle} style={{ backgroundColor: showHeaderBg ? 'rgb(35, 35, 35)' : 'transparent' }}/>
      <div css={style}>
        <div className="header-serie">
          {
            media
              ? (
                <div className="player-wrapper">
                  <MinimalPlayer ref={setHeaderTrailerRef} media={media} paused={headerTrailerPaused} className="player"/>
                  <div className="shadow"/>
                  <div className="header-serie-content">
                    <div className="header-serie-title">
                      <h1>
                        {
                          media.title?.english
                          ?? media.title?.romanized
                          ?? media.title?.native
                        }
                      </h1>
                    </div>
                    <div className="header-serie-description">
                      {ellipsedDescriptionText}
                    </div>
                    <Link to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}>
                      <button className="watch">
                        <Play/>
                        Watch
                      </button>
                    </Link>
                  </div>
                </div>
            )
            : (
                <div className="player-wrapper">
                  <MinimalPlayer ref={setHeaderTrailerRef} media={media} paused={headerTrailerPaused} className="player"/>
                  <div className="shadow"/>
                  <div className="header-serie-content">
                    <div className="header-serie-title">
                      <SkeletonSizable height={30} length={20}/>
                    </div>
                    <div className="header-serie-description">
                      <SkeletonSizable width={300} height={50}/>
                    </div>
                    <Link to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media?.uri }).toString()}`}>
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
        <div className="header-mobile">
          {
            media && (
              <>
                <img src={media.coverImage.at(0)?.default} alt={media.title.english} />
                <div className="content">
                  <div className="title">
                    <p>
                      {
                        media.title?.english
                        ?? media.title?.romanized
                        ?? media.title?.native
                      }
                    </p>
                  </div>
                  <Link
                    to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}
                    className="watch"
                  >
                    <button>
                      <Play/>
                      Watch
                    </button>
                  </Link>
                </div>

              </>
            )
          }
        </div>
        {
          watchingCards?.length && (
            <div className="section first-section">
              <Link to={getRoutePath(Route.ANIME_SEASON)}>
                <h2>Continue watching</h2>
              </Link>
              <div className="section-items">
                <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
                  <Grid
                    className="virtualized-list"
                    height={titleCardHeight + (window.matchMedia('(min-width: 2560px)').matches ? 20 : 25)}
                    columnCount={watchingCards?.length ?? 0}
                    columnWidth={listWidth / (listWidth / titleCardWidth)}
                    rowCount={1}
                    rowHeight={titleCardHeight}
                    rowWidth={titleCardWidth}
                    width={listWidth}
                    // https://github.com/bvaughn/react-virtualized/blob/master/docs/Grid.md#overscanindicesgetter
                    overscanIndicesGetter={({ cellCount, overscanCellsCount, startIndex, stopIndex, }) => ({
                      overscanStartIndex: Math.max(0, startIndex - overscanCellsCount - 1),
                      overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount),
                    })}
                    cellRenderer={({ columnIndex, key, rowIndex, style: { height, width, ...style } }) =>
                      <div key={key} style={style}>
                        {watchingCards?.[columnIndex]}
                      </div>
                    }
                  />
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
          )
        }
        <div className={`section ${watchingCards?.length ? '' : 'first-section'}`}>
          <Link to={getRoutePath(Route.ANIME_SEASON)}>
            <h2>Current season</h2>
          </Link>
          <div className="section-items">
            <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
              {
                titleCards?.length
                  ? (
                    <Grid
                      className="virtualized-list"
                      height={titleCardHeight + (window.matchMedia('(min-width: 2560px)').matches ? 20 : 25)}
                      columnCount={titleCards.length}
                      columnWidth={listWidth / (listWidth / titleCardWidth)}
                      rowCount={1}
                      rowHeight={titleCardHeight}
                      rowWidth={titleCardWidth}
                      width={listWidth}
                      // https://github.com/bvaughn/react-virtualized/blob/master/docs/Grid.md#overscanindicesgetter
                      overscanIndicesGetter={({ cellCount, overscanCellsCount, startIndex, stopIndex, }) => ({
                        overscanStartIndex: Math.max(0, startIndex - overscanCellsCount - 1),
                        overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount),
                      })}
                      cellRenderer={({ columnIndex, key, rowIndex, style: { height, width, ...style } }) =>
                        <div key={key} style={style}>
                          {titleCards?.[columnIndex]}
                        </div>
                      }
                    />
                )
                : (
                  <SkeletonCard
                    count={Math.ceil(listWidth / titleCardWidth) - 1}
                    height={titleCardHeight}
                    width={titleCardWidth - 10}
                  />
                )
              }
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
              {
                episodeCards?.length
                ? (
                  <Grid
                    className="virtualized-list"
                    height={episodeCardHeight + (window.matchMedia('(min-width: 2560px)').matches ? 20 : 25)}
                    columnCount={episodeCards?.length ?? 0}
                    columnWidth={listWidth / (listWidth / episodeCardWidth)}
                    rowCount={1}
                    rowHeight={episodeCardHeight}
                    rowWidth={episodeCardWidth}
                    width={listWidth}
                    // https://github.com/bvaughn/react-virtualized/blob/master/docs/Grid.md#overscanindicesgetter
                    overscanIndicesGetter={({ cellCount, overscanCellsCount, startIndex, stopIndex, }) => ({
                      overscanStartIndex: Math.max(0, startIndex - overscanCellsCount - 1),
                      overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount),
                    })}
                    cellRenderer={({ columnIndex, key, rowIndex, style }) =>
                      <div key={key} style={style}>
                        {episodeCards?.[columnIndex]}
                      </div>
                    }
                  />
                )
                : (
                  <SkeletonCard
                    count={Math.ceil(listWidth / episodeCardWidth) - 1}
                    height={episodeCardHeight}
                    width={episodeCardWidth - 10}
                  />
                )
              }
            </Draggable>
          </div>
        </div>
        <PreviewModal/>
      </div>
    </>
  )
}

export default Anime
