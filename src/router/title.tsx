import { css } from '@emotion/react'
import { Link, navigate } from 'raviger'
import { groupBy, NonEmptyArray, sort, sortBy } from 'fp-ts/NonEmptyArray'
import * as R from 'fp-ts/lib/Record'
import { reverse, contramap } from 'fp-ts/ord'
import { pipe } from 'fp-ts/function'
import * as N from 'fp-ts/number'

import { getRoutePath, Route } from './path'
import * as A from 'fp-ts/lib/Array'
import { getHumanReadableByteString } from '../utils/bytes'
import { useEffect, useMemo, useState } from 'react'

import { getSeries } from '../../../../scannarr/src'
import { useFetch } from 'src/utils/use-fetch'
import { fetch } from '@mfkn/fkn-lib'

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

  .titles {
    grid-column: 1 / 3;

    display: grid;
    grid-template-columns: 1fr 1fr;

    .list {
      display: grid;
      grid-auto-rows: 7.5rem;
      grid-gap: 1rem;
      padding: 10rem;
      padding-top: 5rem;

      .title {
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

    .title-info {
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

// type TitleHandleName = GetTitle['title']['names'][number]

export default ({ uri, titleUri }: { uri: string, titleUri?: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  const [selectedResolution, setResolution] = useState<number | undefined>(1080)
  const { data: series } = useFetch(() => getSeries({ uri }, { fetch }))
  console.log('YEEEEEEEEEEEEET', series)
  // const { data: { series } = {} } = useQuery<GetSeries>(GET_TITLE, { variables: { uri: firstUri } })
  const firstTitleUri = series?.titles.at(0)?.uri
  // const { loading: titleLoading, data: { title } = {} } = useQuery<GetTitle>(GET_EPISODE, { variables: { uri: titleUri ?? firstTitleUri, series }, skip: !firstTitleUri || !series })
  // const { loading: loadingTargets, data: { targets } = {} } = useQuery<GetTargets>(GET_TARGETS)

  // const series = undefined
  const title = undefined
  const titleLoading = true
  const loadingTargets = true
  const dateData = series?.dates.at(0)

  const release =
    series && dateData
      ? (
        'date' in dateData
          ? (
            series.categories.some(category => category === 'MOVIE')
              ? `${dateData.date.getFullYear()}`
              : `${dateData.date.toDateString().slice(4).trim()}`
          )
          : `${
            dateData
              .start
              .toDateString()
              .slice(4)
              .trim()
          } to ${
            dateData.end
            ? (
              dateData
                .end
                .toDateString()
                .slice(4)
                .trim()
            )
            : 'unknown'
          }`
      )
      : ''

  const getSchemeTarget = (scheme: string) =>
    targets
      ?.find(({ scheme: _scheme }) => _scheme === scheme)

  const titlesByNames = title?.names ?? []

  const byResolution =
    pipe(
      reverse(N.Ord),
      contramap(([resolution]: [number, NonEmptyArray<TitleHandleName>]) => resolution)
    )

  const bySeriesSimilarity =
    pipe(
      reverse(N.Ord),
      contramap((_series: TitleHandleName) => diceCompare(series?.names.at(0)?.name!, _series.name))
    )

  const mediaTitlesNameByResolution =
    pipe(
      titlesByNames,
      A.filter(name => !!name.handle.type),
      A.sort(bySeriesSimilarity),
      // @ts-ignore
      groupBy(name => name.handle.resolution?.toString()),
      R.toArray,
      A.map(([resolution, name]) => [resolution ? Number(resolution) : undefined, name] as const),
      A.sort(byResolution)
    )

  const resolutions =
    pipe(
      mediaTitlesNameByResolution,
      A.map(([resolution]) => resolution)
    )

  useEffect(() => {
    if(!resolutions.length) return
    if(!resolutions.includes(1080)) setResolution(Math.max(...resolutions))
  }, [resolutions.join(',')])

  const selectedResolutionTitles =
    pipe(
      mediaTitlesNameByResolution,
      A.filter(([resolution]) => resolution === selectedResolution),
      A.map(([, names]) => names),
      A.flatten
    )

  const { left: singularTitles, right: batchTitles } =
    pipe(
      selectedResolutionTitles,
      A.partition((name) => Boolean(name.handle.batch))
    )

  // console.log('series', series)
  // console.log('title', title)
  // console.log('targets', targets)
  // console.log('mediaTitlesNameByResolution', mediaTitlesNameByResolution)
  // console.log('selectedResolution', selectedResolution)

  const renderTitleHandleName = (name: TitleHandleName) => (
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
      <Link href={getRoutePath(Route.WATCH, { uri, titleUri: titleUri ?? firstTitleUri, source: name.handle.uri })}>{name.handle.teamTitle?.team.tag ? `[${name.handle.teamTitle?.team.tag}]` : ''}{name.name} [{getHumanReadableByteString(name.handle.size)}]</Link>
      {/* <a href={name.handle.url}>{name.handle.teamTitle?.team.tag ? `[${name.handle.teamTitle?.team.tag}]` : ''}{name.name} [{getHumanReadableByteString(name.handle.size)}]</a> */}
      {
        !loadingTargets
        && name.handle.teamTitle?.team.icon
        && (
          <img
            src={name.handle.teamTitle.team.icon}
            alt={`${name.handle.teamTitle.team.name} favicon`}
            title={name.handle.teamTitle.team.name}
          />
        )
      }
    </div>
  )

  return (
    <div css={style}>
      <img src={series?.images.at(0)?.url} alt={`${series?.names?.at(0)?.name} poster`} className="poster" />
      <div>
        <div>
          <h1>{series?.names?.at(0)?.name}</h1>
          <div> 
            <span>{release}</span>
          </div>
        </div>
        <div className="synopsis">
          {series?.synopses?.at(0)?.synopsis}
        </div>
      </div>
      <div className="titles">
        <div className="list">
          {
            series?.titles.map(title => (
              // todo: replace the title number with a real number
              <Link
                key={title.uri}
                className={`title ${title.uri === (titleUri ?? firstTitleUri) ? 'selected' : ''}`}
                href={getRoutePath(Route.TITLE_EPISODE, { uri, titleUri: title.uri })}
                onClick={(ev) => {
                  ev.preventDefault()
                  navigate(getRoutePath(Route.TITLE_EPISODE, { uri, titleUri: title.uri }), true)
                }}
              >
                <span className="number">{title.names?.at(0)?.name ? title.number?.at(0).number ?? '' : ''}</span>
                <span className="name">{title.names?.at(0)?.name ?? `Title ${title.number?.at(0).number}`}</span>
                <span className="date">{title.dates?.at(0)?.date!.toDateString().slice(4).trim() ?? ''}</span>
              </Link>
            ))
          }
        </div>
        <div className="title-info">
          <h2>{title?.names?.at(0)?.name}</h2>
          <div className="synopsis">
            {
              titleLoading ? 'Loading...' :
              title?.synopses?.at(0)?.synopsis ?? 'No synopsis found'
            }
          </div>
          <div>
            <br />
            <br />
            <div className='resolutions'>
              {
                mediaTitlesNameByResolution.map(([resolution]) =>
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
              {batchTitles.map(renderTitleHandleName)}
              <br />
              {singularTitles.map(renderTitleHandleName)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
