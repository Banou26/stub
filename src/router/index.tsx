/** @jsx jsx */
import { jsx } from '@emotion/react'
import { useRoutes  } from 'raviger'

import Home from '../components/home'
import Anime from '../components/anime'

export const routes = {
  '/': () => <Home/>,
  '/animes': () => <Anime/>
}

export default () => useRoutes(routes, { basePath: '/sandbox/index.html' })
