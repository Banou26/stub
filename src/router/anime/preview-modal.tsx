import { css } from '@emotion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@apollo/client'
import { targets } from 'laserr'

// import './preview-modal.css'
import { gql } from '../../generated'
import { overlayStyle } from '../../components/modal'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MinimalPlayer } from '../../components/minimal-player'
import { Route, getRoutePath } from '../path'
import { mergeScannarrUris, toUriEpisodeId } from 'scannarr/src'

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

z-index: 50;

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
    &:after {
      content: '';
      position: absolute;
      inset: 0;
      height: 67.6rem;
      background: linear-gradient(0deg, #181818, transparent 20%);
      pointer-events: none;
    }
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

  .content {
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
        grid-template-columns: 5rem auto 10rem;
        height: 10rem;
        border-bottom: .1rem solid rgba(255, 255, 255, .1);
        color: #fff;
        text-decoration: none;
        overflow: hidden;


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

        .information {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-left: 2.5rem;
          padding-top: 1rem;
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

export const GET_MEDIA = gql(`#graphql
  query GetMedia($uri: String!, $origin: String, $id: String) {
    Media(uri: $uri, origin: $origin, id: $id) {
      handler
      origin
      id
      uri
      url
      title {
        romanized
        english
        native
      }
      popularity
      shortDescription
      description
      season
      seasonYear
      coverImage {
        color
        default
      }
      bannerImage
      handles {
        edges {
          node {
            handler
            origin
            id
            uri
            url
            title {
              romanized
              english
              native
            }
            trailers {
              handler
              origin
              id
              uri
              url
              thumbnail
            }
            season
            seasonYear
            popularity
            shortDescription
            description
            handles {
              edges {
                node {
                  handler
                  origin
                  id
                  uri
                  url
                }
              }
            }
            episodes {
              edges {
                node {
                  airingAt
                  number
                  uri
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
              }
            }
          }
        }
      }
      trailers {
        handler
        origin
        id
        uri
        url
        thumbnail
      }
      episodes {
        edges {
          node {
            handler
            origin
            id
            uri
            url
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
        }
      }
    }
  }
`)


export const GET_ORIGINS = gql(`#graphql
  query GetOrigins($ids: [String!]) {
    Page {
      origin(ids: $ids) {
        id
        name
        official
        metadataOnly
      }
    }
  }
`)

// http://localhost:4560/test?details=scannarr%3AbWFsOjQ2NTY5LGFuaWxpc3Q6MTI4ODkz

export default () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')
  // console.log('mediaUri', mediaUri)
  const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  const foundSources = [...new Set(media?.handles.edges.map(edge => edge.node.origin))]
  // console.log('foundSources', foundSources)
  const { error: error2, data: { Page: originPage } = {} } = useQuery(GET_ORIGINS, { variables: { ids: foundSources }, skip: !foundSources })
  // console.log('media', media)
  // console.log('originPage', originPage)
  useEffect(() => {
    if (!(media && media.uri !== mediaUri)) return
    setSearchParams({ details: media.uri }, { replace: true })
  }, [media, mediaUri])

  if (error) {
    console.log('preview modal error', error)
    console.error(error)
  }

  if (error2) {
    console.log('preview modal error', error2)
    console.error(error2)
  }

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

  const onlyMetadataOrigins = originPage?.origin?.every(origin => origin.metadataOnly)

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
                  <h2>{media?.title?.romanized}</h2>
                  <div className="origins">
                    {
                      mediaTargets?.map(({ target, media }) => (
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
                  {
                    [...media
                      ?.episodes
                      ?.edges ?? []]
                      ?.sort((a, b) => (a?.node?.number ?? 0) - (b?.node?.number ?? 0))
                      .map(({ node }) => {
                        const airingAt = new Date(node.airingAt)
                        const airingAtString =
                          new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
                            .format(Math.round((airingAt.getTime() - Date.now()) / 60 / 60 / 24 / 1000), 'days')// airingAt.toLocaleString('en-US', { timeZone: 'UTC' })
                        const timeUntilAiringString =
                          new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
                            .format(Math.round(node.timeUntilAiring / 60 / 60 / 24), 'days')
                        const relativeTime =
                          airingAt ? airingAtString
                          : node.timeUntilAiring && !isNaN(node.timeUntilAiring) && isFinite(node.timeUntilAiring) ? timeUntilAiringString
                          : undefined

                        if (
                          (node.timeUntilAiring ? node.timeUntilAiring > 0 : false)
                          || airingAt.getTime() - Date.now() > 0
                        ) return undefined

                        // todo merge normal uris with the episode uris to keep more sources
                        const episodeScannarrUri = toUriEpisodeId(node.uri, node.number)

                        const usedTitle =
                          node.title?.romanized
                          ?? node.title?.english
                          ?? node.title?.native

                        return (
                          <Link
                            key={episodeScannarrUri}
                            className="episode"
                            to={getRoutePath(Route.WATCH, { mediaUri: mediaUri, episodeUri: episodeScannarrUri })}
                          >
                            <div className="episode-number">{usedTitle !== undefined && usedTitle !== null ? node.number : undefined}</div>
                            {
                              node.thumbnail
                                ? <img src={node.thumbnail} alt="" className="thumbnail"/>
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
                            <div className="date">{relativeTime}</div>
                          </Link>
                        )
                      })
                  }
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
