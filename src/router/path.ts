import type { Category } from '../../../../scannarr/src'

import { navigate, useLocationChange } from 'raviger'
import { useCallback, useState } from 'react'

export enum Route {
  HOME = 'HOME',
  TITLE = 'TITLE',
  TITLE_EPISODE = 'TITLE_EPISODE',
  WATCH = 'WATCH',
  CATEGORY = 'CATEGORY'
}

const Routes = {
  [Route.HOME]: () => '/',
  [Route.TITLE]: ({ uri }: { uri: string }) => `/title/${uri}`,
  [Route.TITLE_EPISODE]: ({ uri, titleUri }: { uri: string, titleUri: string }) => `/title/${uri}/${titleUri}`,
  [Route.WATCH]: ({ uri, titleUri, sourceUri }: { uri: string, titleUri: string, sourceUri: string }) => `/watch/${uri}/${titleUri}/${sourceUri}`,
  [Route.CATEGORY]: ({ category }: { category: Category }) => `/category/${category.toLowerCase()}`,
}

const RouterRoutes = {
  [Route.HOME]: '/',
  [Route.TITLE]: '/title/:uri',
  [Route.TITLE_EPISODE]: '/title/:uri/:titleUri',
  [Route.WATCH]: '/watch/:uri/:titleUri/:sourceUri',
  [Route.CATEGORY]: '/category/:category',
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

//? source implementation: https://github.com/kyeotic/raviger/blob/main/src/querystring.js

export interface QueryParam {
  [key: string]: any
}

export interface setQueryParamsOptions {
  replace?: boolean
}

export const useHashQueryParams = (
  parseFn = parseQuery,
  serializeFn = serializeQuery
): [QueryParam, (query: QueryParam, options?: setQueryParamsOptions) => void] => {
  const [querystring, setQuerystring] = useState(getHashQueryString())
  const setQueryParams = useCallback(
    (params, { replace = true } = {}) => {
      let path = getCurrentPath()
      params = replace ? params : { ...parseFn(querystring), ...params }
      const serialized = serializeFn(params).toString()
      if (serialized) path += '#' + serialized
      navigate(path)
    },
    [querystring]
  )
  // Update state when route changes
  const updateQuery = useCallback(() => setQuerystring(getHashQueryString()), [setQueryParams])
  useLocationChange(updateQuery)
  return [parseFn(querystring), setQueryParams]
}

export const parseQuery =
  (querystring: string): QueryParam =>
    Object
      .fromEntries(
        new URLSearchParams(querystring)
          .entries()
      )

export const serializeQuery =
  (queryParams: QueryParam): URLSearchParams | string =>
    new URLSearchParams(
      Object
        .entries(queryParams)
        .filter(([, v]) => !(v === null || v === undefined))
    )

export const getHashQueryString = () => location.hash.substring(1)

export const getCurrentPath = () =>
  `${
    window.location.pathname || '/'
  }${
    window.location.search
      ? `?${window.location.search}`
      : ''
  }`
