import Category from '../category'
import Genre from '../genre'

import * as MyAnimeList from './myanimelist'
import * as Google from './google'
import * as GogoAnime from './gogoanime'
import { filterTagets } from '../utils'
import { Search } from '../types'

export default [
  MyAnimeList,
  Google,
  GogoAnime
]

export interface Target {
  search?: Search
  getLatest?: Function
  categories?: Category[]
  genres?: Genre[]
}

const targets: Target[] = [
  google,
  myanimelist
  // rarbg
]

const filterSearch = filterTagets(({ search }) => search)
const filterGetLatest = filterTagets(({ getLatest }) => getLatest)

export const search = ({ search, categories, genres }) => {
  const filteredTargets = filterSearch({ categories, genres })
  const results = filteredTargets.map(target => target.search!({ search, categories, genres }))

  return (
    Promise
    .allSettled(results)
    .then(results =>
      results
        .filter(result => result.status === 'fulfilled')
        .flatMap((result) => (result as unknown as PromiseFulfilledResult<SearchResult>).value)
    )
  )
}

export const getLatest = (
  { categories, genres }:
  { categories?: Category[], genres?: Genre[] } =
  { categories: Object.values(Category), genres: Object.values(Genre) }
) => {
  const filteredTargets = filterGetLatest({ categories, genres })
  const results = filteredTargets.map(target => target.getLatest?.({ categories, genres }))
  console.log('categories', categories)
  return (
    Promise
    .allSettled(results)
    .then(results =>
      results
        .filter(result => result.status === 'fulfilled')
        .flatMap((result) => (result as unknown as PromiseFulfilledResult<SearchResult>).value)
    )
  )
}

export const getGenres = () => {

}
