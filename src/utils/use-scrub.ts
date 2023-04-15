import type { MouseEventHandler, RefObject } from 'react'

import { useState, useEffect } from 'react'

export default ({ ref, defaultValue }: { ref: RefObject<HTMLElement>, defaultValue?: number }) => {
  const [value, setValue] = useState(defaultValue)
  const [scrubbing, setScrubbing] = useState(false)

  const scrub: MouseEventHandler<HTMLDivElement> = (ev) => {
    setScrubbing(true)
    if (!ref.current) return
    const { clientX: x } = ev
    const { left, right } = ref.current.getBoundingClientRect()
    setValue(Math.min(Math.max(((x - left) / (right - left)), 0), 1))
  }

  useEffect(() => {
    if (!scrubbing) return
    const mouseUp = () => setScrubbing(false)
    const mouseMove = (ev: globalThis.MouseEvent) => {
      if (!ref.current) return
      const { clientX: x } = ev
      const { left, right } = ref.current.getBoundingClientRect()
      setValue(Math.min(Math.max(((x - left) / (right - left)), 0), 1))
    }
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
    return () => {
      document.removeEventListener('mousemove', mouseMove)
      document.removeEventListener('mouseup', mouseUp)
    }
  }, [scrubbing])

  return {
    value,
    scrubbing,
    scrub
  }
}
