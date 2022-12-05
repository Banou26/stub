import { css, keyframes } from '@emotion/react'
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react'
import { Link, navigate } from 'raviger'
import * as N from 'fp-ts/number'
import * as R from 'fp-ts/lib/Record'
import * as O from 'fp-ts/Option'
import * as Alt from 'fp-ts/Alternative'
import { pipe } from 'fp-ts/function'
import { reverse, contramap } from 'fp-ts/ord'
import * as A from 'fp-ts/lib/Array'
import { groupBy, NonEmptyArray } from 'fp-ts/NonEmptyArray'
import { mergeMap } from 'rxjs/operators'
import { filter, from, map, shareReplay } from 'rxjs'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExternalLink, faFileArrowDown, faLink, faMagnet } from '@fortawesome/free-solid-svg-icons'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heart } from 'react-feather'
import DOMPurify from 'dompurify'
import * as marked from 'marked'

import { getRoutePath, Route } from './path'
import { getSeries, Relation, Relationship, searchTitles, Series, TitleHandle } from '../../../../scannarr/src'
import { diceCompare } from '../utils/string'
import { useObservable } from '../utils/use-observable'
import { getHumanReadableByteString } from '../utils/bytes'
import { cachedFetch } from '../utils/fetch'
import Sources from '../components/sources'
import Input from '../components/inputs'
import { sort } from 'fp-ts/lib/ReadonlyArray'
import { toUndefined } from 'fp-ts/lib/Option'
import { LanguageTag } from '../../../../laserr/src/utils'
import Name from '../../../../scannarr/src/types/name'
import { getOrElse } from 'fp-ts/lib/EitherT'

const byResolution =
  pipe(
    reverse(N.Ord),
    contramap(([resolution]: [number | undefined, NonEmptyArray<TitleHandle>]) => resolution)
  )

const byHandleSeeders =
  pipe(
    N.Ord,
    contramap((handle: TitleHandle) => handle.tags?.find(({ type }) => type === 'source')?.value.seeders),
    reverse
  )

const placeHolderShimmer = keyframes`
  0%{
      background-position: -468px 0;
  }
  100%{
      background-position: 468px 0;
  }
`

