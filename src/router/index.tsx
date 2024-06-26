import { css } from '@emotion/react'
import { Switch, Route as WRoute } from 'wouter'

import Home from './home'
import { getRouterRoutePath, Route } from './path'
import Header from '../components/header'
import Anime from './anime'
import Season from './anime/season'
import Test from './test'
import Watch from './watch'
import Auth from './auth'
import AuthOauth2 from './auth/oauth2'
import AnimeDetails from './anime/details'

const contentStyle = css`
  padding-top: 4rem;

  @media (min-width: 2560px) {
    padding-top: 6rem;
  }
  @media (min-width: 3840px) {
    padding-top: 8rem;
  }
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
    <WRoute path={getRouterRoutePath(Route.AUTH)} component={() => wrapElement(<Auth/>)}/>
    <WRoute path={getRouterRoutePath(Route.AUTH_OAUTH2_CALLBACK)} component={() => wrapElement(<AuthOauth2/>)}/>
    <WRoute path={getRouterRoutePath(Route.ANIME_DETAILS)} component={() => wrapElement(<AnimeDetails/>)}/>

    <WRoute component={() => wrapElement(<div>404 No page found</div>)}/>
  </Switch>
)
export default RouterRoot
