import { css, keyframes } from '@emotion/react'
import { Link, navigate } from 'raviger'
import * as N from 'fp-ts/number'
import * as R from 'fp-ts/lib/Record'
import { pipe } from 'fp-ts/function'
import { reverse, contramap } from 'fp-ts/ord'
import { groupBy, NonEmptyArray } from 'fp-ts/NonEmptyArray'
import { mergeMap } from 'rxjs/operators'
import { filter, from, map, shareReplay } from 'rxjs'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnet } from '@fortawesome/free-solid-svg-icons'

import { getRoutePath, Route } from './path'
import * as A from 'fp-ts/lib/Array'
import { useEffect, useState } from 'react'

import { getSeries, searchTitles, TitleHandle } from '../../../../scannarr/src'
import { diceCompare } from '../utils/string'
import { useObservable } from '../utils/use-observable'
import { getHumanReadableByteString } from '../utils/bytes'
import { cachedDelayedFetch } from '../utils/fetch'

const placeHolderShimmer = keyframes`
  0%{
      background-position: -468px 0;
  }
  100%{
      background-position: 468px 0;
  }
`

const style = css`
  display: grid;
  grid-template-columns: 40rem 1fr;
  grid-template-rows: 50rem 1fr;
  padding: 10rem;

  .title-placeholder {
    height: 3.2rem;
    width: 45rem;
  }

  .gradient {
    animation-duration: 1.8s;
    animation-fill-mode: forwards;
    animation-iteration-count: infinite;
    animation-name: ${placeHolderShimmer};
    animation-timing-function: linear;
    background: #f6f7f8;
    /* background: linear-gradient(to right, #222222 8%, #323232 38%, #222222 54%); */
    background: linear-gradient(to right, #1c1c1c 8%, #272727 38%, #1c1c1c 54%);
    background-size: 1000px 640px;
    
    position: relative;
  }

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

      .sources {
        display: flex;
        flex-direction: column;
        .source {
          display: flex;
          align-items:center;
          height: 3.2rem;
          margin: 0.5rem 0;
          a {
            height: 3.2rem;
            display: flex;
            align-items: center;
          }
          .team-icon {
            height: 3.2rem;
            width: 3.2rem;
            margin-left: 0.5rem;
          }
        }
      }
    }
  }
`

