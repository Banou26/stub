import { css } from '@emotion/react'

import { EpisodeApolloCache, GET_TITLE } from 'src/apollo'
import { useQuery } from '@apollo/client'
import { GetTitle } from 'src/apollo'
import { Category, Episode } from 'src/lib'
import { useMemo, useState } from 'react'

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
    }

    .episode {
      display: flex;
      align-items: center;
      padding: 2.5rem;
      background-color: rgb(35, 35, 35);
      .number {
        display: inline-block;
        width: 5rem;
      }
      .date {
        margin-left: auto;
      }
    }

    .episode-info {
      background-color: rgb(35, 35, 35);
    }
  }

  /* .title, .synopsis {
    width: 100%;
  } */
`

export default ({ uri }: { uri: string }) => {
  console.log('uri', uri)
  const { error, data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri } })
  const [seasonNumber, setSeasonNumber] = useState(1)
  const [episodeNumber, setEpisodeNumber] = useState(1)
  const episode = useMemo(
    () =>
      title
        ?.episodes
        ?.find(({ season, number }) =>
          season === seasonNumber &&
          number === episodeNumber
        ),
    [title, seasonNumber, episodeNumber]
  )

  console.log('episode', episode)

  console.log('error :(', error)
  console.log('title :)', title)

  const release =
    title?.releaseDates.at(0)
      ? (
        title.releaseDates.at(0)?.date
          ? (
            title.categories.includes(Category.MOVIE)
              ? `${title.releaseDates.at(0)!.date!.getFullYear()}`
              : `${title.releaseDates.at(0)!.date!.toDateString().slice(4).trim()}`
          )
          : `${title.releaseDates.at(0)!.start!.toDateString().slice(4).trim()} to ${title.releaseDates.at(0)!.end!.toDateString().slice(4).trim()}`
      )
      : ''

  console.log('episodessssssssssss', title?.episodes)

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
              <div key={episode.uri} className="episode">
                <span className="number">{episode.names?.at(0)?.name ? episode.number ?? '' : ''}</span>
                <span className="name">{episode.names?.at(0)?.name ?? `Episode ${episode.number}`}</span>
                <span className="date">{episode.releaseDates?.at(0)?.date!.toDateString().slice(4).trim() ?? ''}</span>
              </div>
            ))
          }
        </div>
        <div className="episode-info">
          {episode?.names?.at(0)?.name}
        </div>
      </div>
    </div>
  )
}
