import Category from '../category'

import * as MyAnimeList from './myanimelist'
import * as Google from './google'
import * as GogoAnime from './gogoanime'
// import { filterTagets } from '../utils'
import { Search, GetLatest, GetLatestOptions, GenreHandle, GetGenres, SearchFilter } from '../types'

const targets: Target[] = [
  MyAnimeList,
  // Google,
  // GogoAnime
]

export default targets

export interface Target {
  name: string
  search?: Search
  getLatestOptions?: GetLatestOptions
  getLatest?: GetLatest<true>
  getGenres?: GetGenres<true>
  categories?: Category[]
}

const filterTargets =
  (targets: Target[], func: (target: Target) => boolean) =>
    (func2: (target: Target) => boolean) =>
      targets
        .filter(func)
        .filter(func2)

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

const targetGenres = new Map<Target, GenreHandle<true>[]>()

const getGenres = async (target: Target, options?: SearchFilter) => {
  if (targetGenres.has(target)) return targetGenres.get(target)!
  if (!target.getGenres) return []
  const genres = await target.getGenres(options)
  targetGenres.set(target, genres)
  return genres
}

export const getLatest: GetLatest = (
  { categories, genres }: Parameters<GetLatest<false>>[0] =
  { categories: Object.values(Category) }
) => {
  const filteredTargets = filterGetLatest(({ getLatestOptions }) => { categories, genres })
  const results = filteredTargets.map(target => target.getLatest?.({ categories, genres }))
  console.log('categories', categories)
  return (
    Promise
      .allSettled(results)
      .then(results =>
        results
          .filter(result => result.status === 'fulfilled')
          .flatMap((result) => (result as unknown as PromiseFulfilledResult<Awaited<ReturnType<GetLatest>>>).value)
      )
  )
}

export const getGenres = () => {

}