// todo: re-enable scroll snap on mobile
const style = css`
  display: grid;
  grid-template-columns: 40rem 1fr;
  grid-template-rows: 50rem 1fr;
  padding: 4rem 10rem;

  @media
  screen and (max-width: 1920px),
  screen and (max-height: 1080px) {
    grid-template-columns: 25rem 1fr;
    grid-template-rows: 35rem 1fr;
    padding: 4rem 1rem;
  }

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
    width: 100%;
    object-fit: contain;
  }

  .score {
    display: flex;
    justify-content: space-around;
    align-items: center;
    svg {
      margin-left: 0.5rem;
      color: hsl(338,73%,60%);
    }
  }

  .series {
    @media
    screen and (max-width: 1920px),
    screen and (max-height: 1080px) {
      padding-left: 1rem;
    }
    .title-bar {
      @media
      screen and (max-width: 1920px),
      screen and (max-height: 1080px) {
        font-size: 1.4rem;
      }
      .titles {
        display: flex;
        gap: 2rem;
        align-items: baseline;
        margin-bottom: 2.5rem;

        overflow: hidden;
        /* white-space: nowrap; */
        text-overflow: ellipsis;

        @media
        screen and (max-width: 1920px),
        screen and (max-height: 1080px) {
          margin-bottom: .5rem;
        }

        h1 {
        }

        h2 {
          color: #777777;
        }
      }
    }

    .data {
      display: flex;
      align-items: end;
      margin-bottom: 2.5rem;
      padding-bottom: 1rem;
      border-bottom: 0.1rem solid rgb(75, 75, 75);
      column-gap: 2rem;

      .sources {
        display: grid;
        grid-template-columns: repeat(auto-fill, 3.2rem);
        height: 3.2rem;
        max-width: 20rem;
        column-gap: 0.25rem;
      }

      .date {
        font-weight: 500;
      }
    }

    .synopsis {
      font-weight: 500;
      line-height: 2.5rem;
      white-space: pre-wrap;
      padding-bottom: 1rem;
      border-bottom: 0.1rem solid rgb(75, 75, 75);
      max-height: 30rem;
      overflow: auto;
      @media
      screen and (max-width: 1920px),
      screen and (max-height: 1080px) {
        max-height: 15rem;
      }
    }

    .relations {
      display: grid;
      padding: 1rem;
      gap: 0.5rem;

      @media
      screen and (max-width: 1920px),
      screen and (max-height: 1080px) {
        padding: .5rem;
        gap: 0.25rem;
      }

      div {
        display: flex;

        .name {
          display: flex;
          align-items: start;
          min-width: 9rem;

          svg {
            margin-left: auto;
          }
        }

        @supports selector(.name:has(+.links > a:nth-of-type(2))) {
          .name {
            align-items: center;
          }

          .name:has(+.links > a:nth-of-type(2)) {
            align-items: start;
          }
        }

        span {
          display: flex;
        }

        .links {
          margin-left: 1rem;
          display: flex;
          flex-direction: column;
          column-gap: 1rem;
        }
      }

      a {
        display: flex;
        align-items: center;
        font-size: 1.8rem;
        /* color: #fff; */
        text-decoration: none;
        
        span {
          margin: 0 1rem;
        }
      }
    }
  }

  .titles {
    grid-column: 1 / 3;

    display: grid;
    grid-template-columns: 1fr 1fr;

    .list {
      display: grid;
      grid-auto-rows: 7.5rem;
      grid-gap: 1.1rem;
      padding-left: 10rem;
      margin-right: 10rem;
      margin-top: 5rem;
      max-height: 85rem;
      overflow-y: auto;
      /* scroll-snap-type: y proximity; */

      @media
      screen and (max-width: 1920px),
      screen and (max-height: 1080px) {
        padding-left: 0;
        margin-right: 2.5rem;
        /* margin-right: 5rem; */
        margin-top: 1.5rem;
        max-height: 60rem;
      }

      .title {
        display: grid;
        grid-template-columns: fit-content(5rem) auto auto;
        align-items: center;
        padding: 2.5rem;
        background-color: rgb(35, 35, 35);
        cursor: pointer;
        color: #fff;
        /* scroll-snap-align: start; */

        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        &:hover {
          background-color: rgb(42, 42, 42);
        }

        .name {
          display: flex;
          gap: 2rem;

          @media
          screen and (max-width: 1920px),
          screen and (max-height: 1080px) {
            max-width: 60rem;
          }

          .main, .secondary {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
          .main {}
          .secondary {
            color: #777777;
          }
        }

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
        .data {
          display: grid;
          grid-template-columns: auto 1fr;
          margin-left: auto;

          .date {
            margin-left: 2rem;
            min-width: 10rem;
          }
        }
      }
    }

    .title-side {
      display: flex;
      flex-direction: column;
      min-height: 90rem;
      /* height: 90rem; */
      background-color: rgb(35, 35, 35);
      padding: 2rem 2.5rem;

      @media
      screen and (max-width : 2560px),
      screen and (max-height : 1440px) {
        min-height: 80rem;
      }

      @media
      screen and (max-width: 1920px),
      screen and (max-height: 1080px) {
        min-height: 60rem;
      }

      .title {
        display: flex;
        gap: 2rem;
        /* display: grid;
        grid-auto-flow: column; */
        /* grid-template-columns: fit-content(100%) auto; */
        /* grid-gap: 1rem; */
        align-items: baseline;
        margin-bottom: 2.5rem;
        padding-bottom: 1rem;
        border-bottom: 0.1rem solid rgb(75, 75, 75);

        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        @media
        screen and (max-width: 1920px),
        screen and (max-height: 1080px) {
          font-size: 1.4rem;
          gap: 1rem;
        }

        h3 {
          color: #777777;
        }
      }

      & > .info {
        height: 27.5rem;
        display: flex;
        align-items: flex-start;
        gap: 2rem;
        padding-bottom: 1rem;
        border-bottom: 0.1rem solid rgb(75, 75, 75);

        @media
        screen and (max-width: 1920px),
        screen and (max-height: 1080px) {
          height: 17.5rem;
          gap: 1rem;
        }

        .thumbnail {
          height: 100%;
        }

        .synopsis {
          height: 100%;
          overflow: auto;
          font-weight: 500;
          line-height: 2.5rem;
          white-space: pre-wrap;
          padding-right: 1rem;
        }

      }

      .search-override {
        margin: 2rem;
        width: 40rem;
      }

      .resolutions {
        display: grid;
        grid-auto-flow: column;
        grid-gap: 1rem;

        span {
          cursor: pointer;
          padding: 1rem;
          text-align: center;
          border: 0.1rem solid rgb(75, 75, 75);
          &:hover {
            background-color: rgb(42, 42, 42);
          }
        }
        span.selected {
          background-color: rgb(75, 75, 75);
        }
      }

      .sources {
        display: grid;
        grid-template-columns: 1fr 1fr;
        margin-top: 1rem;
        column-gap: 2rem;
        row-gap: 1rem;
        overflow: auto;
        max-height: 30rem;

        .source {
          display: grid;
          grid-template-columns: fit-content(13rem) auto auto;
          align-items:center;
          /* height: 3.2rem; */
          margin: 0.5rem 0;
          padding: 1rem;
          border: 0.1rem solid rgb(75, 75, 75);
          cursor: pointer;

          &:hover {
            background-color: rgb(42, 42, 42);
          }

          &.selected {
            background-color: rgb(75, 75, 75);
          }

          .team {
            display: flex;
            align-items: center;
            height: 3.2rem;
            color: #fff;
            /* margin-right: 1rem; */
            text-decoration: none;

            @media
            screen and (max-width: 1920px),
            screen and (max-height: 1080px) {
              width: 4rem;
              overflow: hidden;
              /* white-space: nowrap; */
              text-overflow: ellipsis;
            }
          }

          .team[href]:hover {
            text-decoration: underline;
          }

          .team-icon {
            height: 3.2rem;
            width: 3.2rem;
            margin-left: 0.5rem;
            margin-right: 0.5rem;
          }

          .name {
            margin: auto;
            padding: 0 2rem;
          }

          .info {
            display: flex;
            align-items:center;
            gap: 1rem;
            margin-left: auto;

            .torrent {
              display: grid;
              grid-template-columns: 1fr auto;

              .status {
                display: grid;
                grid-template-rows: 1fr auto;
                color: #fff;
                text-decoration: none;
                
                .seeders, .leechers {
                  display: flex;
                  align-items: center;
                }
              }

              .uris {
                display: grid;
                grid-template-rows: repeat( auto-fit, minmax(2rem, 1fr) );
                grid-auto-flow: column;
                .torrent-file, .magnet, .url {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  /* padding: 0 1rem; */
                }
              }
            }
          }
        }
      }

      .actions {
        display: flex;
        margin-top: auto;
        column-gap: 5rem;
        .watch, .download {
          width: 20rem;
          text-transform: uppercase;
          margin: 0.5rem 0;
          padding: 1rem 2rem;
          background-color: rgb(75, 75, 75);
          color: #fff;
          text-decoration: none;
          text-align: center;
        }
      }
    }
  }


  /* @media
  screen and (max-width : 2560px),
  screen and (max-height : 1440px) {
    grid-template-rows: 35rem 1fr;
    
    .series .synopsis {
      max-height: 25rem;
    }
  } */
`

