import { useRoutes } from 'raviger'

import { Category, fromUri } from 'src/lib'
import Home from './home'
import CategoryComponent from './home/category'
import Title from './home/title'
import Watch from './home/watch'
import Search from './home/search'
import { getRouterRoutePath, Route } from './path'

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


export const routes = {
  [getRouterRoutePath(Route.HOME)]: () => <Home/>,
  [getRouterRoutePath(Route.TITLE)]: ({ uri }) => <Title uri={uri}/>
}

export default () => useRoutes(routes)
