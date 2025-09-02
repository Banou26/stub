import type { CellComponentProps } from 'react-window'
import type { Get_Releasing_Media_PageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { Grid } from 'react-window'
import { useState } from 'preact/compat'

import { gql } from '../../generated/gql'
import { MediaSort, MediaStatus } from '../../generated/graphql'
import MediaTitle from '../../components/media-title'
import { getRoutePath, Route } from '../path'

const getReleasingMediaPage = gql(`
  subscription GET_RELEASING_MEDIA_PAGE($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        uri
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
        popularity
      }
    }
  }
`)

const style = css`
  .list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      grid-gap: 1rem;
  }
`

export default () => {
  const [{ data }] = useSubscription({
    query: getReleasingMediaPage,
    variables: {
      input: {
        status: MediaStatus.Releasing,
        sorts: [MediaSort.Popularity]
      }
    }
  })

  const mediaNodes = data?.mediaPage?.nodes || []

  console.log('mediaNodes', mediaNodes)
  const matchedNodes = mediaNodes.filter(media => media.uri?.includes('anilist:185660') || media.uri?.includes('mal:60543'))
  console.log('matchedNodes', matchedNodes)

  const [visibleStartIndex, setVisibleStartIndex] = useState(0)
  const CellComponent = ({ mediaNodes, columnIndex, style }: CellComponentProps<{ mediaNodes: Get_Releasing_Media_PageSubscription['mediaPage']['nodes'] }>) => {
    const media = mediaNodes[columnIndex]
    if (!media) return null

    const left = Number(style.left || 0) + (columnIndex - visibleStartIndex) * 10

    return <MediaTitle media={media} to={getRoutePath(Route.TITLE, { uri: media.uri })} style={{ ...style, left }}/>
  }

  return (
    <div css={style}>
      Home
      <div>
        <span>Current Season</span>
        <Grid
          className='list'
          cellComponent={CellComponent}
          cellProps={{ mediaNodes }}
          columnCount={mediaNodes.length}
          columnWidth={250}
          rowCount={1}
          rowHeight={350}
          overscanCount={5}
          onCellsRendered={({ columnStartIndex }) => setVisibleStartIndex(columnStartIndex)}
        />
      </div>
    </div>
  )
}
