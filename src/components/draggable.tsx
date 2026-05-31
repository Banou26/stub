import type { ReactNode } from 'react'

import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/compat'
import { css } from '@emotion/react'

export const style = css`
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
  &.active * {
    pointer-events: none;
  }
`

const Draggable = (
  { children, isDragging, setIsDragging }:
  { children: ReactNode, isDragging: boolean, setIsDragging: (val: boolean) => void }
) => {
  if ('ontouchstart' in document.documentElement) return <>{children}</>
  const [ourRef, setOurRef] = useState<HTMLDivElement | null>(null)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const [isDraggingTimeout, setIsDraggingTimeout] = useState<number>()
  const mouseCoords = useRef({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })

  const root = useMemo(() => (globalThis as Window & typeof globalThis), [])
  const handleDragStart = useCallback((e: MouseEvent) => {
    if (!(e.target instanceof HTMLElement)) return
    if (
      e.offsetX > e.target.clientWidth ||
      e.offsetY > e.target.clientHeight
    ) {
      return
    }
    if (!ourRef || !(ourRef as Node).contains(e.target)) return
    e.preventDefault()
    const slider = ourRef.children.item(0) as HTMLElement | undefined
    if (slider) {
      const startX = e.pageX - slider.offsetLeft
      const startY = e.pageY - slider.offsetTop
      const scrollLeft = slider.scrollLeft
      const scrollTop = slider.scrollTop
      mouseCoords.current = { startX, startY, scrollLeft, scrollTop }
    }
    setIsMouseDown(true)
  }, [setIsMouseDown, setIsDragging, setIsDraggingTimeout, ourRef])
  const handleDragEnd = useCallback((_: MouseEvent) => {
    setIsMouseDown(false)
    setIsDragging(false)
    root.removeEventListener('mousemove', handleDrag)
    if (isDraggingTimeout) clearTimeout(isDraggingTimeout)
    setIsDraggingTimeout(
      (globalThis as Window & typeof globalThis).setTimeout(() => setIsDragging(false), 50)
    )
    if (!ourRef) return
  }, [setIsMouseDown, setIsDragging, setIsDraggingTimeout, isDraggingTimeout, ourRef])
  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isMouseDown || !ourRef) return
    e.preventDefault()
    const slider = ourRef.children.item(0) as HTMLElement | undefined
    if (slider) {
      const x = e.pageX - slider.offsetLeft
      const y = e.pageY - slider.offsetTop
      const walkX = (x - mouseCoords.current.startX)
      const walkY = (y - mouseCoords.current.startY)
      slider.scrollLeft = mouseCoords.current.scrollLeft - walkX
      slider.scrollTop = mouseCoords.current.scrollTop - walkY
    }
    setIsDragging(true)
  }, [isMouseDown, ourRef])

  useEffect(() => {
    if (!ourRef) return
    root.addEventListener('mousedown', handleDragStart)
    root.addEventListener('mouseup', handleDragEnd)
    root.addEventListener('mousemove', handleDrag)
    return () => {
      root.removeEventListener('mousedown', handleDragStart)
      root.removeEventListener('mouseup', handleDragEnd)
      root.removeEventListener('mousemove', handleDrag)
    }
  }, [ourRef, isMouseDown, setIsDragging, isDraggingTimeout, handleDragStart, handleDragEnd, handleDrag])

  return (
    <div ref={ref => setOurRef(ref)} className={`draggable ${isDragging ? 'active' : ''}`} css={style}>
      {children}
    </div>
  )
}

export default Draggable
