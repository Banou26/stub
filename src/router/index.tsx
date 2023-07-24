import { css } from '@emotion/react'
import { RouterProvider } from 'react-router'
import { createBrowserRouter } from 'react-router-dom'

import Home from './home'
import { getRouterRoutePath, Route } from './path'
import Header from '../components/header'
import Anime from './anime'
import Season from './anime/season'
import Test from './test'
import Watch from './watch'

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
    path: getRouterRoutePath(Route.WATCH),
    element: <Watch/>
  },
  {
    path: getRouterRoutePath(Route.TEST),
    element: wrapElement(<Test/>)
  },
  {
    path: '/*',
    element: wrapElement(<div>404 No page found</div>)
  }
])

export default () => <RouterProvider router={router}/>
