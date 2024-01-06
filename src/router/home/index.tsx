import { useLocation } from 'wouter'
import { useEffect } from 'react'

import { getRoutePath, Route } from '../path'

export default () => {
  const [, setLocation] = useLocation()

  useEffect(() => {
    setLocation(getRoutePath(Route.ANIME))
  }, [])

  return (
    <div>
      Redirecting...
    </div>
  )
}