const TitleHandleName = (
  { uri, titleUri, firstTitleUri, handle, setSource, selectedSource }:
  { uri: string, titleUri?: string, firstTitleUri?: string, handle: TitleHandle, setSource: Dispatch<SetStateAction<string | undefined>>, selectedSource: string | undefined }
) => {
  // todo: reintroduce once we support batches
  if (handle.batch) return null
  const { number } = handle
  const teamTag = handle.team
  const teamEpisodeTag = handle.tags?.find(({ type }) => type === 'team-episode')
  const sourceTag = handle.tags?.find(({ type }) => type === 'source')
  const name = handle.names?.at(0)?.name

  const setAsSource = () => {
    setSource(handle.uri)
  }

  return (
    <div
      className={`source ${selectedSource === handle.uri ? 'selected' : ''}`}
      key={`${handle.uri}-${handle.names?.findIndex(({ name: _name }) => _name === name)}`}
      onClick={setAsSource}
    >
      {
        handle.batch
          ? <span>[BATCH]</span>
          : null
      }
      <a href={teamEpisodeTag?.value?.url ?? teamTag?.url} className="team" target="_blank" rel="noopener noreferrer">
        {
          teamTag?.icon
          && (
            <img
              className="team-icon"
              src={teamTag?.icon}
              alt={`[${teamTag?.tag}]`}
              title={teamTag?.name}
              referrer-policy="same-origin"
            />
          )
        }
        <span>
          {
            teamTag?.tag
              ? `[${teamTag?.tag}]`
              : null
          }
        </span>
      </a>
      <span className="name">
        {name} {number ? number.toString().padStart(2, '0') : ''}
      </span>
      <span className="info">
        <span className="size" title={new Intl.NumberFormat('en-US', { unit: 'byte', notation: 'standard', style: 'unit', unitDisplay: 'long' }).format(Math.round(handle.size))}>
          {getHumanReadableByteString(handle.size)}
        </span>
        {
          sourceTag?.value.type === 'torrent-file'
            ? (
              <span className="torrent">
                <div className="uris">
                  <a className="magnet" href={sourceTag?.value.magnetUri}>
                    <FontAwesomeIcon icon={faMagnet}/>
                  </a>
                  <a className="torrent-file" href={sourceTag?.value.url}>
                    <FontAwesomeIcon icon={faFileArrowDown}/>
                  </a>
                  <a className="url" href={handle.url} title="external link" target="_blank" rel="noopener noreferrer">
                    <FontAwesomeIcon icon={faExternalLink}/>
                  </a>
                </div>
                <Link
                  className="status"
                  href={
                    getRoutePath(
                      Route.WATCH,
                      {
                        uri,
                        titleUri:
                          titleUri ?? firstTitleUri,
                        sourceUri: handle.uri
                      }
                    )
                  }
                >
                  <div className="seeders" title={`${sourceTag?.value.seeders} seeders`}>
                    <ChevronUp/>
                    {sourceTag?.value.seeders}
                  </div>
                  <div className="leechers" title={`${sourceTag?.value.leechers} leechers`}>
                    <ChevronDown/>
                    {sourceTag?.value.leechers}
                  </div>
                </Link>
              </span>
            )
            : null
        }
      </span>
    </div>
  )
}

