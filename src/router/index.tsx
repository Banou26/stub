import { useRoutes } from 'raviger'

import { Category, fromUri } from 'src/lib'
import Home from './home'
import CategoryComponent from './home/category'
import { getRouterRoutePath, Route } from './path'
import Title from './home/title'
import Watch from './home/watch'
import Search from './home/search'
import watch from './home/watch'

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
  [getRouterRoutePath(Route.TITLE)]: ({ uri }) => <Title uri={uri}/>,
  [getRouterRoutePath(Route.TITLE_EPISODE)]: ({ uri, episodeUri }) => <Title uri={uri} episodeUri={episodeUri}/>,
  [getRouterRoutePath(Route.WATCH)]: ({ uri, episodeUri, source }) => <Watch uri={uri} episodeUri={episodeUri} source={source}/>,

}

export default () => useRoutes(routes)
