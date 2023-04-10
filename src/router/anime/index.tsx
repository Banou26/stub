import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { Link } from 'react-router-dom'
import * as ScrollArea from '@radix-ui/react-scroll-area'

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
  padding: 5rem;
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
  /* &::-webkit-scrollbar{
    display: none;
  } */
}

.ScrollAreaRoot {
  margin: 2.5rem 0;
}

`

export default () => {
  const { error, data: { Page } = {} } = useQuery(
    GET_CURRENT_SEASON,
    {
      variables: {
        season: MediaSeason.Winter,
        seasonYear: 2023,
        sort: [MediaSort.Popularity]
      }
    }
  )

  if (error) console.error(error)

  

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
                {
                  Page?.media?.map(media =>
                    <Title2 media={media} className="title card Tag"/>
                  )
                }
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="ScrollAreaScrollbar" orientation="horizontal">
              <ScrollArea.Thumb className="ScrollAreaThumb" />
            </ScrollArea.Scrollbar>
            <ScrollArea.Corner className="ScrollAreaCorner" />
          </ScrollArea.Root>
        </div>
      </div>
      <div className="section">
        <Link to={getRoutePath(Route.ANIME_SEASON)}>
          <h2>Popular animes</h2>
        </Link>
        <div className="items">
          {
            Page?.media?.map(media =>
              <Title2 media={media} className="title card Tag"/>
            )
          }
        </div>
      </div>
    </div>
  )
}
