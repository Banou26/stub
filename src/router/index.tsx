/** @jsx jsx */
import { jsx } from '@emotion/react'
import { useRoutes  } from 'raviger'

import Home from '../components/home'
import Animes from '../components/animes'
import Anime from '../components/anime'

export const routes = {
  '/': () => <Home/>,
  '/animes': () => <Animes/>,
  '/anime/:name': ({ name }) => <Anime name={name}/>
}

export default () => useRoutes(routes, { basePath: '/sandbox/index.html' })
