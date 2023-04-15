import { css } from '@emotion/react'
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client'
import { Link } from 'react-router-dom'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { FloatingPortal, autoUpdate, useFloating } from '@floating-ui/react'

import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
import MediaCard from '../../components/card'
import { Media, MediaSeason, MediaSort } from '../../generated/graphql'
import { GET_CURRENT_SEASON } from '../anime/season'
import { Route, getRoutePath } from '../path'
import Title from '../../components/title'
import Title2 from '../../components/title2'


import './index.css'

const style = css`

padding: 5rem 10rem;

h2 {
  font-size: 4rem;
  /* padding: 5rem; */
  padding-top: 5rem;
  padding-left: 5rem;
  padding-bottom: 2rem;
}

.section:not(:first-of-type) {
  margin-top: 10rem;
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
}

.title-hovercard {
  display: grid;
  grid-template:"container";
  height: 40rem;
  width: 60rem;
  background-color: rgb(35, 35, 35);
  margin-top: 37.5rem;
  overflow: hidden;
  border-radius: 1rem;

  .title {
    grid-area: container;
    font-size: 2.5rem;
    font-weight: bold;
    margin: 2rem;
  }

  iframe {
    grid-area: container;
    margin-top: -5.90rem;
    height: 50rem;
    width: 60rem;
    pointer-events: none;
  }
}

`

const hoverCardStyle = css`
  background-color: rgb(35, 35, 35);
  width: 50rem;
  height: 35rem;
`

export default () => {
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
  const {x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate, placement: 'top' })
  const [hoverCardMedia, setHoverCardMedia] = useState<Media | undefined>(undefined)
  const [hoverCardTriggerTimeout, setHoverCardTriggerTimeout] = useState<number | undefined>(undefined)

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
            }, 500)
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

  return (
    <div css={style}>
      <div className="section">
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
            refs.reference.current && hoverCardMedia && (
              <div
                className="title-hovercard"
                ref={refs.setFloating}
                onMouseLeave={() => refs.setReference(null)}
                style={{
                  position: strategy,
                  top: y ?? 0,
                  left: x ?? 0
                }}
              >
                {/* <div className="title">{hoverCardMedia.title?.romanized}</div> */}
                {
                  hoverCardMedia.trailers?.at(0)?.thumbnail && (
                    <iframe
                      width="3055"
                      height="1441"
                      src={`https://www.youtube.com/embed/${hoverCardMedia.trailers?.at(0)?.id}?${
                        new URLSearchParams({
                          autoplay: '1',
                          mute: '0',
                          loop: '1',
                          controls: '0',
                          showinfo: '0',
                          modestbranding: '1',
                          rel: '0'
                        })
                      }`}
                      title="On-device Machine Learning With TensorFlow"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen={true}
                    ></iframe>
                  )
                }
                <div className="title">
                  <Link to={getRoutePath(Route.TITLE, { uri: hoverCardMedia.uri })} className="title-text">
                    {
                      (hoverCardMedia.title?.romanized?.length ?? 0) > 30
                        ? hoverCardMedia.title?.romanized?.slice(0, 30) + '...'
                        : hoverCardMedia.title?.romanized
                    }
                  </Link>
                </div>
              </div>
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
    </div>
  )
}
