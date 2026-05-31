
export enum Route {
  HOME = 'HOME',
  MEDIA = 'MEDIA',
  MEDIA_EPISODE = 'MEDIA_EPISODE',
  SEARCH = 'SEARCH',
  WATCH = 'WATCH',
  LOGIN_CALLBACK = 'LOGIN_CALLBACK',
}

const ROUTES = {
  [Route.HOME]: () => '/',
  [Route.MEDIA]: ({ uri }: { uri: string }) => `/media/${uri}`,
  [Route.MEDIA_EPISODE]: ({ uri, mediaUri }: { uri: string, mediaUri: string }) => `/media/${uri}/${mediaUri}`,
  [Route.SEARCH]: ({ query }: { query: string }) => `/search/${encodeURIComponent(query)}`,
  [Route.WATCH]: ({ mediaUri, episodeUri, sourceUri }: { mediaUri: string, episodeUri: string, sourceUri?: string }) =>
    `/watch/${mediaUri}/${episodeUri}${sourceUri ? `/${sourceUri}`: ''}`,
  [Route.LOGIN_CALLBACK]: () => '/login/callback',
}

export type RouteParams = {
  [K in Route]: Parameters<typeof ROUTES[K]>[0]
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.MEDIA]: '/media/:uri',
  [Route.MEDIA_EPISODE]: '/media/:uri/:mediaUri',
  [Route.SEARCH]: '/search/:query',
  [Route.WATCH]: '/watch/:mediaUri/:episodeUri/:sourceUri?',
  [Route.LOGIN_CALLBACK]: '/login/callback',
}

export const getRouterRoutePath =
  (route: Route) =>
    RouterRoutes[route]

export const getRoutePath = <
  T extends Route
> (
  route: T,
  args?: Parameters<(typeof ROUTES)[T]>[0]
) =>
  ROUTES[route](<any>args)
