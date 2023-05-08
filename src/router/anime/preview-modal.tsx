import { css } from '@emotion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@apollo/client'
import { targets } from 'laserr'

// import './preview-modal.css'
import { gql } from '../../generated'
import { overlayStyle } from '../../components/modal'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MinimalPlayer } from '../../components/minimal-player'
import { Route, getRoutePath } from '../path'

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

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 120rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  /* overflow: hidden; */
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

    .description {
      margin-top: 2.5rem;
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
          /* justify-content: start; */

          .title {
            margin-right: auto;
            font-size: 2rem;
          }

          .description {
            display: flex;
            font-size: 2rem;
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

export const GET_MEDIA = gql(`
  query GET_MEDIA($uri: String!, $origin: String, $id: String) {
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
            }
            trailers {
              handler
              origin
              id
              uri
              url
              thumbnail
            }
            popularity
            shortDescription
            description
            handles {
              nodes {
                handler
                origin
                id
                uri
                url
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
      airingSchedule {
        edges {
          node {
            airingAt
            episode
            uri
            media {
              handler
              origin
              id
              uri
              url
            }
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


export default () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')
  console.log('mediaUri', mediaUri)
  const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  console.log('media', media)

  if (error) {
    console.log('preview modal error', error)
    console.error(error)
  }

  const mediaTargets =
    media &&
    targets
      .filter(target => media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node)
      .map(target => ({
        target,
        media: media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node
      }))

  console.log('mediaTargets', mediaTargets)

  const onOverlayClick = (ev) => {
    console.log('ev', ev)
    if (ev.target !== ev.currentTarget) return
    const { details, ...rest } = Object.fromEntries(searchParams.entries())
    setSearchParams(rest)
  }

  if (!media) return null

  console.log('AAAAAAAAAAAAAAA', media.trailers?.at(0)?.id)

  return (
    <Dialog.Root open={Boolean(mediaUri)}>
      <Dialog.Portal className="foo">
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
                <div className="episodes">
                  {
                    media?.airingSchedule?.edges.map(({ node }) => {
                      const airingAt = new Date(node.airingAt * 1000)
                      const airingAtString = airingAt.toLocaleString('en-US', { timeZone: 'UTC' })
                      const relativeTime =
                        !isNaN(node.timeUntilAiring) && isFinite(node.timeUntilAiring)
                          ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(node.timeUntilAiring / 60 / 60 / 24), 'days')
                          : undefined

                      console.log('relativeTime', relativeTime)

                      if (node.timeUntilAiring > 0) return undefined

                      return (
                        <Link
                          key={node.uri}
                          className="episode"
                          to={getRoutePath(Route.WATCH, { uri: `${mediaUri}-${node.episode}` })}
                        >
                          <div className="episode-number">{node.episode}</div>
                          {
                            node.thumbnail
                              ? <img src={node.thumbnail} alt="" className="thumbnail"/>
                              : undefined
                          }
                          <div className="information">
                            <div className="title">{node.title?.romanized}</div>
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
