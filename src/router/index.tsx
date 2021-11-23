import { useRoutes } from 'raviger'

import { Category } from 'src/lib'
import Home from './home'
import CategoryComponent from './home/category'
import Watch from './home/watch'

export const routes = {
  '/': () => <Home/>,
  '/category/movies': () => <CategoryComponent category={Category.MOVIE}/>,
  '/category/shows': () => <CategoryComponent category={Category.SHOW}/>,
  '/category/animes': () => <CategoryComponent category={Category.ANIME}/>,
  '/watch/:name': ({ name }) => <Watch name={name}/>
}

export default () => useRoutes(routes)
