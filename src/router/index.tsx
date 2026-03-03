import { Switch, Route as WRoute } from 'wouter'

import { getRouterRoutePath, Route } from './path'
import Home from './home'
import Watch from './watch'

const RouterRoot = () =>(
  <Switch>
    <WRoute path={getRouterRoutePath(Route.HOME)} component={Home}/>
    <WRoute path={getRouterRoutePath(Route.MEDIA)} component={Home}/>
    <WRoute path={getRouterRoutePath(Route.WATCH)} component={Watch}/>
    <WRoute component={() => <div>404 No page found</div>}/>
  </Switch>
)
export default RouterRoot
