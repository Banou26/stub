
export enum Route {
  HOME = 'HOME',
  TITLE = 'TITLE',
  TITLE_EPISODE = 'TITLE_EPISODE',
  WATCH = 'WATCH',
}

const Routes = {
  [Route.HOME]: () => '/',
  [Route.TITLE]: ({ uri }: { uri: string }) => `/title/${uri}`,
  [Route.TITLE_EPISODE]: ({ uri, titleUri }: { uri: string, titleUri: string }) => `/title/${uri}/${titleUri}`,
  [Route.WATCH]: ({ mediaUri, episodeUri, sourceUri }: { mediaUri: string, episodeUri: string, sourceUri?: string }) =>
    `/watch/${mediaUri}/${episodeUri}${sourceUri ? `/${sourceUri}`: ''}`,
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.TITLE]: '/title/:uri',
  [Route.TITLE_EPISODE]: '/title/:uri/:titleUri',
  [Route.WATCH]: '/watch/:mediaUri/:episodeUri/:sourceUri?',
}

export const getRouterRoutePath =
  (route: Route) =>
    RouterRoutes[route]

export const getRoutePath = <
  T extends Route
> (
  route: T,
  args?: Parameters<(typeof Routes)[T]>[0]
) =>
  Routes[route](<any>args)
