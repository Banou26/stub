import { css } from '@emotion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@apollo/client'
import { targets } from 'laserr'

import './preview-modal.css'
import { gql } from '../../generated'
import { overlayStyle } from '../../components/modal'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MinimalPlayer } from '../../components/minimal-player'
import { Route, getRoutePath } from '../path'

const style = css`
display: flex;
flex-direction: column;
width: 120rem;

background-color: rgb(35, 35, 35);
border-radius: 1rem;
box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
overflow: hidden;
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
max-height: 85vh;
animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);

.origin-icon {
  margin: 0 1rem;
}

.title-hovercard {
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
    height: 67.5rem !important;
    width: 100% !important;
    pointer-events: none;
    &:after {
      content: '';
      position: absolute;
      inset: 0;
      bottom: -1rem;
      background: linear-gradient(0deg, #181818, transparent 20%);
    }
  }
}
`

export const GET_MEDIA = gql(`
  query GET_MEDIA($uri: String!) {
    Media(uri: $uri) {
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
        nodes {
          handler
          origin
          id
          uri
          url
          title {
            romanized
          }
          popularity
          shortDescription
          description
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
    }
  }
`)

export default () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const mediaUri = searchParams.get('details')
  console.log('mediaUri', mediaUri)
  const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  console.log('media', media)

  const mediaTargets =
    media &&
    targets
      .filter(target => media.handles.nodes.find((handle) => handle.origin === target.origin))
      .map(target => ({
        target,
        media: media.handles.nodes.find((handle) => handle.origin === target.origin)
      }))

  const onOverlayClick = () => {
    const { details, ...rest } = Object.fromEntries(searchParams.entries())
    setSearchParams(rest)
  }

  if (!media) return null

  console.log('AAAAAAAAAAAAAAA', media.trailers?.at(0)?.id)

  return (
    <Dialog.Root open={Boolean(mediaUri)}>
      <Dialog.Portal className="foo">
        <Dialog.Overlay css={overlayStyle} onClick={onOverlayClick}/>
        <Dialog.Content asChild={true}>
          <div css={style}>
            <MinimalPlayer media={media} className="title-hovercard"/>
            <h2>{media?.title?.romanized}</h2>
            {
              mediaTargets?.map(({ target, media }) => (
                <a key={target.origin} href={media.url} className="origin-icon" target="_blank" rel="noopener noreferrer">
                  <img src={target.icon} alt=""/>
                </a>
              ))
            }
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
