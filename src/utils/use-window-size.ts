import { useEffect, useState } from 'react'

export const useWindowSize = () => {
  const [windowHeight, setWindowHeight] = useState(window.innerHeight)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)

    return () => { window.removeEventListener('resize', handleResize) }
  }, [])
  return [windowHeight, windowWidth]
}
