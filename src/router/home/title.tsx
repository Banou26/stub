import { css } from '@emotion/react'
import { useQuery } from '@apollo/client'
import { Link, navigate } from 'raviger'
import { groupBy, NonEmptyArray, sort, sortBy } from 'fp-ts/NonEmptyArray'
import * as R from 'fp-ts/lib/Record'
import { reverse, contramap } from 'fp-ts/ord'
import { pipe } from 'fp-ts/function'
import * as N from 'fp-ts/number'

import { GET_TITLE, GET_EPISODE, GetTitle, GetEpisode, GET_TARGETS, GetTargets } from 'src/apollo'
import { Category, diceCompare } from 'src/lib'
import { getRoutePath, Route } from '../path'
import * as A from 'fp-ts/lib/Array'
import { getHumanReadableByteString } from 'src/lib/utils/bytes'
import { useEffect, useState } from 'react'

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
    padding-bottom: 1rem;
    border-bottom: 0.1rem solid rgb(75, 75, 75);
  }

  .synopsis {
    font-weight: 500;
    line-height: 2.5rem;
    white-space: pre-wrap;
    padding-bottom: 1rem;
    border-bottom: 0.1rem solid rgb(75, 75, 75);
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
      padding-top: 5rem;

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
      height: 90rem;
      background-color: rgb(35, 35, 35);
      padding: 2.5rem;

      h2 {
        margin-bottom: 2.5rem;
        padding-bottom: 1rem;
        border-bottom: 0.1rem solid rgb(75, 75, 75);
      }

      .resolutions {
        display: grid;
        grid-auto-flow: column;
        grid-gap: 1rem;

        span {
          cursor: pointer;
          padding: 1rem;
          text-align: center;
        }
        .selected {
          background-color: rgb(75, 75, 75);
        }
      }
    }
  }
`

type EpisodeHandleName = GetEpisode['episode']['names'][number]

export default ({ uri, episodeUri }: { uri: string, episodeUri?: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  const [selectedResolution, setResolution] = useState<number | undefined>(1080)
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

  const episodesByNames = episode?.names ?? []

  const byResolution =
    pipe(
      reverse(N.Ord),
      contramap(([resolution]: [number, NonEmptyArray<EpisodeHandleName>]) => resolution)
    )

  const byTitleSimilarity =
    pipe(
      reverse(N.Ord),
      contramap((_title: EpisodeHandleName) => diceCompare(title?.names.at(0)?.name!, _title.name))
    )

  const mediaEpisodesNameByResolution =
    pipe(
      episodesByNames,
      A.filter(name => !!name.handle.type),
      A.sort(byTitleSimilarity),
      // @ts-ignore
      groupBy(name => name.handle.resolution?.toString()),
      R.toArray,
      A.map(([resolution, name]) => [resolution ? Number(resolution) : undefined, name] as const),
      A.sort(byResolution)
    )

  const resolutions =
    pipe(
      mediaEpisodesNameByResolution,
      A.map(([resolution]) => resolution)
    )

  useEffect(() => {
    if(!resolutions.length) return
    if(!resolutions.includes(1080)) setResolution(Math.max(...resolutions))
  }, [resolutions.join(',')])

  const selectedResolutionEpisodes =
    pipe(
      mediaEpisodesNameByResolution,
      A.filter(([resolution]) => resolution === selectedResolution),
      A.map(([, names]) => names),
      A.flatten
    )

  const { left: singularEpisodes, right: batchEpisodes } =
    pipe(
      selectedResolutionEpisodes,
      A.partition((name) => Boolean(name.handle.batch))
    )

  // console.log('title', title)
  // console.log('episode', episode)
  // console.log('targets', targets)
  // console.log('mediaEpisodesNameByResolution', mediaEpisodesNameByResolution)
  // console.log('selectedResolution', selectedResolution)

  const renderEpisodeHandleName = (name: EpisodeHandleName) => (
    <div key={`${name.handle.uri}-${name.handle.names.findIndex(({ name: _name }) => _name === name.name)}`}>
      {
        name.handle.batch
          ? '[BATCH]'
          : ''
      }
      {
        !loadingTargets
        && (
          <img
            src={getSchemeTarget(name.handle.scheme)!.icon}
            alt={`${getSchemeTarget(name.handle.scheme)!.name} favicon`}
            title={getSchemeTarget(name.handle.scheme)!.name}
          />
        )
      }
      <Link href={getRoutePath(Route.WATCH, { uri, episodeUri: episodeUri ?? firstEpisodeUri, source: name.handle.uri })}>{name.handle.teamEpisode?.team.tag ? `[${name.handle.teamEpisode?.team.tag}]` : ''}{name.name} [{getHumanReadableByteString(name.handle.size)}]</Link>
      {/* <a href={name.handle.url}>{name.handle.teamEpisode?.team.tag ? `[${name.handle.teamEpisode?.team.tag}]` : ''}{name.name} [{getHumanReadableByteString(name.handle.size)}]</a> */}
      {
        !loadingTargets
        && name.handle.teamEpisode?.team.icon
        && (
          <img
            src={name.handle.teamEpisode.team.icon}
            alt={`${name.handle.teamEpisode.team.name} favicon`}
            title={name.handle.teamEpisode.team.name}
          />
        )
      }
    </div>
  )

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
              <Link
                key={episode.uri}
                className={`episode ${episode.uri === (episodeUri ?? firstEpisodeUri) ? 'selected' : ''}`}
                href={getRoutePath(Route.TITLE_EPISODE, { uri, episodeUri: episode.uri })}
                onClick={(ev) => {
                  ev.preventDefault()
                  navigate(getRoutePath(Route.TITLE_EPISODE, { uri, episodeUri: episode.uri }), true)
                }}
              >
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
            <div className='resolutions'>
              {
                mediaEpisodesNameByResolution.map(([resolution]) =>
                  <span
                    key={resolution}
                    className={((resolution ? Number(resolution) : undefined) === selectedResolution) ? 'selected' : ''}
                    onClick={() => setResolution(resolution ? Number(resolution) : undefined)}
                  >
                    {
                      resolution
                        ? `${resolution}p`
                        : 'Unknown resolution'
                    }
                  </span>
                )
              }
            </div>
            <br />
            <div>
              {batchEpisodes.map(renderEpisodeHandleName)}
              <br />
              {singularEpisodes.map(renderEpisodeHandleName)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
