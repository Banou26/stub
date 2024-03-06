import { css } from '@emotion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { targets } from 'laserr'
import { useQuery, useSubscription } from 'urql'

// import './preview-modal.css'
import { gql } from '../../generated'
import { overlayStyle } from '../../components/modal'
import { useEffect, useMemo, useState } from 'react'
// import { Link, useSearchParams } from 'react-router-dom'
import { MinimalPlayer } from '../../components/minimal-player'
import { Route, getRoutePath } from '../path'
import { mergeScannarrUris, toScannarrUri, toUriEpisodeId } from 'scannarr'
import { Episode } from 'scannarr'
import { Link, Redirect, useLocation, useSearch } from 'wouter'
import { Pagination } from '../../components/pagination'
import { fromScannarrUri } from 'scannarr'

const style = css`
overflow: auto;
${overlayStyle}
/* position: fixed;
inset: 0; */
display: flex;
justify-content: center;
/* align-items: center; */
padding: 5rem;
/* padding-bottom: 20rem; */
/* top: 50%;
left: 50%; */

z-index: 125;
pointer-events: none;

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 120rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  /* overflow: auto; */
  /* position: fixed;
  top: 50%;
  left: 50%; */
  /* transform: translate(0rem, 15rem); */
  /* transform: translate(-50%, -50%); */
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
  height: min-content;
  /* max-height: 90vh; */

  .origin-icon {
    margin: 0 1rem;
  }

  .trailer {
    border-radius: 1rem 1rem 0 0;
    overflow: hidden;

    .volume-area-wrapper {
      z-index: 100;
    }
  }

  .player {
    position: relative;
    display: grid;
    grid-template:"container";
    height: 67.5rem;
    width: 100%;
    background-color: rgb(35, 35, 35);
    overflow: hidden;
    user-select: none;

    & > div:first-of-type {
      grid-area: container;
      height: 89.25rem !important;
      width: 100% !important;
      margin-top: -11rem;
      pointer-events: none;
    }
  }

  & > .content {
    margin: 2.5rem;
    
    .title {
      display: flex;
      justify-content: start;
      align-items: center;

      h2 {
        font-size: 3rem;
      }

      .origins {
        display: flex;
        justify-content: start;
        align-items: center;
        margin-left: 1rem;

        a {
          display: flex;
          justify-content: center;
          align-items: center;
          
          img {
            height: 3rem;
            width: 3rem;
          }
        }
      }
    }

    & > .description {
      margin-top: 2.5rem;
    }

    .metadata-only {
      display: flex;
      flex-direction: column;
      margin: 4rem auto;
      margin-bottom: 0;
      width: fit-content;

      padding: 1rem;
      background-color: rgb(190, 45, 45);
      border-radius: 1rem;

      background-color: rgb(190, 45, 45);
      border: .1rem solid #f44336;
      border-radius: .6rem;

      div {
        display: flex;
        justify-content: center;
        align-items: center;
        font-weight: bold;
        font-size: 2rem;
      }
    }

    .episodes {
      margin-top: 4rem;
      border-top: .1rem solid rgba(255, 255, 255, .1);

      .episode {
        display: grid;
        grid-template-columns: 7rem auto 12.5rem;
        height: 10rem;
        border-bottom: .1rem solid rgba(255, 255, 255, .1);
        color: #fff;
        text-decoration: none;
        overflow: hidden;

        &:last-of-type {
          border-bottom: none;
        }

        &:hover {
          .title {
            text-decoration: underline;
          }
        }

        .information, .episode-number, .date {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .date {
          justify-content: end;
        }

        .content {
          display: flex;
          align-items: center;

          .thumbnail {
            display: flex !important;
            height: 7.5rem;
            background-color: rgba(255, 255, 255, .1);
            border-radius: .5rem;
          }

          .information {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-left: 2.5rem;
            padding-top: 1rem;
            padding-right: 1rem;
            /* justify-content: start; */

            &:has(.empty) {
              padding-left: 0;
            }

            .title {
              margin-right: auto;
              font-size: 2rem;
              font-weight: bold;

              &.empty {
                font-weight: normal;
              }
            }

            .description {
              display: flex;
              font-size: 1.5rem;
              margin-right: auto;
              color: rgba(255, 255, 255, .8);
              margin-top: 1rem;
            }
          }
        }

        .episode-number {
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 3rem;
          vertical-align: middle;
        }
      }
    }
  }
}

`

