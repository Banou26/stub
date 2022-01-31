import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { Link } from 'raviger'

import { GET_TITLE, GET_EPISODE, GetTitle, GetEpisode } from 'src/apollo'
import { Category, fromUri, toUri } from 'src/lib'
import { useMemo } from 'react'
import { getRoutePath, Route } from '../path'

const style = css`
  display: grid;
  grid-template-columns: 40rem 1fr;
  grid-template-rows: 50rem 1fr;
  padding: 10rem;

  .poster {
    height: 100%;
  }

  h1 {
    margin-bottom: 2.5rem;
  }

  h1 + div {
    font-weight: 500;
    margin-bottom: 2.5rem;
  }

  .synopsis {
    font-weight: 500;
    line-height: 2.5rem;
    white-space: pre-wrap;
  }

  .episodes {
    grid-column: 1 / 3;

    display: grid;
    grid-template-columns: 1fr 1fr;

    .list {
      display: grid;
      grid-auto-rows: 7.5rem;
      grid-gap: 1rem;
      padding: 10rem;

      .episode {
        display: flex;
        align-items: center;
        padding: 2.5rem;
        background-color: rgb(35, 35, 35);
        cursor: pointer;
        color: #fff;

        &:hover {
          text-decoration: none;
        }

        &.selected {
          background-color: rgb(75, 75, 75);
        }

        .number {
          display: inline-block;
          width: 5rem;
        }
        .date {
          margin-left: auto;
        }
      }
    }

    .episode-info {
      background-color: rgb(35, 35, 35);
      padding: 2.5rem;

      h2 {
        margin-bottom: 2.5rem;
      }
    }
  }
`

export default ({ uri, episodeUri }: { uri: string, episodeUri?: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  const { data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri: firstUri } })
  const firstEpisodeUri = title?.episodes.at(0)?.uri
  const { loading: episodeLoading, data: { episode } = {} } = useQuery<GetEpisode>(GET_EPISODE, { variables: { uri: episodeUri ?? firstEpisodeUri, title }, skip: !firstEpisodeUri || !title })

  const release =
    title?.releaseDates.at(0)
      ? (
        title.releaseDates.at(0)?.date
          ? (
            title.categories.some(categoryHandle => categoryHandle.category === Category.MOVIE)
              ? `${title.releaseDates.at(0)!.date!.getFullYear()}`
              : `${title.releaseDates.at(0)!.date!.toDateString().slice(4).trim()}`
          )
          : `${title.releaseDates.at(0)!.start!.toDateString().slice(4).trim()} to ${title.releaseDates.at(0)!.end!.toDateString().slice(4).trim()}`
      )
      : ''

  console.log('title', title)
  console.log('episode', episode)

  return (
    <div css={style}>
      <img src={title?.images.at(0)?.url} alt={`${title?.names?.at(0)?.name} poster`} className="poster" />
      <div>
        <div>
          <h1>{title?.names?.at(0)?.name}</h1>
          <div> 
            <span>{release}</span>
          </div>
        </div>
        <div className="synopsis">
          {title?.synopses?.at(0)?.synopsis}
        </div>
      </div>
      <div className="episodes">
        <div className="list">
          {
            title?.episodes.map(episode => (
              // todo: replace the episode number with a real number
              <Link key={episode.uri} className={`episode ${episode.uri === episodeUri ? 'selected' : ''}`} href={getRoutePath(Route.TITLE_EPISODE, { uri, episodeUri: episode.uri })}>
                <span className="number">{episode.names?.at(0)?.name ? episode.number ?? '' : ''}</span>
                <span className="name">{episode.names?.at(0)?.name ?? `Episode ${episode.number}`}</span>
                <span className="date">{episode.releaseDates?.at(0)?.date!.toDateString().slice(4).trim() ?? ''}</span>
              </Link>
            ))
          }
        </div>
        <div className="episode-info">
          <h2>{episode?.names?.at(0)?.name}</h2>
          <div className="synopsis">
            {
              episodeLoading ? 'Loading...' :
              episode?.synopses?.at(0)?.synopsis ?? 'No synopsis found'
            }
          </div>
          <div>
            <br />
            <br />
            <br />
            <div>Episodes found:</div>
            <br />
            <div>
              {
                episode?.names.map(name => (
                  <div>
                    <a key={name.uri} href={episode?.handles.find(handle => handle.uri === name.uri)?.url}>{name.name}</a>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
