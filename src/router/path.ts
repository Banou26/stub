
export enum Route {
  HOME = 'HOME',
  MEDIA = 'MEDIA',
  MEDIA_EPISODE = 'MEDIA_EPISODE',
  WATCH = 'WATCH',
}

const Routes = {
  [Route.HOME]: () => '/',
  [Route.MEDIA]: ({ uri }: { uri: string }) => `/media/${uri}`,
  [Route.MEDIA_EPISODE]: ({ uri, mediaUri }: { uri: string, mediaUri: string }) => `/media/${uri}/${mediaUri}`,
  [Route.WATCH]: ({ mediaUri, episodeUri, sourceUri }: { mediaUri: string, episodeUri: string, sourceUri?: string }) =>
    `/watch/${mediaUri}/${episodeUri}${sourceUri ? `/${sourceUri}`: ''}`,
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.MEDIA]: '/media/:uri',
  [Route.MEDIA_EPISODE]: '/media/:uri/:mediaUri',
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
