import { css } from '@emotion/react'
import { Switch, Route as WRoute } from 'wouter'
import { useEffect } from 'preact/hooks'

import { getRouterRoutePath, Route } from './path'
import Header from '../components/header'
import Footer from '../components/footer'
import Home from './home'
import Search from './search'
import Legal from './legal'
import Privacy from './privacy'
import Settings from './settings'
import Watch from './watch'

const LoginCallback = () => {
  useEffect(() => { globalThis.close() }, [])
  return <div>Logging in... this window will close automatically.</div>
}

const shellStyle = css`
  display: flex;
  flex-direction: column;
  min-height: 100vh;

  & > .content {
    flex: 1;
  }
`

const RouterRoot = () => (
  <div css={shellStyle}>
    <Header/>
    <div className="content">
      <Switch>
        <WRoute path={getRouterRoutePath(Route.HOME)} component={Home}/>
        <WRoute path={getRouterRoutePath(Route.MEDIA)} component={Home}/>
        <WRoute path={getRouterRoutePath(Route.SEARCH)} component={Search}/>
        <WRoute path={getRouterRoutePath(Route.LEGAL)} component={Legal}/>
        <WRoute path={getRouterRoutePath(Route.PRIVACY)} component={Privacy}/>
        <WRoute path={getRouterRoutePath(Route.SETTINGS)} component={Settings}/>
        <WRoute path={getRouterRoutePath(Route.WATCH)} component={Watch}/>
        <WRoute path={getRouterRoutePath(Route.LOGIN_CALLBACK)} component={LoginCallback}/>
        <WRoute component={() => <div>404 No page found</div>}/>
      </Switch>
    </div>
    <Footer/>
  </div>
)
export default RouterRoot
