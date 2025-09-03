import type { CellComponentProps } from 'react-window'
import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { Grid, useGridRef } from 'react-window'
import { useCallback, useState, useRef, useEffect } from 'preact/compat'

import { gql } from '../../generated'
import { getRoutePath, Route } from '../path'
import { MediaSort, MediaStatus } from '../../generated/graphql'
import MediaTitle from '../../components/media-title'
import Draggable from '../../components/draggable'
import HomeTheater from './theater'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
.section {
  display: flex;
  flex-direction: column;
  position: relative;
  & > .title {
    position: relative;
    margin-left: 10rem;
    font-size: 4rem;
    font-weight: bold;
    color: rgb(255, 255, 255);
    text-shadow: rgba(0, 0, 0, 0.8) -1px -1px 0px, rgba(0, 0, 0, 0.8) -1px 1px 0px, rgba(0, 0, 0, 0.8) 1px -1px 0px, rgba(0, 0, 0, 0.8) 1px 1px 0px;
    padding-bottom: 0.5rem;
    user-select: none;
  }
  & > .list-container {
    position: relative;
    & > .scroll-button {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 60px;
      height: 60px;
      background: rgba(0, 0, 0, 0.7);
      border: none;
      border-radius: 2.5rem;
      color: white;
      font-size: 24px;
      cursor: pointer;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
      &:hover {
        background: rgba(0, 0, 0, 0.9);
      }
      &.left {
        left: 20px;
      }
      &.right {
        right: 20px;
      }
    }

    & > div > .virtual-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      grid-gap: 1rem;
      padding-bottom: 0.5rem;
      scrollbar-width: thin;
      scrollbar-color: rgb(134, 132, 141) rgb(15, 15, 15);
    }
  }
}
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

  const [visibleStartIndex, setVisibleStartIndex] = useState(0)
  const [visibleEndIndex, setVisibleEndIndex] = useState(0)
  const CellComponent = useCallback(({ mediaNodes, columnIndex, style }: CellComponentProps<{ mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }>) => {
    const media = mediaNodes[columnIndex]
    if (!media) return null

    return (
      <MediaTitle
        key={media._id}
        media={media}
        to={getRoutePath(Route.TITLE, { uri: media.uri })}
        style={{
          ...style,
          width: 250,
          marginLeft: 100
        }}
      />
    )
  }, [])

  const [isDragging, setIsDragging] = useState(false)
  const virtualListRef = useGridRef(null)

  const scrollTo = useCallback((direction: 'left' | 'right') => {
    const grid = virtualListRef.current
    if (!grid) return

    grid.scrollToColumn({
      index:
        direction === 'left'
          ? (
            visibleStartIndex <= 0
              ? 0
              : visibleStartIndex
          )
          : (
            visibleEndIndex + 1 >= mediaNodes.length
              ? mediaNodes.length - 1
              : visibleEndIndex
          ),
      behavior: 'smooth'
    })
  }, [visibleStartIndex, visibleEndIndex, mediaNodes.length, virtualListRef])

  return (
    <div css={style}>
      <HomeTheater mediaNodes={mediaNodes} />
      <div className='section'>
        <span className='title'>Current season</span>
        <div className='list-container'>
          <button className='scroll-button left' onClick={() => scrollTo('left')}>
            <ChevronLeft />
          </button>
          <button className='scroll-button right' onClick={() => scrollTo('right')}>
            <ChevronRight />
          </button>
          <Draggable isDragging={isDragging} setIsDragging={setIsDragging}>
            <Grid
              gridRef={virtualListRef}
              className='virtual-list'
              cellComponent={CellComponent}
              cellProps={{ mediaNodes }}
              columnCount={mediaNodes.length}
              columnWidth={260}
              rowCount={1}
              rowHeight={350}
              overscanCount={5}
              onCellsRendered={({ columnStartIndex, columnStopIndex }) => {
                setVisibleStartIndex(columnStartIndex)
                setVisibleEndIndex(columnStopIndex)
              }}
            />
          </Draggable>
        </div>
      </div>
    </div>
  )
}

export default Index
