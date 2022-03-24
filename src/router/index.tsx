import { useRoutes } from 'raviger'

import { Category, fromUri } from 'src/lib'
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
//   '/category/movies': () => <CategoryComponent category={Category.MOVIE}/>,
//   '/category/shows': () => <CategoryComponent category={Category.SHOW}/>,
//   '/category/animes': () => <CategoryComponent category={Category.ANIME}/>,
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
  [getRouterRoutePath(Route.TITLE_EPISODE)]: ({ uri, episodeUri }) => <Title uri={uri} episodeUri={episodeUri}/>,
  [getRouterRoutePath(Route.WATCH)]: ({ uri, episodeUri, source }) => <Watch uri={uri} episodeUri={episodeUri} source={source}/>,
  // [getRouterRoutePath(Route.CATEGORY)]: ({ category }) => <CategoryComponent category={Category[category.toLowerString()]}/>,
  '/category/movies': () => 
    <HeaderPage category={Category.MOVIE}>
      <CategoryComponent category={Category.MOVIE}/>
    </HeaderPage>,
  '/category/shows': () => 
    <HeaderPage category={Category.SHOW}>
      <CategoryComponent category={Category.SHOW}/>
    </HeaderPage>,
  '/category/animes': () => 
    <HeaderPage category={Category.ANIME}>
      <CategoryComponent category={Category.ANIME}/>
    </HeaderPage>,
}

export default () => useRoutes(routes)
