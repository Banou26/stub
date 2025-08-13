import type { ReactNode } from 'react'
import { css } from '@emotion/react'
import { Switch, Route as WRoute } from 'wouter'

import { getRouterRoutePath, Route } from './path'
import Header from '../components/header'
import Home from './home'

const contentStyle = css`
  padding-top: 4rem;

  @media (min-width: 2560px) {
    padding-top: 6rem;
  }
  @media (min-width: 3840px) {
    padding-top: 8rem;
  }
`

const wrapElement = (children: ReactNode) =>
  <>
    <Header/>
    <div css={contentStyle}>
      {children}
    </div>
  </>

const RouterRoot = () =>(
  <Switch>
    <WRoute path={getRouterRoutePath(Route.HOME)} component={() => wrapElement(<Home/>)}/>
    <WRoute path={getRouterRoutePath(Route.WATCH)} component={() => <div/>}/>

    <WRoute component={() => wrapElement(<div>404 No page found</div>)}/>
  </Switch>
)
export default RouterRoot
