import { css } from '@emotion/react'
import { RouterProvider } from 'react-router'
import { createBrowserRouter } from 'react-router-dom'

import Home from './home'
import { getRouterRoutePath, Route } from './path'
import Header from '../components/header'
import Anime from './anime'
import Season from './anime/season'

const contentStyle = css`
  padding-top: 6rem;
`

const wrapElement = (children: React.ReactNode) =>
  <>
    <Header/>
    <div css={contentStyle}>
      {children}
    </div>
  </>

const router = createBrowserRouter([
  {

    path: getRouterRoutePath(Route.HOME),
    element: wrapElement(<Home/>)
  },
  {
    path: getRouterRoutePath(Route.ANIME),
    element: wrapElement(<Anime/>)
  },
  {
    path: getRouterRoutePath(Route.ANIME_SEASON),
    element: wrapElement(<Season/>)
  },
  {
    path: '/*',
    element: wrapElement(<div>404 No page found</div>)
  }
])

export default () => <RouterProvider router={router}/>
