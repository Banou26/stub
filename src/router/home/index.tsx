import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useState } from 'preact/hooks'

import { gql } from '../../generated'
import { MediaCategory, MediaSort, MediaStatus } from '../../generated/graphql'
import HomeTheater from './theater'
import MediaSection from './media-section'
import { useRoute } from 'wouter'
import { getRouterRoutePath, Route } from '../path'
import MediaModal from './media-modal'
import CategoryTabs from '../../components/category-tabs'

const GET_RELEASING_MEDIA_PAGE = gql(`
  subscription GetReleasingMediaPage($input: MediaPageInput!, $shortDescriptionInput: MediaShortDescriptionInput!) {
    mediaPage(input: $input) {
      nodes {
        ...MediaFragment
        score
        episodeCount
        titles {
          language
          title
          score
        }
        shortDescriptions(input: $shortDescriptionInput) {
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
  .category-bar {
    position: relative;
    z-index: 1;
    padding: 1.5rem 3rem 0.5rem;
  }
`

const Index = () => {
  const [matchMediaRoute] = useRoute(getRouterRoutePath(Route.MEDIA))
  const [category, setCategory] = useState<MediaCategory | null>(null)
  const [{ data }] = useSubscription({
    query: GET_RELEASING_MEDIA_PAGE,
    variables: {
      input: {
        status: MediaStatus.Releasing,
        sorts: [MediaSort.Popularity],
        ...(category ? { categories: [category] } : {})
      },
      shortDescriptionInput: {
        count: 1
      }
    }
  })

  const mediaNodes = data?.mediaPage?.nodes || []

  return (
    <div css={style}>
      <HomeTheater mediaNodes={mediaNodes} />
      <div className="category-bar">
        <CategoryTabs value={category} onChange={setCategory} />
      </div>
      <MediaSection title="Current season" mediaNodes={mediaNodes} />
      {matchMediaRoute && <MediaModal mediaNodes={mediaNodes} />}
    </div>
  )
}

export default Index
