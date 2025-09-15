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
    const resizeObserver = new ResizeObserver(() => {
      const computedStyle = window.getComputedStyle(ref)
      let lineHeightPx: number

      if (computedStyle.lineHeight === 'normal') {
        const fontSize = parseFloat(computedStyle.fontSize)
        lineHeightPx = fontSize * 1.2
      } else {
        lineHeightPx = parseFloat(computedStyle.lineHeight)
      }

      setLineHeight(lineHeightPx)
      const height = ref.clientHeight
      if (lineHeightPx && height) {
        setLineClamp(Math.floor(height / lineHeightPx))
      }
    })

    resizeObserver.observe(ref)
    return () => resizeObserver.disconnect()
  }, [ref])

  return (
    <div
      {...rest}
      ref={setRef}
      css={style}
      style={{
        ...rest.style,
        WebkitLineClamp: lineClamp,
        height: lineHeight && lineClamp ? lineClamp * lineHeight : undefined
      }}
    >
      {children}
    </div>
  )
}

export default TextEllipsis
