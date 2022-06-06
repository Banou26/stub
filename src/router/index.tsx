import { useRoutes } from 'raviger'

import { Category } from '../../../../scannarr/src'
import Home from './home'
import CategoryComponent from './category'
import { getRouterRoutePath, Route } from './path'
import Title from './title'
import Watch from './watch'
import Search from './home/search'
import watch from './watch'
import { Fragment } from 'react'
import Header from 'src/components/header'

// export const routes = {
//   '/': () => <Home/>,
//   '/category/movies': () => <CategoryComponent category={'MOVIE'}/>,
//   '/category/shows': () => <CategoryComponent category={'SHOW'}/>,
//   '/category/animes': () => <CategoryComponent category={'ANIME'}/>,
//   '/title/:uri': ({ uri }) => <Title uri={uri}/>,
//   '/watch/:name': ({ name }) => <Watch name={decodeURI(name)}/>,
//   '/search': () => <Search/>
// }

// export default () => useRoutes(routes)

const HeaderPage = ({ children, category }: { children: React.ReactNode, category: Category }) =>
  <Fragment>
    <Header category={category}/>
    <div>
      {children}
    </div>
  </Fragment>

export const routes = {
  [getRouterRoutePath(Route.HOME)]: () => <Home/>,
  [getRouterRoutePath(Route.TITLE)]: ({ uri }) => <Title uri={uri}/>,
  [getRouterRoutePath(Route.TITLE_EPISODE)]: ({ uri, titleUri }) => <Title uri={uri} titleUri={titleUri}/>,
  [getRouterRoutePath(Route.WATCH)]: ({ uri, titleUri, source }) => <Watch uri={uri} titleUri={titleUri} source={source}/>,
  // [getRouterRoutePath(Route.CATEGORY)]: ({ category }) => <CategoryComponent category={Category['toLowerString'()]}/>,
  '/category/movies': () => 
    <HeaderPage category={'MOVIE'}>
      <CategoryComponent category={'MOVIE'}/>
    </HeaderPage>,
  '/category/shows': () => 
    <HeaderPage category={'SHOW'}>
      <CategoryComponent category={'SHOW'}/>
    </HeaderPage>,
  '/category/animes': () => 
    <HeaderPage category={'ANIME'}>
      <CategoryComponent category={'ANIME'}/>
    </HeaderPage>,
}

export default () => useRoutes(routes)
