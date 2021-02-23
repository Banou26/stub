import type { Category, Genre } from '../index'

import * as google from './google'
import * as rarbg from './rarbg'

export * as google from './google'
export * as rarbg from './rarbg'

export interface Target {
  search?: Function
  getLatest?: Function
  categories?: Category[]
  genres?: Genre[]
}

export interface SearchResult {
  target: Target
  category: Category
  genre: Genre
  url: string
}

const targets: Target[] = [
  google,
  rarbg
]

export const search = (
  { search, categories, genres }:
  { search: string, categories?: Category[], genres?: Genre[] }
) => {
  const filteredTargets =
    targets
      .filter(target => target.search)
      .filter(target =>
        categories?.some(category => target.categories?.includes(category) )
      )

  const results =
    filteredTargets
      .map(target => target.search?.(search))

  return (
    Promise
    .allSettled(results)
    .then(results => 
      results.filter(result => result.status === 'fulfilled')
    )
  )
}

export const latest = (
  { categories, genres }:
  { categories?: Category[], genres?: Genre[] }
) => {


  
}
