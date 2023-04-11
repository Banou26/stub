import { css } from '@emotion/react'
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client'
import { Link } from 'react-router-dom'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { FloatingPortal, autoUpdate, useFloating } from '@floating-ui/react'

import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
import MediaCard from '../../components/card'
import { MediaSeason, MediaSort } from '../../generated/graphql'
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
/* 
.title-wrapper {
  position: relative;
  overflow: visible;

  /* .hover-details {
    position: absolute;
    height: 35rem;
    width: 50rem;
    top: -50%;
    left: -50%;
    background-color: rgb(35, 35, 35);
  } */
} */

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
  const {x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate })

  if (error) console.error(error)

  const titleCards = useMemo(() =>
    Page?.media?.map(media =>
      <Title2
        key={media.uri}
        media={media}
        onMouseOver={e => refs.setReference(e.currentTarget)}
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
          <div
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              width: 'max-content',
            }}
          >
            <div>Floating element</div>
            <div>Floating element</div>
            <div>Floating element</div>
            <div>Floating element</div>
            <div>Floating element</div>
          </div>
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
