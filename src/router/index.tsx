/** @jsx jsx */
import { jsx } from '@emotion/react'
import { useRoutes  } from 'raviger'

import { Category } from 'src/lib'
import Home from './home'
import Latest from './latest'
import Animes from './anime'
import Anime from './anime/anime'

export const routes = {
  '/': () => <Home/>,
  '/latest': () => <Latest/>,
  '/latest/:category': ({ category }: { category: string }) =>
    Object.keys(Category).map(str => str.toLowerCase()).includes(category.toLowerCase())
      ? <Latest category={category as Category}/>
      : <Latest/>,
  '/animes': () => <Animes/>,
  '/anime/:name': ({ name }) => <Anime name={name}/>
}

export default () => useRoutes(routes)
