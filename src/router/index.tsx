import type { Category } from '../../../../scannarr/src'

import { useRoutes } from 'raviger'
import { Fragment } from 'react'

import Home from './home'
import CategoryComponent from './category'
import { getRouterRoutePath, Route } from './path'
import Auth from './auth/mal'
import Title from './title'
import Watch from './watch'
import Header from '../components/header'
import { isUri, isUris } from '../../../../scannarr/src/utils'

const HeaderPage = ({ children, category }: { children: React.ReactNode, category: Category }) =>
  <Fragment>
    <Header category={category}/>
    <div>
      {children}
    </div>
  </Fragment>

const NotFoundPage = () =>
  <div>
    Page not found
  </div>

export const routes = {
  [getRouterRoutePath(Route.HOME)]: () => <Home/>,
  [getRouterRoutePath(Route.AUTH)]: ({ name }) => <Auth name={name}/>,
  [getRouterRoutePath(Route.TITLE)]: ({ uri }) => <Title uri={uri}/>,
  [getRouterRoutePath(Route.TITLE_EPISODE)]: ({ uri, titleUri }) => <Title uri={uri} titleUri={titleUri}/>,
  [getRouterRoutePath(Route.WATCH)]: ({ uri, titleUri, sourceUri }) =>
    isUris(uri) && isUri(titleUri) && isUri(sourceUri)
      ? <Watch uri={uri} titleUri={titleUri} sourceUri={sourceUri}/>
      : <NotFoundPage/>,
  // [getRouterRoutePath(Route.CATEGORY)]: ({ category }) => <CategoryComponent category={Category['toLowerString'()]}/>,
  '/category/movies': () => 
    <HeaderPage category={'MOVIE'}>
      <CategoryComponent category={'MOVIE'}/>
    </HeaderPage>,
  '/category/shows': () => 
    <HeaderPage category={'SHOW'}>
      <CategoryComponent category={'SHOW'}/>
    </HeaderPage>,
  '/category/anime': () => 
    <HeaderPage category={'ANIME'}>
      <CategoryComponent category={'ANIME'}/>
    </HeaderPage>,
}

export default () => useRoutes(routes)
