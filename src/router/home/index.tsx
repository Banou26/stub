import type { CellComponentProps } from 'react-window'
import type { Get_Releasing_Media_PageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { Grid } from 'react-window'
import { useCallback, useState } from 'preact/compat'

import { gql } from '../../generated'
import { getRoutePath, Route } from '../path'
import { MediaSort, MediaStatus } from '../../generated/graphql'
import MediaTitle from '../../components/media-title'
import Draggable from '../../components/draggable'

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
.section {
  display: flex;
  flex-direction: column;
  & > .title {
    margin-left: 10rem;
    font-size: 4rem;
    font-weight: bold;
    color: rgb(255, 255, 255);
    text-shadow: rgba(0, 0, 0, 0.8) -1px -1px 0px, rgba(0, 0, 0, 0.8) -1px 1px 0px, rgba(0, 0, 0, 0.8) 1px -1px 0px, rgba(0, 0, 0, 0.8) 1px 1px 0px;
    padding-bottom: 0.5rem;
    user-select: none;
  }
  & > div > .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    grid-gap: 1rem;
    padding-bottom: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: rgb(134, 132, 141) rgb(15, 15, 15);
  }
}
`

const Index = () => {
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

  const [visibleStartIndex, setVisibleStartIndex] = useState(0)
  const CellComponent = useCallback(({ mediaNodes, columnIndex, style }: CellComponentProps<{ mediaNodes: Get_Releasing_Media_PageSubscription['mediaPage']['nodes'] }>) => {
    const media = mediaNodes[columnIndex]
    if (!media) return null

    const left = Number(style.left || 0) + (columnIndex - visibleStartIndex) * 10 + 100 /* left margin */

    return <MediaTitle media={media} to={getRoutePath(Route.TITLE, { uri: media.uri })} style={{ ...style, left }}/>
  }, [])

  const [isDragging, setIsDragging] = useState(false)

  return (
    <div css={style}>
      <div className='section'>
        <span className='title'>Current Season</span>
        <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
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
        </Draggable>

      </div>
    </div>
  )
}

export default Index