export const GET_PREVIEW_MODAL_MEDIA = `#graphql
  subscription GetPreviewModalMedia($input: MediaInput!) {
    media(input: $input) {
      handles {
        edges {
          node {
            handles {
              edges {
                node {
                  origin
                  id
                  uri
                }
              }
            }
            ...GetPreviewModalMediaFragment
          }
        }
      }
      ...GetPreviewModalMediaFragment
    }
  }

  fragment GetPreviewModalMediaEpisodeFragment on Episode {
    origin
    id
    uri
    url
    handles {
      edges {
        node {
          origin
          id
          uri
          url
        }
      }
    }
    airingAt
    number
    mediaUri
    timeUntilAiring
    thumbnail
    title {
      romanized
      english
      native
    }
    description
  }

  fragment GetPreviewModalMediaFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    episodes {
      edges {
        node {
          ...GetPreviewModalMediaEpisodeFragment
        }
      }
    }
  }
`


export const GET_ORIGINS = gql(`#graphql
  query GetOrigins($input: OriginPageInput!) {
    originPage(input: $input) {
      id
      name
      official
      metadataOnly
    }
  }
`)

// http://localhost:4560/test?details=scannarr%3AbWFsOjQ2NTY5LGFuaWxpc3Q6MTI4ODkz

const EpisodeRow = ({ mediaUri, node }: { mediaUri: string, node: Episode }) => {
  const rtf = useMemo(() => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }), [])
  const airingAt = new Date(node.airingAt ?? (Date.now() + node.timeUntilAiring * 1000))
  const airingAtInPast = Date.now() - airingAt.getTime() > 0
  const delta = airingAtInPast ? -(Date.now() - airingAt.getTime()) : Date.now() - airingAt.getTime()
  const daysRelativeAiring = delta / 1000 / 60 / 60 / 24
  const monthsRelativeAiring = delta / 1000 / 60 / 60 / 24 / 30
  const yearsRelativeAiring = monthsRelativeAiring / 12
  const airingAtString =
    Math.abs(yearsRelativeAiring) > 1 ? rtf.format(Math.round(yearsRelativeAiring), 'years')
    : Math.abs(monthsRelativeAiring) > 1 ? rtf.format(Math.round(monthsRelativeAiring), 'months')
    : Math.abs(daysRelativeAiring) >= 0 ? rtf.format(Math.round(daysRelativeAiring), 'days')
    : airingAt.toLocaleString('en-US', { timeZone: 'UTC' }).split(',').at(0)

  const title = airingAt?.toLocaleString('en-US', { timeZone: 'UTC' })

  if (
    (node.timeUntilAiring ? node.timeUntilAiring > 0 : false)
    || airingAt.getTime() - Date.now() > 0
  ) return null

  // todo merge normal uris with the episode uris to keep more sources
  const episodeScannarrUri = toUriEpisodeId(node.uri, node.number)

  const usedTitle =
    node.title?.romanized
    ?? node.title?.english
    ?? node.title?.native

  const [thumbnailErrored, setThumbnailErrored] = useState(false)
  const [fallbackThumbnail, setFallbackThumbnail] = useState<string | undefined>()

  useEffect(() => {
    if (!(node.thumbnail && thumbnailErrored)) return
    fetch(node.thumbnail)
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        setFallbackThumbnail(url)
      })
  }, [node.thumbnail, thumbnailErrored])

  const [thumbnailRef, setThumbnailRef] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!(thumbnailRef && node.thumbnail && thumbnailErrored)) return
    const interval = setInterval(() => {
      const allowedAttributes = ['src', 'alt', 'class', 'style']
      for (const attr of thumbnailRef.getAttributeNames()) {
        if (!allowedAttributes.includes(attr)) thumbnailRef.removeAttribute(attr)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [thumbnailRef, node.thumbnail, thumbnailErrored])

  return (
    <Link
      className="episode"
      to={getRoutePath(Route.WATCH, { mediaUri: mediaUri, episodeUri: episodeScannarrUri })}
    >
      <div className="episode-number">{usedTitle !== undefined && usedTitle !== null ? node.number : undefined}</div>
      <div className="content">
        {
          node.thumbnail
            ? (
              <img
                ref={setThumbnailRef}
                src={fallbackThumbnail ?? node.thumbnail}
                alt=""
                className="thumbnail"
                onError={() => setThumbnailErrored(true)}
              />
            )
            : undefined
        }
        <div className="information">
          <div className={`title ${usedTitle ? '' : 'empty'}`}>
            {
              usedTitle
              ?? `Episode ${node.number}`
            }
          </div>
          {
            node.description
              ? <div className="description">{node.description}</div>
              : undefined
          }
        </div>
      </div>
      <div className="date" title={title}>{airingAtString}</div>
    </Link>
  )
}

export default () => {
  const [location, setLocation] = useLocation()
  const searchParams = new URLSearchParams(useSearch())
  const setSearchParams =
    (init?: string | string[][] | Record<string, string> | URLSearchParams | undefined) =>
      setLocation(`${location}?${new URLSearchParams(init).toString()}`, { replace: true })
  // const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')
  // console.log('mediaUri', mediaUri)
  const [{ fetching, error, data: { media } = { media: undefined } }] = useSubscription({
    query: GET_PREVIEW_MODAL_MEDIA,
    variables: { input: { uri: mediaUri! } },
    pause: !mediaUri
  })
  // console.log('media', media)
  const foundSources = [...new Set(media?.handles.edges.map(edge => edge.node.origin))]
  // console.log('foundSources', foundSources)
  // const [{ error: error2, data: { Page: originPage } = {} }] = useQuery({ query: GET_ORIGINS, variables: { ids: foundSources }, skip: !foundSources })
  // console.log('media', media)
  // console.log('originPage', originPage)

  useEffect(() => {
    if (!media || fetching || !media?.uri || !media.handles.edges.length || !mediaUri) return
    const newUri = media && mergeScannarrUris([
      media.uri,
      toScannarrUri([
        ...new Set(
          media
            .handles
            .edges
            .flatMap(edge =>
              edge
              .node
              .handles
              .edges.map(edge => edge.node.uri)
            )
        )
      ])
    ])
    if (mediaUri === newUri) return
    setTimeout(() => {
      setSearchParams({ details: newUri as string })
    }, 100)
  }, [media, setSearchParams])

  const mediaTargets =
    media &&
    targets
      .filter(target => media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node)
      .map(target => ({
        target,
        media: media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node
      }))

  // console.log('mediaTargets', mediaTargets)

  const onOverlayClick = (ev) => {
    if (ev.target !== ev.currentTarget) return
    const { details, ...rest } = Object.fromEntries(searchParams.entries())
    setSearchParams(rest)
  }

  const [currentPage, setCurrentPage] = useState(0)

  if (!media) {
    return (
      <Dialog.Root open={Boolean(mediaUri)}>
        <Dialog.Portal>
          {/* <Dialog.Overlay css={overlayStyle} onClick={onOverlayClick}/> */}
          <Dialog.Content asChild={true}>
            <div css={style} onClick={onOverlayClick}>
              <div className="modal">
                <div className="trailer">
                  {/* <MinimalPlayer className="player"/> */}
                </div>
                <div className="content">
                  <div className="title">
                    <h2>Loading title...</h2>
                    <div className="origins">
                    </div>
                  </div>
                  <div className="description">Loading description...</div>
                  <div className="episodes">
                    Loading episodes....
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  // console.log('AAAAAAAAAAAAAAA', media.trailers?.at(0)?.id)

  // const onlyMetadataOrigins = originPage?.origin?.every(origin => origin.metadataOnly)

  // const newUri = media && mergeScannarrUris([
  //   media.uri,
  //   toScannarrUri(
  //     media
  //       .handles
  //       .edges
  //       .flatMap(edge =>
  //         edge
  //         .node
  //         .handles
  //         .edges.map(edge => edge.node.uri)
  //       )
  //   )
  // ])

  return (
    <Dialog.Root open={Boolean(mediaUri)}>
      <Dialog.Portal>
        {/* <Dialog.Overlay css={overlayStyle} onClick={onOverlayClick}/> */}
        <Dialog.Content asChild={true}>
          <div css={style} onClick={onOverlayClick}>
            <div className="modal">
              <div className="trailer">
                <MinimalPlayer media={media} className="player"/>
              </div>
              <div className="content">
                <div className="title">
                  <h2>{media?.title?.english}</h2>
                  <div className="origins">
                    {
                      mediaTargets
                        ?.filter(({ media, target }) => media?.url && target.icon && target.official)
                        ?.map(({ target, media }) => (
                          <a key={target.origin} href={media.url ?? target.originUrl} className="origin-icon" target="_blank" rel="noopener noreferrer">
                            <img src={target.icon} alt=""/>
                          </a>
                        ))
                    }
                  </div>
                </div>
                <div className="description" dangerouslySetInnerHTML={{ __html: media?.description }}></div>
                {
                  // onlyMetadataOrigins
                  false
                    ? (
                      <div className="metadata-only">
                        <div>No sources found with playback data for the episodes</div>
                        <div>Click here to search for data source plugins</div>
                      </div>
                    )
                    : undefined
                }
                {
                  // todo: implement this
                  // only extension sources without extension installed
                  false
                    ? (
                      <div className="metadata-only">
                        <div>The only episode sources require the webextension to be installed</div>
                        <div>Click here to install the webextension</div>
                      </div>
                    )
                    : undefined
                }
                <div className="episodes">
                  <Pagination
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    itemsPerPage={15}
                    totalPages={media?.episodes?.edges ? Math.ceil(media.episodes.edges.length / 15) : 0}
                  >
                    {
                      media
                        ?.episodes
                        ?.edges
                        ?.sort((a, b) => (a?.node?.number ?? 0) - (b?.node?.number ?? 0))
                        ?.slice(currentPage * 15, currentPage * 15 + 15)
                        ?.map(({ node }) => <EpisodeRow key={node.uri} mediaUri={mediaUri} node={node}/>)
                      ?? []
                    }
                  </Pagination>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
