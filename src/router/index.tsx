import { css } from '@emotion/react'
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

const contentStyle = css`
  padding-top: 6rem;
`

const HeaderPage = ({ children }: { children: React.ReactNode }) =>
  <Fragment>
    <Header/>
    <div css={contentStyle}>
      {children}
    </div>
  </Fragment>

const NotFoundPage = () =>
  <div>
    Page not found
  </div>


// todo: refactor the header, remove it from each pages and put it at the top level, as it makes a re-render flash whenever we change page
export const routes = {
  [getRouterRoutePath(Route.HOME)]: () =>
    <HeaderPage>
      <Home/>
    </HeaderPage>,
  [getRouterRoutePath(Route.AUTH)]: ({ name }) =>
    <HeaderPage>
      <Auth name={name}/>
    </HeaderPage>,
  [getRouterRoutePath(Route.TITLE)]: ({ uri }) =>
    <HeaderPage>
      <Title uri={uri}/>
    </HeaderPage>,
  [getRouterRoutePath(Route.TITLE_EPISODE)]: ({ uri, titleUri }) =>
    <HeaderPage>
      <Title uri={uri} titleUri={titleUri}/>
    </HeaderPage>,
  [getRouterRoutePath(Route.WATCH)]: ({ uri, titleUri, sourceUri }) =>
    <HeaderPage>
      {
        isUris(uri) && isUri(titleUri) && isUri(sourceUri)
          ? <Watch uri={uri} titleUri={titleUri} sourceUri={sourceUri}/>
          : <NotFoundPage/>
      }
    </HeaderPage>,
  // [getRouterRoutePath(Route.CATEGORY)]: ({ category }) => <CategoryComponent category={Category['toLowerString'()]}/>,
  '/category/movies': () => 
    <HeaderPage>
      <CategoryComponent category={'MOVIE'}/>
    </HeaderPage>,
  '/category/shows': () => 
    <HeaderPage>
      <CategoryComponent category={'SHOW'}/>
    </HeaderPage>,
  '/category/anime': () => 
    <HeaderPage>
      <CategoryComponent category={'ANIME'}/>
    </HeaderPage>,
}

export default () => useRoutes(routes)
