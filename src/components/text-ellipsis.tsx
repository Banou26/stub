import type { HTMLAttributes } from 'react'

import { css } from '@emotion/react'
import { useEffect, useState } from 'preact/hooks'

const style = css`
display: -webkit-box;
-webkit-box-orient: vertical;
overflow: hidden;
text-overflow: ellipsis;
width: 100%;
height: 100%;
`

export const TextEllipsis = (
  { children, ...rest }:
  HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }
) => {
  const [ref, setRef] = useState<HTMLDivElement | null>(null)
  const [lineHeight, setLineHeight] = useState(0)
  const [lineClamp, setLineClamp] = useState(0)

  useEffect(() => {
    if (!ref) return

    let frame = 0
    const update = () => {
      const computedStyle = window.getComputedStyle(ref)
      let lineHeightPx: number

      if (computedStyle.lineHeight === 'normal') {
        const fontSize = parseFloat(computedStyle.fontSize)
        lineHeightPx = fontSize * 1.2
      } else {
        lineHeightPx = parseFloat(computedStyle.lineHeight)
      }

      const height = ref.clientHeight
      // the min-1 floor and the prev === next guards: sub-pixel rounding of the written height kept the line count flip-flopping so it never settled
      setLineHeight(prev => (prev === lineHeightPx ? prev : lineHeightPx))
      if (lineHeightPx && height) {
        const nextClamp = Math.max(1, Math.floor(height / lineHeightPx))
        setLineClamp(prev => (prev === nextClamp ? prev : nextClamp))
      }
    }

    // Measure on the next frame: writing line-clamp/height back onto the observed element re-enters the observer, which throws "ResizeObserver loop completed with undelivered notifications"
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    })

    resizeObserver.observe(ref)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
    }
  }, [ref])

  return (
    <div
      {...rest}
      ref={setRef}
      css={style}
      style={{
        ...(typeof rest.style === 'object' ? rest.style : undefined),
        WebkitLineClamp: lineClamp,
        height: lineHeight && lineClamp ? lineClamp * lineHeight : undefined
      }}
    >
      {children}
    </div>
  )
}

export default TextEllipsis
