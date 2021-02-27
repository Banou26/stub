import Category from '../category'
import Genre from '../genre'

import * as google from './google'
import * as rarbg from './rarbg'
import * as myanimelist from './myanimelist'
// import * as livechart from './livechart'

export * as google from './google'
export * as rarbg from './rarbg'
export * as myanimelist from './myanimelist'
// export * as livechart from './livechart'

export type Search = (
  { search, categories, genres }:
  { search: string, categories?: Category[], genres?: Genre[] }
) => Promise<SearchResult[]>

export interface Target {
  search?: Search
  getLatest?: Function
  categories?: Category[]
  genres?: Genre[]
}

export interface SearchResult {
  target?: Target
  category?: Category
  genre?: Genre
  url?: string
  image?: string
  name: string
}

const targets: Target[] = [
  google,
  rarbg
]

const filterTagets =
  func =>
    (
      { categories, genres }:
      { categories?: Category[], genres?: Genre[] }
    ) =>
  targets
    .filter(func)
    .filter(target =>
      categories?.some(category => target.categories?.includes(category))
    )
    // .filter(target =>
    //   genres?.some(category => target.genres?.includes(category) )
    // )

const filterSearch = filterTagets(({ search }) => search)
const filterGetLatest = filterTagets(({ getLatest }) => getLatest)

export const search: Search = ({ search, categories, genres }) => {
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
