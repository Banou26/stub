import { css } from '@emotion/react'
import { useSubscription } from 'urql'

import { gql } from '../../generated'
import { MediaSort, MediaStatus } from '../../generated/graphql'
import HomeTheater from './theater'
import MediaSection from './media-section'
import { useRoute } from 'wouter'
import { getRouterRoutePath, Route } from '../path'
import MediaModal from './media-modal'

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
  const [matchMediaRoute] = useRoute(getRouterRoutePath(Route.MEDIA))
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
      <MediaSection title="Current season" mediaNodes={mediaNodes} />
      {matchMediaRoute && <MediaModal mediaNodes={mediaNodes} />}
    </div>
  )
}

export default Index
