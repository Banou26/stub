import type { CellComponentProps } from 'react-window'
import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'
import type { Media } from '../../generated/schema/types.generated'
import type { MouseEvent, RefObject } from 'react'

import { css } from '@emotion/react'
import { Grid, useGridRef } from 'react-window'
import { useCallback, useEffect, useState } from 'preact/compat'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { autoUpdate, offset, useFloating, shift, useHover, useInteractions, safePolygon } from '@floating-ui/react'

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

const CellComponent = (
  { getReferenceProps, mediaNodes, columnIndex, style, setHoverMediaPreview, setReference }:
  CellComponentProps<{
    getReferenceProps: (userProps?: React.HTMLProps<Element>) => Record<string, unknown>
    mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'],
    setHoverMediaPreview: (media: Media | undefined) => void
    setReference: (element: HTMLElement | null) => void
    floating: RefObject<HTMLElement | null>
    update: () => void
  }>
) => {
  const media = mediaNodes[columnIndex]
  if (!media) return null

  return (
    <MediaTitle
      key={media._id}
      media={media}
      to={getRoutePath(Route.MEDIA, { uri: media.uri })}
      style={{
        ...style,
        width: 250,
        marginLeft: 100
      }}
      onMouseEnter={(e) => {
        if (!(e.target instanceof HTMLElement)) return
        setReference(e.target)
        setHoverMediaPreview(media as Media)
      }}
      {...getReferenceProps()}
    />
  )
}

// todo: there is currently a bug where if the media that is previewed gets updated, the preview's position gets fucked because the node changed or smth
export const MediaSection = ({ title, mediaNodes }: { title: string, mediaNodes: Media[] }) => {
  const [visibleStartIndex, setVisibleStartIndex] = useState(0)
  const [visibleEndIndex, setVisibleEndIndex] = useState(0)

  const [mediaPreviewIsOpen, setMediaPreviewIsOpen] = useState(false)

  const { x, y, strategy, refs, update, context } = useFloating({
    open: mediaPreviewIsOpen,
    onOpenChange: setMediaPreviewIsOpen,
    whileElementsMounted: autoUpdate,
    placement: 'top',
    middleware: [
      offset(({ rects }) => (-rects.reference.height / 2 - rects.floating.height / 2)),
      shift({ crossAxis: true })
    ]
  })

  const hover = useHover(context, { restMs: 400, handleClose: safePolygon() })
  const {getReferenceProps, getFloatingProps} = useInteractions([hover])

  const [hoverMediaPreview, setHoverMediaPreview] = useState<Media | undefined>(undefined)

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
            cellProps={{
              getReferenceProps,
              mediaNodes,
              setHoverMediaPreview,
              setReference: refs.setReference,
              floating: refs.floating,
              update
            }}
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
        !isDragging && hoverMediaPreview && mediaPreviewIsOpen && (
          <MediaPreview
            media={hoverMediaPreview}
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0
            }}
            {...getFloatingProps()}
          />
        )
      }
    </div>
  )
}

export default MediaSection
