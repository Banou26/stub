import { getTarget, Series } from '../../../../scannarr/src'

import { useEffect, useMemo, useState } from 'react'
import { Heart, Users } from 'react-feather'
import { css } from '@emotion/react'

import Title from './title'
import Sources from './sources'
import Schedule from './schedule'
import { Media } from '../generated/graphql'

const style = css`
display: grid;
grid-template-columns: 25rem 40rem;
background: rgb(35, 35, 35);
overflow: hidden;

@media
screen and (max-width : 2560px),
screen and (max-height : 1440px) {
  grid-template-columns: 20rem 32rem;
}

.title {
  height: 30rem;
}

.data {
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* grid-template-rows: 5rem minmax(18rem, auto) auto; */
  /* grid-template-rows: 5rem minmax(18rem, 1fr) fit-content(5rem); */
  /* grid-template-rows: 5rem 20rem 5rem; */
  background: rgb(35, 35, 35);

  .head {
    display: grid;
    grid-template-columns: auto auto;
    /* grid-template-columns: 25rem auto; */
    height: 5rem;
    padding: 0.25rem 1rem 0.25rem 2rem;

    .episode {
      .number {
        font-size: 1.7rem;
      }

      .date {
        font-size: 2rem;
      }
    }

    .infos {
      display: grid;
      grid-template-columns: auto 7.5rem;
      column-gap: 0.5rem;
      .sources {
        display: grid;
        grid-template-columns: repeat(auto-fill, 1.6rem);
        grid-template-rows: repeat(auto-fill, 1.6rem);
        direction: rtl;
      }

      .stats {
        margin-left: auto;
        .popularity, .score {
          display: grid;
          grid-template-columns: 5rem 2.4rem;
        }
        .score svg {
          color: hsl(338,73%,60%);
        }
      }
    }
  }

  .synopsis {
    margin: 1rem 0 0 2rem;
    padding-right: 2rem;
    overflow-y: auto;
    line-height: 2.5rem;
    max-height: 21rem;
    font-size: 1.4rem;
  }

  .genres {
    display: flex;
    padding: 0.5rem 2rem;
    column-gap: 1rem;
    /* column-gap: 2rem; */
    row-gap: 0.5rem;
    /* flex-wrap: wrap; */
    font-size: 1.1rem;
    overflow-x: auto;

    .genre {
      height: fit-content;
      border-radius: 3px;
      border: 1px solid rgb(66, 66, 66);
      padding: 0.25rem 0.5rem;
      --background-color: rgb(51, 51, 51);
      background-color: var(--background-color);
      
      a {
        color: white;
        text-decoration: none;
      }

      &.adult {
        --background-color: rgb(86, 32, 32);
      }
    }
  }
}
`

// todo: reduce the amount of DOM elements
export default ({ media }: { media: Media }) => {
  const popularity = useMemo(() =>
    media.popularity
      ? new Intl.NumberFormat('en-US', { notation: 'compact' }).format(media.popularity)
      : undefined,
    [media.popularity]
  )

  return (
    <div css={style}>
      <Title media={media} className="title"/>
      <div className="data">
        <div className="head">
          {/* <Schedule media={media}/> */}
          <div className="infos">
            <div className="sources">
              <Sources handles={media?.handles}/>
            </div>
            <div className="stats">
              <div className="popularity">{popularity}<Users/></div>
              {
                media?.averageScore
                  ? (
                    <div className="score">
                      {(media?.averageScore * 10).toFixed(1)}
                      <Heart/>
                    </div>
                  )
                  : null
              }
            </div>
          </div>
        </div>
        <div className="synopsis">
          {media.description}
        </div>
        <div className="genres">
          {/* {
            media.genres.map(genre =>
              <span key={genre.name} className={`genre${genre.adult ? ' adult' : ''}`}>
                {
                  // todo: replace this link with a link to our own genres page
                  genre.url
                    ? <a href={genre.url} target="_blank" rel="noopener noreferrer">{genre.name}</a>
                    : <>{genre.name}</>
                }
              </span>  
            )
          } */}
        </div>
      </div>
    </div>
  )
}
