import type { Media } from '../../generated/schema/types.generated'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'

import { gql } from '../../generated'
import { MediaSort, MediaStatus } from '../../generated/graphql'
import HomeTheater from './theater'
import MediaSection from './media-section'

const GET_RELEASING_MEDIA_PAGE = gql(`
  subscription GetReleasingMediaPage($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        _id
        uri
        score
        titles {
          language
          title
          score
        }
        descriptions {
          language
          description
        }
        shortDescriptions {
          language
          shortDescription
        }
        covers {
          language
          url
        }
        banners {
          language
          url
        }
        trailers {
          uri
          origin
          id
          url
          thumbnail
        }
        popularity
      }
    }
  }
`)

const style = css`

`

const Index = () => {
  const [{ data }] = useSubscription({
    query: GET_RELEASING_MEDIA_PAGE,
    variables: {
      input: {
        status: MediaStatus.Releasing,
        sorts: [MediaSort.Popularity]
      }
    }
  })

  const mediaNodes = data?.mediaPage?.nodes || []

  return (
    <div css={style}>
      <HomeTheater mediaNodes={mediaNodes} />
      <MediaSection title="Current season" mediaNodes={mediaNodes as Media[]} />
    </div>
  )
}

export default Index
