import { getTarget, Series } from '../../../../scannarr/src'

import { useEffect, useMemo, useState } from 'react'
import { Heart, Users } from 'react-feather'
import { css } from '@emotion/react'

import Title from './title'
import Sources from './sources'
import Schedule from './schedule'

const style = css`
display: grid;
grid-template-columns: 25rem 40rem;
background: rgb(35, 35, 35);
overflow: hidden;

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
      grid-template-columns: auto auto;

      .sources {
        display: grid;
        grid-template-columns: repeat(auto-fill, 1.6rem);
        grid-template-rows: repeat(auto-fill, 1.6rem);
        direction: rtl;
      }

      .stats {
        .popularity {
          display: flex;
          justify-content: space-around;
          align-items: center;
        }

        .score {
          display: flex;
          justify-content: space-around;
          align-items: center;
          svg {
            color: hsl(338,73%,60%);
          }
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
export default ({ series }: { series: Series }) => {
  const popularity = useMemo(() =>
    series.popularity
      ? new Intl.NumberFormat('en-US', { notation: 'compact' }).format(series.popularity)
      : undefined,
    [series.popularity]
  )

  return (
    <div css={style}>
      <Title series={series} className="title"/>
      <div className="data">
        <div className="head">
          <Schedule series={series}/>
          <div className="infos">
            <div className="sources">
              <Sources handles={series?.handles}/>
            </div>
            <div className="stats">
              <div className="popularity">{popularity}<Users/></div>
              {
                series?.averageScore
                  ? (
                    <div className="score">
                      <span>{(series?.averageScore * 10).toFixed(1)}</span>
                      <Heart/>
                    </div>
                  )
                  : null
              }
            </div>
          </div>
        </div>
        <div className="synopsis">
          {series.synopses.at(0)?.synopsis}
        </div>
        <div className="genres">
          {
            series.genres.map(genre =>
              <span key={genre.name} className={`genre${genre.adult ? ' adult' : ''}`}>
                {
                  // todo: replace this link with a link to our own genres page
                  genre.url
                    ? <a href={genre.url} target="_blank" rel="noopener noreferrer">{genre.name}</a>
                    : <>{genre.name}</>
                }
              </span>  
            )
          }
        </div>
      </div>
    </div>
  )
}
