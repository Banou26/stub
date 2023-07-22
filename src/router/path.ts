
export enum Route {
  HOME = 'HOME',
  AUTH = 'AUTH',
  TITLE = 'TITLE',
  TITLE_EPISODE = 'TITLE_EPISODE',
  WATCH = 'WATCH',
  // CATEGORY = 'CATEGORY',
  ANIME = 'ANIME',
  ANIME_SEASON = 'ANIME_SEASON',
  TEST = 'TEST',
}

const Routes = {
  [Route.HOME]: () => '/',
  [Route.AUTH]: ({ name }: { name: string }) => `/auth/${name}`,
  [Route.TITLE]: ({ uri }: { uri: string }) => `/title/${uri}`,
  [Route.TITLE_EPISODE]: ({ uri, titleUri }: { uri: string, titleUri: string }) => `/title/${uri}/${titleUri}`,
  [Route.WATCH]: ({ mediaUri, episodeUri, sourceUri }: { mediaUri: string, episodeUri: string, sourceUri?: string }) =>
    `/watch/${mediaUri}/${episodeUri}${sourceUri ? `/${sourceUri}`: ''}`,
  // [Route.CATEGORY]: ({ category }: { category: Category }) => `/category/${category.toLowerCase()}`,
  [Route.ANIME]: () => `/anime`,
  [Route.ANIME_SEASON]: () => `/anime/season`,
  [Route.TEST]: () => `/test`,
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.AUTH]: '/auth/:name',
  [Route.TITLE]: '/title/:uri',
  [Route.TITLE_EPISODE]: '/title/:uri/:titleUri',
  [Route.WATCH]: '/watch/:mediaUri/:episodeUri/:sourceUri?',
  // [Route.CATEGORY]: '/category/:category',
  [Route.ANIME]: `/anime`,
  [Route.ANIME_SEASON]: `/anime/season`,
  [Route.TEST]: `/test`,
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
