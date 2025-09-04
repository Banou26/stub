import type { CellComponentProps } from 'react-window'
import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'
import type { Media } from '../../generated/schema/types.generated'

import { css } from '@emotion/react'
import { Grid, useGridRef } from 'react-window'
import { useCallback, useEffect, useMemo, useState } from 'preact/compat'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { autoUpdate, shift, useFloating } from '@floating-ui/react-dom'

import { getRoutePath, Route } from '../path'
import MediaTitle from '../../components/media-title'
import Draggable from '../../components/draggable'
import { MediaPreview } from '../../components/media-preview'

const style = css`
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
`

export const MediaSection = ({ title, mediaNodes }: { title: string, mediaNodes: Media[] }) => {
  const [visibleStartIndex, setVisibleStartIndex] = useState(0)
  const [visibleEndIndex, setVisibleEndIndex] = useState(0)

  const { x, y, strategy, refs } = useFloating({ whileElementsMounted: autoUpdate, placement: 'top', middleware: [shift()] })
  const [hoverMediaPreview, setHoverMediaPreview] = useState<Media | undefined>(undefined)
  const [hoverCardTriggerTimeout, setHoverMediaPreviewTriggerTimeout] = useState<number | undefined>(undefined)

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
        onMouseEnter={e => {
          if (!(e.target instanceof HTMLElement)) return
          setHoverMediaPreview(undefined)
          refs.setReference(e.target)
          setHoverMediaPreviewTriggerTimeout(
            window.setTimeout(() => {
              if (refs.reference.current !== e.target) return
              setHoverMediaPreview(media as Media)
            }, 400)
          )
        }}
        onMouseLeave={(e) => {
          if (!(e.relatedTarget instanceof HTMLElement) || !refs.floating.current) return
          if (refs.floating.current === e.relatedTarget  || refs.floating.current.contains(e.relatedTarget)) return
          if (hoverCardTriggerTimeout) clearTimeout(hoverCardTriggerTimeout)
          refs.setReference(null)
          setHoverMediaPreview(undefined)
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

  const onHoverMediaPreviewMouseLeave = () => {
    if (hoverCardTriggerTimeout) clearTimeout(hoverCardTriggerTimeout)
    refs.setReference(null)
    setHoverMediaPreview(undefined)
  }

  return (
    <div css={style}>
      <span className='title'>{title}</span>
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
      {
        !isDragging && hoverMediaPreview && (
          <MediaPreview
            media={hoverMediaPreview}
            ref={refs.setFloating}
            onMouseLeave={onHoverMediaPreviewMouseLeave}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0
            }}
          />
        )
      }
    </div>
  )
}

export default MediaSection
