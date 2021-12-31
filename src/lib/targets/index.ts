import Category from '../category'

import * as MyAnimeList from './myanimelist'
import * as Google from './google'
import * as GogoAnime from './gogoanime'
// import { filterTagets } from '../utils'
import { Search, GetLatest, GetLatestOptions, GenreHandle, GetGenres, SearchFilter } from '../types'
import { EpisodeHandle, Get, GetOptions, Handle, Title, TitleHandle } from '..'

const targets: Target[] = [
  MyAnimeList,
  // Google,
  // GogoAnime
]

export default targets

export interface Target {
  scheme: string
  name: string
  search?: Search
  getOptions?: GetOptions
  get?: Get<true>
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
  // const filteredTargets = filterSearch({ categories, genres })
  // const results = filteredTargets.map(target => target.search!({ search, categories, genres }))

  // return (
  //   Promise
  //   .allSettled(results)
  //   .then(results =>
  //     results
  //       .filter(result => result.status === 'fulfilled')
  //       .flatMap((result) => (result as unknown as PromiseFulfilledResult<SearchResult>).value)
  //   )
  // )
}

const targetGenres = new Map<Target, GenreHandle<true>[]>()

// const getGenres = async (target: Target, options?: SearchFilter) => {
//   if (targetGenres.has(target)) return targetGenres.get(target)!
//   if (!target.getGenres) return []
//   const genres = await target.getGenres(options)
//   targetGenres.set(target, genres)
//   return genres
// }

type PopulateHandleReturn<T> =
  T extends TitleHandle<true> ? TitleHandle<false> :
  T extends EpisodeHandle<true> ? EpisodeHandle<false> :
  never

const populateHandle = <T extends TitleHandle<true> | EpisodeHandle<true>>(target: Target, handle: T): PopulateHandleReturn<T> => {
  return {
    ...handle,
    scheme: target.scheme,
    uri: `${target.scheme}:${handle.id}`,
    handles: handle.handles?.map(curryPopulateHandle(target))
  } as PopulateHandleReturn<T>
}

// const populateHandle = <T extends TitleHandle<true> | EpisodeHandle<true> | undefined>(target: Target, handle: T):
//   T extends undefined ? <T extends TitleHandle<true> | EpisodeHandle<true>>(handle: T) => PopulateHandleReturn<T> :
//   PopulateHandleReturn<T> => {
//     if (handle === undefined) return <T extends TitleHandle<true> | EpisodeHandle<true>>(handle: T) => _populateHandle<T>(target, handle)
//     return _populateHandle<Exclude<T, undefined>>(target, handle as Exclude<T, undefined>)
//   }

const curryPopulateHandle =
  (target: Target) =>
    <T extends TitleHandle<true> | EpisodeHandle<true>>(handle: T) =>
      populateHandle<T>(target, handle)

export const fromUri = (uri: string) => ({ scheme: uri.split(':')[0], id: uri.split(':')[1] })


// todo: implemement url get
export const get: Get = (params: Parameters<Get>[0]): ReturnType<Get> => {
  const filteredTargets = targets.filter(({ scheme, get }) => (scheme === scheme || scheme === fromUri(params.uri).scheme) && !!get)
  console.log('GETTTTTTTTTT filteredTargets', filteredTargets)
  const results =
    Promise
      .allSettled(
        filteredTargets
          .map(target =>
            target
              .get?.(params)
              .then(curryPopulateHandle(target))
          )
      )
      .then(results =>
        results
          .filter(result => {
            if (result.status === 'fulfilled') return true
            else {
              console.error(result.reason)
            }
          })
          .flatMap((result) => (result as unknown as PromiseFulfilledResult<Awaited<ReturnType<Get>>>).value)
      )

  // return results

  return {
    
  }
}

export const getLatest: GetLatest = (
  { categories, ...rest }: Parameters<GetLatest<false>>[0] =
  { categories: Object.values(Category) }
) => {
  console.log('categories', categories)
  console.log('targets', targets)
  const filteredTargets =
    targets
      .filter(({ getLatest }) => !!getLatest)
      .filter(({ categories: targetCategories }) =>
        categories
          ? categories.some(category => targetCategories?.includes(category))
          : true
      )
      .filter(target =>
        Object
          .entries(rest)
          .every(([key, val]) => target.getLatestOptions?.[key])
      )
  console.log('filteredTargets', filteredTargets)
  const results =
    filteredTargets
      .map(target =>
        target
          .getLatest?.({ categories, ...rest })
          .then(handles => handles.map(curryPopulateHandle(target)))
      )
  console.log('results', results)
  return (
    Promise
      .allSettled(results)
      .then(results =>
        results
          .filter(result => {
            if (result.status === 'fulfilled') return true
            else {
              console.error(result.reason)
            }
          })
          .flatMap((result) => (result as unknown as PromiseFulfilledResult<Awaited<ReturnType<GetLatest>>>).value)
      )
  )
}

export const getGenres = () => {

}
