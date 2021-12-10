import Category from '../category'

import * as MyAnimeList from './myanimelist'
import * as Google from './google'
import * as GogoAnime from './gogoanime'
// import { filterTagets } from '../utils'
import { Search, GetLatest } from '../types'

const targets: Target[] = [
  MyAnimeList,
  // Google,
  // GogoAnime
]

export default targets

export interface Target {
  name: string
  search?: Search
  getLatest?: GetLatest<true>
  categories?: Category[]
}

const filterTargets =
  (targets: Target[], func: (target: Target) => boolean) =>
    ({ categories }: { categories?: Category[] }) =>
      targets
        .filter(func)
        .filter(target =>
          categories?.some(category => target.categories?.includes(category))
        )

const filterSearch = filterTargets(targets, ({ search }) => !!search)
const filterGetLatest = filterTargets(targets, ({ getLatest }) => !!getLatest)

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

export const getLatest: GetLatest<false> = (
  { categories, genres }: Parameters<GetLatest<false>>[0] =
  { categories: Object.values(Category) }
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
