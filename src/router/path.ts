
export enum Route {
  HOME = 'HOME',
  AUTH = 'AUTH',
  TITLE = 'TITLE',
  TITLE_EPISODE = 'TITLE_EPISODE',
  WATCH = 'WATCH',
  // CATEGORY = 'CATEGORY',
  ANIME = 'ANIME',
  ANIME_SEASON = 'ANIME_SEASON'
}

const Routes = {
  [Route.HOME]: () => '/',
  [Route.AUTH]: ({ name }: { name: string }) => `/auth/${name}`,
  [Route.TITLE]: ({ uri }: { uri: string }) => `/title/${uri}`,
  [Route.TITLE_EPISODE]: ({ uri, titleUri }: { uri: string, titleUri: string }) => `/title/${uri}/${titleUri}`,
  [Route.WATCH]: ({ uri, titleUri, sourceUri }: { uri: string, titleUri: string, sourceUri: string }) => `/watch/${uri}/${titleUri}/${sourceUri}`,
  // [Route.CATEGORY]: ({ category }: { category: Category }) => `/category/${category.toLowerCase()}`,
  [Route.ANIME]: () => `/anime`,
  [Route.ANIME_SEASON]: () => `/anime/season`,
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.AUTH]: '/auth/:name',
  [Route.TITLE]: '/title/:uri',
  [Route.TITLE_EPISODE]: '/title/:uri/:titleUri',
  [Route.WATCH]: '/watch/:uri/:titleUri/:sourceUri',
  // [Route.CATEGORY]: '/category/:category',
  [Route.ANIME]: `/anime`,
  [Route.ANIME_SEASON]: `/anime/season`,
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
