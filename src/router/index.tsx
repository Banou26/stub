import { Switch, Route as WRoute } from 'wouter'
import { useEffect } from 'preact/hooks'

import { getRouterRoutePath, Route } from './path'
import Home from './home'
import Watch from './watch'

const LoginCallback = () => {
  useEffect(() => { globalThis.close() }, [])
  return <div>Logging in... this window will close automatically.</div>
}

const RouterRoot = () =>(
  <Switch>
    <WRoute path={getRouterRoutePath(Route.HOME)} component={Home}/>
    <WRoute path={getRouterRoutePath(Route.MEDIA)} component={Home}/>
    <WRoute path={getRouterRoutePath(Route.WATCH)} component={Watch}/>
    <WRoute path={getRouterRoutePath(Route.LOGIN_CALLBACK)} component={LoginCallback}/>
    <WRoute component={() => <div>404 No page found</div>}/>
  </Switch>
)
export default RouterRoot
