import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { Link } from 'raviger'
import { groupBy, NonEmptyArray, sort, sortBy } from 'fp-ts/NonEmptyArray'
import { toArray } from 'fp-ts/lib/Record'
import { reverse, contramap } from 'fp-ts/ord'
import { pipe } from 'fp-ts/function'
import * as N from 'fp-ts/number'

import { GET_TITLE, GET_EPISODE, GetTitle, GetEpisode, GET_TARGETS, GetTargets } from 'src/apollo'
import { Category, diceCompare } from 'src/lib'
import { getRoutePath, Route } from '../path'
import { filter } from 'fp-ts/lib/Array'

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
  const { loading: loadingTargets, data: { targets } = {} } = useQuery<GetTargets>(GET_TARGETS)

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

  const getSchemeTarget = (scheme: string) =>
    targets
      ?.find(({ scheme: _scheme }) => _scheme === scheme)

  const mediaEpisodes = episode?.names ?? []

  const byResolution =
    pipe(
      reverse(N.Ord),
      contramap(([resolution]: [string, NonEmptyArray<GetEpisode['episode']['names'][number]>]) => Number(resolution))
    )

  const byTitleSimilarity =
    pipe(
      reverse(N.Ord),
      contramap((_title: GetEpisode['episode']['names'][number]) => diceCompare(title?.names.at(0)?.name!, _title.name))
    )

  const mediaEpisodesNameByResolution =
    pipe(
      mediaEpisodes,
      filter(name => !!name.handle.type),
      sort(byTitleSimilarity),
      groupBy(name => name.handle.resolution!.toString()),
      toArray,
      sort(byResolution)
    )

  console.log('title', title)
  console.log('episode', episode)
  console.log('targets', targets)
  console.log('mediaEpisodesNameByResolution', mediaEpisodesNameByResolution)

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
              <Link key={episode.uri} className={`episode ${episode.uri === (episodeUri ?? firstEpisodeUri) ? 'selected' : ''}`} href={getRoutePath(Route.TITLE_EPISODE, { uri, episodeUri: episode.uri })}>
                <span className="number">{episode.names?.at(0)?.name ? episode.number?.at(0).number ?? '' : ''}</span>
                <span className="name">{episode.names?.at(0)?.name ?? `Episode ${episode.number?.at(0).number}`}</span>
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
                mediaEpisodesNameByResolution.map(([resolution, episodeNames]) =>
                  <div key={resolution}>
                    <div>{resolution ? `${resolution}p` : 'Unknown resolution'}</div>
                    <div>
                      {
                        episodeNames
                          .map(name => (
                            <div key={`${name.handle.uri}-${name.handle.names.findIndex(({ name: _name }) => _name === name.name)}`}>
                              {
                                !loadingTargets
                                && (
                                  <img
                                    src={getSchemeTarget(name.handle.scheme)!.icon}
                                    alt={`${getSchemeTarget(name.handle.scheme)!.name} favicon`}
                                  />
                                )
                              }
                              <a href={name.handle.url}>{name.name}</a>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
