/** @jsx jsx */
import { jsx } from '@emotion/react'
import { useRoutes  } from 'raviger'

import Home from './home'
import Animes from './anime'
import Anime from './anime/anime'

export const routes = {
  '/': () => <Home/>,
  '/animes': () => <Animes/>,
  '/anime/:name': ({ name }) => <Anime name={name}/>
}

export default () => useRoutes(routes, { basePath: '/index.html' })