const RelationLink = ({ reference, children }: { reference: Series, children?: React.ReactNode }) =>
  <Link href={getRoutePath(Route.TITLE, { uri: reference.uri })}>
    {
      children
      ?? reference
        .names
        .find(({ language }) => language === 'en')
        ?.name
      ?? (
        reference
          .names
          .at(0)
          ?.name
      )
    }
  </Link>

// todo: fix issue when clicking on resolution, going back to unknown res and back again to res, it stays on unknown res because automatic res becomes disabled, example on http://localhost:1234/app/616331fa7b57db93f0957a18/title/mal:47194/mal:47194-1
export default ({ uri, titleUri }: { uri: string, titleUri?: string }) => {
  const [automaticResolutionSelection, setAutomaticResolutionSelection] = useState<boolean>(true)
  const [selectedResolution, setResolution] = useState<number | undefined>(undefined)
  const [selectedSource, setSource] = useState<string | undefined>()
  const { observable: series$, value: series } = useObservable(() =>
    getSeries({ uri }, { fetch: cachedFetch }),
    [uri]
  )
  const { observable: seriesReplay$ } = useObservable(() => series$.pipe(shareReplay()), [series$])
  const { observable: titles$, value: titles, completed: seriesTitlesCompleted } = useObservable(() =>
    seriesReplay$
      .pipe(
        filter(Boolean),
        mergeMap(series => searchTitles({ series }, { fetch: cachedFetch }))
      ),
    [seriesReplay$]
  )

  const { observable: titlesReplay$ } = useObservable(() => titles$.pipe(shareReplay()), [titles$])

  const firstTitleUri = titles?.at(0)?.uri

  const { value: title, completed: titleHandlesCompleted } = useObservable(
    () =>
      series
        ? (
          titlesReplay$
            .pipe(
              map(titles => titles.find(({ uri }) => uri === (titleUri ?? firstTitleUri))),
              filter(Boolean),
              mergeMap(title => searchTitles({ series, search: title }, { fetch: cachedFetch }))
            )
        )
        : from([]),
    [series, titlesReplay$, titleUri ?? firstTitleUri]
  )
  const seriesTitlesLoading = !seriesTitlesCompleted
  const titlesLoading = !titleHandlesCompleted

  const dateData = series?.dates?.at(0)

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

  const bySeriesSimilarity =
    pipe(
      reverse(N.Ord),
      contramap((_series: TitleHandle) => diceCompare(series?.names.at(0)?.name!, _series.name))
    )

  const mediaTitleHandlesByResolution = useMemo(() => (
    pipe(
      titleHandles,
      A.filter((handle) => handle.number === title?.number),
      A.filter(handle => {
        const meta = handle.tags?.find(({ type }) => type === 'meta')?.value
        if (!meta) return true
        if (meta.includes('HEVC') || meta.includes('x265')) return false
        return true
      }),
      A.filter(handle => !!handle.tags?.find(({ type }) => type === 'source')?.value),
      // A.sort(bySeriesSimilarity),
      // @ts-ignore
      groupBy(handle => handle.resolution?.toString()),
      R.toArray,
      A.map(([resolution, handle]) => [resolution ? Number(resolution) : undefined, handle] as const),
      A.sort(byResolution),
      A.map(([resolution, handles]) => [resolution ? resolution : undefined, handles] as const)
    )
  ), [titleHandles, title?.number])

  const resolutions = useMemo(() => (
    pipe(
      mediaTitleHandlesByResolution,
      A.map(([resolution]) => resolution)
    )
  ), [mediaTitleHandlesByResolution])

  useEffect(() => {
    if((!resolutions.length || !automaticResolutionSelection) && resolutions.includes(selectedResolution)) return
    if (resolutions.filter(Boolean).length) {
      const resolution = Math.max(...resolutions.filter(Boolean) as number[])
      setResolution(resolution)
    } else {
      setResolution(undefined)
    }
  }, [resolutions.map(val => val?.toString() ?? 'undefined').join(','), automaticResolutionSelection])

  const selectResolution = (resolution: number | undefined) => {
    setAutomaticResolutionSelection(false)
    setResolution(resolution ? Number(resolution) : undefined)
  }

  const selectedResolutionTitles = useMemo(() => (
    pipe(
      mediaTitleHandlesByResolution,
      A.filter(([resolution]) => resolution === selectedResolution),
      A.map(([, handle]) => handle),
      A.flatten
    )
  ), [mediaTitleHandlesByResolution, selectedResolution])

  // todo: remove results with no seeders
  const { left: singularTitles, right: batchTitles } = useMemo(() => (
    pipe(
      selectedResolutionTitles,
      A.partition((handle) => Boolean(handle.batch))
    )
  ), [selectedResolutionTitles])

  const mostSeededTitle = useMemo(() => (
    pipe(
      singularTitles,
      sort(byHandleSeeders),
      A.head,
      toUndefined
    )
  ), [singularTitles])

  const mainSeriesName = useMemo(() => (
    series
      ?.names
      ?.find(({ language }) => language === 'en')
      ?.name
    ?? series?.names?.at(0)?.name
  ), [series?.names])

  // todo: replace with this once i impl FP-TS
  // const seriesOption = O.fromNullable(series)
  // const mainSeriesName = pipe(
  //   seriesOption,
  //   O.map(series => series.names),
  //   O.chain((names) => pipe(
  //     names,
  //     A.findFirst(x => x.language == 'en'),
  //     O.alt(() => A.lookup(0, names))
  //   )),
  //   O.map(x => x.name)
  // )

  const secondarySeriesNames = useMemo(() => (
    series
    ?.names
    ?.filter(({ score, name }) => score >= 0.8 && name !== mainSeriesName)
  ), [series?.names])

  const mainTitleName = useMemo(() => (
    title
      ?.names
      ?.find(({ language }) => language === 'en')
      ?.name
    ?? title?.names?.at(0)?.name
  ), [title?.names])

  const secondaryTitleNames = useMemo(() => (
    title
    ?.names
    ?.filter(({ score, name }) => score >= 0.8 && name !== mainTitleName)
  ), [title?.names])

  useEffect(() => {
    if (!mostSeededTitle) return
    setSource(mostSeededTitle.uri)
  }, [selectedResolution, mostSeededTitle])

  console.log('series', series)
  console.log('title', title)
  // console.log('targets', targets)
  // console.log('selectedResolution', selectedResolution)

  const groupedRelations = useMemo(() => (
    pipe(
      series?.relations ?? [],
      groupBy(relation => relation.relation)
    ) as Record<Relationship, NonEmptyArray<Relation<Series>>>
  ), [series?.relations])

  const groupedRelationsArray = useMemo(() => (
    pipe(
      groupedRelations,
      R.toArray
    ) as [Relationship, NonEmptyArray<Relation<Series>>][]
  ), [series?.relations])

  console.log('groupedRelations', groupedRelations)
  console.log('groupedRelationsArray', groupedRelationsArray)

  const synopsis = useMemo(() =>
    <div
      className="message"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(series?.synopses?.at(0)?.synopsis.trim() ?? '')) }}
    ></div>,
    [series?.synopses?.at(0)?.synopsis]
  )

  const poster = useMemo(
    () =>
      series?.images?.find(({ type, size }) => type === 'poster' && size === 'large') ||
      series?.images?.find(({ type, size }) => type === 'poster' && size === 'medium') ||
      series?.images?.find(({ type, size }) => type === 'poster' && size === 'small'),
    [series?.images]
  )

  // todo: add spoiler feature on the episode thumbnail & synopsis
  // todo: maybe checkout https://upscalerjs.com/#/ to improve thumbnail/images quality
  return (
    <div css={style}>
      <img src={poster?.url} alt={`${mainSeriesName} poster`} className="poster" referrer-policy="same-origin" />
      <div className="series">
        <div className="title-bar">
          <div className="titles">
            <h1 title={mainSeriesName}>{mainSeriesName}</h1>
            {
              secondarySeriesNames
                ?.filter((name) => name.language === LanguageTag.JA || name.language === LanguageTag.EN)
                .map((name, i) =>
                  <h2 key={i} title={name.name}>
                    {name.name}
                  </h2>  
                )
            }
          </div>
          <div className="data">
            <div className="date"> 
              {release}
            </div>
            <span className="score">
              {
                series?.averageScore
                  ? (
                    <>
                      <span>{(series?.averageScore * 10).toFixed(1)}</span>
                      <Heart/>
                    </>
                  )
                  : null
              }
            </span>
            <div className="sources">
              <Sources handles={series?.handles}/>
            </div>
          </div>
        </div>
        <div className="synopsis">
          {synopsis}
        </div>
        <div className="relations">
          {
            groupedRelationsArray.length
              ? (
                groupedRelationsArray
                  .map(([relation, relations]) =>
                    <div key={relation}>
                      {
                        relation === 'PREQUEL' ? (
                          <span className="name">Prequel <ChevronLeft/></span>
                        )
                        : relation === 'SEQUEL' ? (
                          <span className="name">Sequel <ChevronRight/></span>
                        )
                        : <span className="name">{relation[0]?.toUpperCase()}{relation.slice(1).replaceAll('_', ' ').toLowerCase()}</span>
                      }
                      <span className="links">
                        {
                          relations.map(relation =>
                            <RelationLink key={relation.reference.uri} reference={relation.reference}/>
                          )
                        }
                      </span>
                    </div>
                  )
              )
              : null
          }
        </div>
      </div>
      <div className="titles">
        <div className="list">
          {
            titles?.map(title => {
              const mainTitleName =
                title
                  ?.names
                  ?.find(({ language }) => language === 'en')
                  ?.name
                ?? title?.names?.at(0)?.name
                ?? `Episode ${title.number}`
            
              const secondaryTitleNames =
                title
                  ?.names
                  ?.filter(({ score, name }) => score >= 0.8 && name !== mainTitleName)

              return (
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
                  <span className="number">
                    {title.names?.at(0)?.name ? title.number ?? '' : ''}
                  </span>
                  <span className="name">
                    <span className="main">{mainTitleName}</span>
                    {
                      secondaryTitleNames?.map((name, i) =>
                        <span key={i} className="secondary">
                          {name.name}
                        </span>
                      )
                    }
                  </span>
                  <span className="data">
                    <span className="score">
                      {
                        title?.averageScore
                          ? (
                            <>
                              <span>{(title?.averageScore * 10).toFixed(1)}</span>
                              <Heart/>
                            </>
                          )
                          : null
                      }
                    </span>
                    <span className="date">{title.dates?.at(0)?.date!.toDateString().slice(4).trim() ?? ''}</span>
                  </span>
                </Link>
              )
            })
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
        <div className="title-side">
          <div className="title">
            <h2>{mainTitleName}</h2>
            {
              secondaryTitleNames?.map((titleName, i) =>
                <h3 key={i}>
                  {titleName.name}
                </h3>
              )
            }
          </div>
          <div className="info">
            {
              title?.images?.at(0)?.url
                ? <img className="thumbnail" src={title?.images?.at(0)?.url} alt="Episode thumbnail"/>
                : null
            }
            <div className="synopsis">
              {
                !title?.synopses ? 'Loading...' :
                title?.synopses?.at(0)?.synopsis ?? 'No synopsis found'
              }
            </div>
          </div>
          <div>
            <div className="search-override">
              <Input
                disabled
                type="text"
                label='Search override [WIP]'
                placeholder={`${
                  series?.names.at(0)?.name
                } ${
                  titles
                    ?.find(({ uri }) => uri === (titleUri ?? firstTitleUri))
                    ?.number
                    ?.toString()
                    .padStart(2, '0')
                }`}
              />
            </div>
            <div className='resolutions'>
              {
                mediaTitleHandlesByResolution.map(([resolution]) =>
                  <span
                    key={resolution ?? 'undefined'}
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
            <div className="sources">
              {batchTitles.map(handle =>
                <TitleHandleName
                  key={handle.uri}
                  uri={uri}
                  titleUri={titleUri}
                  firstTitleUri={firstTitleUri}
                  handle={handle}
                  selectedSource={selectedSource}
                  setSource={setSource}
                />
              )}
              {singularTitles.map(handle =>
                <TitleHandleName
                  key={handle.uri}
                  uri={uri}
                  titleUri={titleUri}
                  firstTitleUri={firstTitleUri}
                  handle={handle}
                  selectedSource={selectedSource}
                  setSource={setSource}
                />
              )}
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
          <div className="actions">
              {
                selectedSource
                  ? (
                    <>
                      <Link
                        className="watch"
                        href={
                          getRoutePath(
                            Route.WATCH,
                            {
                              uri,
                              titleUri: titleUri ?? firstTitleUri,
                              sourceUri: selectedSource
                            }
                          )
                        }
                      >
                        Watch
                      </Link>
                      <div className="download">
                        Download
                      </div>
                    </>
                  )
                  : null
              }
            </div>
        </div>
      </div>
    </div>
  )
}
