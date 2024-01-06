import { css } from '@emotion/react'
import { Switch, Route as WRoute } from 'wouter'

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

const RouterRoot = () =>(
  <Switch>
    <WRoute path={getRouterRoutePath(Route.HOME)} component={() => wrapElement(<Home/>)}/>
    <WRoute path={getRouterRoutePath(Route.ANIME)} component={() => <Anime/>}/>
    <WRoute path={getRouterRoutePath(Route.ANIME_SEASON)} component={() => wrapElement(<Season/>)}/>
    <WRoute path={getRouterRoutePath(Route.WATCH)} component={() => <Watch/>}/>
    <WRoute path={getRouterRoutePath(Route.TEST)} component={() => wrapElement(<Test/>)}/>
    <WRoute component={() => wrapElement(<div>404 No page found</div>)}/>
  </Switch>
)
export default RouterRoot