export default ({ uri, titleUri }: { uri: string, titleUri?: string }) => {
  const [automaticResolutionSelection, setAutomaticResolutionSelection] = useState<boolean>(true)
  const [selectedResolution, setResolution] = useState<number | undefined>(1080)
  const { observable: series$, value: series } = useObservable(() =>
    getSeries({ uri }, { fetch: cachedDelayedFetch }),
    [uri]
  )
  const { observable: titles$, value: titles, completed: seriesTitlesCompleted } = useObservable(() =>
    series$
      .pipe(
        filter(Boolean),
        mergeMap(series => searchTitles({ series }, { fetch: cachedDelayedFetch }))
      ),
    [series$]
  )
  const firstTitleUri = titles?.at(0)?.uri

  const { observable: titlesReplay$ } = useObservable(() => titles$.pipe(shareReplay()), [titles$])

  // todo: fix issue when a title is selected + we refresh the page, it doesn't load the side infos
  const { value: title, completed: titleHandlesCompleted } = useObservable(() =>
    titlesReplay$
      .pipe(
        map(titles => titles.find(({ uri }) => uri === (titleUri ?? firstTitleUri))),
        filter(Boolean),
        mergeMap(title => searchTitles({ series, search: title }, { fetch: cachedDelayedFetch }))
      ),
    [titlesReplay$, titleUri ?? firstTitleUri]
  )
  const seriesTitlesLoading = !seriesTitlesCompleted
  const titlesLoading = !titleHandlesCompleted
  console.log('title', title)
  // console.log('seriesTitlesLoading', seriesTitlesLoading)
  // console.log('titlesLoading', titlesLoading)

  const dateData = series?.dates.at(0)

  const releaseDate =
    series && dateData && 'date' in dateData &&
    (series.categories.some(category => category === 'MOVIE')
      ? `${dateData.date.getFullYear()}`
      : `${dateData.date.toDateString().slice(4).trim()}`)

  const dateStart =
    dateData &&
    !('date' in dateData) &&
    dateData.start.toDateString().slice(4).trim()
  const dateEnd =
    dateData &&
    !('date' in dateData) &&
    dateData.end?.toDateString().slice(4).trim()

  const airingDate =
    series && dateData && !('date' in dateData) &&
    dateData.end
      ? `${dateStart} to ${dateEnd}`
      : `Started ${dateStart}`

  const release =
    series && dateData
      ? (
        'date' in dateData
          ? releaseDate
          : airingDate
      )
      : ''

  const titleHandles = title?.handles ?? []

  const byResolution =
    pipe(
      reverse(N.Ord),
      contramap(([resolution]: [number, NonEmptyArray<TitleHandle>]) => resolution)
    )

  const bySeriesSimilarity =
    pipe(
      reverse(N.Ord),
      contramap((_series: TitleHandle) => diceCompare(series?.names.at(0)?.name!, _series.name))
    )

  const mediaTitleHandlesByResolution =
    pipe(
      titleHandles,
      A.filter(handle => {
        const meta = handle.tags.find(({ type }) => type === 'meta')?.value
        if (!meta) return true
        if (meta.includes('HEVC') || meta.includes('x265')) return false
        return true
      }),
      A.filter(handle => !!handle.tags.find(({ type }) => type === 'source')?.value),
      // A.sort(bySeriesSimilarity),
      // @ts-ignore
      groupBy(handle => handle.tags.find(({ type }) => type === 'resolution').value?.toString()),
      R.toArray,
      A.map(([resolution, handle]) => [resolution ? Number(resolution) : undefined, handle] as const),
      A.sort(byResolution)
    )

  const resolutions =
    pipe(
      mediaTitleHandlesByResolution,
      A.map(([resolution]) => resolution)
    )

  useEffect(() => {
    if(!resolutions.length || !automaticResolutionSelection) return
    setResolution(Math.max(...resolutions))
  }, [resolutions.join(','), automaticResolutionSelection])

  const selectResolution = (resolution: number) => {
    setAutomaticResolutionSelection(false)
    setResolution(resolution ? Number(resolution) : undefined)
  }

  const selectedResolutionTitles =
    pipe(
      mediaTitleHandlesByResolution,
      A.filter(([resolution]) => resolution === selectedResolution),
      A.map(([, handle]) => handle),
      A.flatten
    )

  const { left: singularTitles, right: batchTitles } =
    pipe(
      selectedResolutionTitles,
      A.partition((handle) => Boolean(handle.tags.find(({ type }) => type === 'batch')?.value))
    )

  // console.log('series', series)
  // console.log('title', title)
  // console.log('targets', targets)
  // console.log('selectedResolution', selectedResolution)

  const renderTitleHandleName = (handle: TitleHandle) => {
    const teamTag = handle.tags.find(({ type }) => type === 'team')
    const teamEpisodeTag = handle.tags.find(({ type }) => type === 'team-episode')
    const sizeTag = handle.tags.find(({ type }) => type === 'size')
    const sourceTag = handle.tags.find(({ type }) => type === 'source')
    const batchTag = handle.tags.find(({ type }) => type === 'batch')
    const name = handle.names.at(0)?.name
    console.log('handle', handle)
    return (
      <div className="source" key={`${handle.uri}-${handle.names.findIndex(({ name: _name }) => _name === name)}`}>
        {
          batchTag?.value
            ? '[BATCH]'
            : ''
        }
        <Link
          href={getRoutePath(Route.WATCH, { uri, titleUri: titleUri ?? firstTitleUri, sourceUri: handle.uri })}
        >
          {teamTag?.value.tag ? `[${teamTag?.value.tag}]` : ''}
          {name}
           [{getHumanReadableByteString(sizeTag?.value)}]
        </Link>
        <a href={teamEpisodeTag?.value?.url ?? teamTag?.value.url}>
          {
            teamTag?.value.icon
            && (
              <img
                className="team-icon"
                src={teamTag?.value.icon}
                alt={`${teamTag?.value.name} favicon`}
                title={teamTag?.value.name}
              />
            )
          }
        </a>
        {
          sourceTag?.value.type === 'torrent-file'
            ? (
              <span>
                <span>
                  <span>{sourceTag?.value.seeders}</span>
                  <span>/</span>
                  <span>{sourceTag?.value.leechers}</span>
                </span>
                <span>
                  <a href={sourceTag?.value.magnetUri}>
                    <FontAwesomeIcon icon={faMagnet}/>
                  </a>
                </span>
              </span>
            )
            : null
        }
      </div>
    )
  }

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
            titles?.map(title => (
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
                <span className="number">{title.names?.at(0)?.name ? title.number ?? '' : ''}</span>
                <span className="name">{title.names?.at(0)?.name ?? `Title ${title.number}`}</span>
                <span className="date">{title.dates?.at(0)?.date!.toDateString().slice(4).trim() ?? ''}</span>
              </Link>
            ))
          }
          {
            seriesTitlesLoading && (
              [...Array(titles?.length ? 3 : 10).keys()].map((i, _, arr) =>
                <div key={i} className="title gradient" style={{ opacity: 1 / (arr.length / (arr.length - i)) }}>
                </div>
              )
            )
          }
        </div>
        <div className="title-info">
          <h2>{title?.names?.at(0)?.name}</h2>
          <div className="synopsis">
            {
              !title?.synopses ? 'Loading...' :
              title?.synopses?.at(0)?.synopsis ?? 'No synopsis found'
            }
          </div>
          <div>
            <br />
            <br />
            <div className='resolutions'>
              {
                mediaTitleHandlesByResolution.map(([resolution]) =>
                  <span
                    key={resolution}
                    className={((resolution ? Number(resolution) : undefined) === selectedResolution) ? 'selected' : ''}
                    onClick={() => selectResolution(resolution)}
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
            <div className="sources">
              {batchTitles.map(renderTitleHandleName)}
              <br />
              {singularTitles.map(renderTitleHandleName)}
              {
                titlesLoading && (
                  [...Array(selectedResolutionTitles?.length ? 3 : 10).keys()].map((i, _, arr) =>
                    <div key={i} className="title-placeholder gradient source" style={{ opacity: 1 / (arr.length / (arr.length - i)) }}>
                    </div>
                  )
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
