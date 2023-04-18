import { css } from '@emotion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@apollo/client'

import './preview-modal.css'
import { gql } from '../../generated'
import { overlayStyle } from '../../components/modal'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const style = css`
  display: flex;
  width: 60rem;

  background-color: rgb(35, 35, 35);
  border-radius: 6px;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-height: 85vh;
  padding: 25px;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
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
  const { error, data: { Media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  console.log('Media', Media)

  const onOverlayClick = () => {
    const { details, ...rest } = Object.fromEntries(searchParams.entries())
    setSearchParams(rest)
  }

  return (
    <Dialog.Root open={!!mediaUri}>
      <Dialog.Portal className="foo">
        <Dialog.Overlay css={overlayStyle} onClick={onOverlayClick}/>
        <Dialog.Content asChild={true}>
          <div css={style}>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
