import type { MouseEventHandler } from 'react'

import { useState, useEffect, useCallback } from 'preact/compat'

export default ({ element, defaultValue }: { element: HTMLElement | null, defaultValue?: number }) => {
  const [value, setValue] = useState(defaultValue)
  const [scrubbing, setScrubbing] = useState(false)

  const scrubHandler: MouseEventHandler<HTMLDivElement> = useCallback((ev) => {
    setScrubbing(true)
    if (!element) return
    const { clientX: x } = ev
    const { left, right } = element.getBoundingClientRect()
    setValue(Math.min(Math.max(((x - left) / (right - left)), 0), 1))
  }, [element])

  useEffect(() => {
    if (!scrubbing) return
    const mouseUp = () => setScrubbing(false)
    const mouseMove = (ev: MouseEvent) => {
      if (!element) return
      const { clientX: x } = ev
      const { left, right } = element.getBoundingClientRect()
      setValue(Math.min(Math.max(((x - left) / (right - left)), 0), 1))
    }
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
    return () => {
      document.removeEventListener('mousemove', mouseMove)
      document.removeEventListener('mouseup', mouseUp)
    }
  }, [element, scrubbing])

  return {
    value,
    scrubbing,
    scrubHandler
  }
}
