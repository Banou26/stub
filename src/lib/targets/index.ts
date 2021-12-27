import Category from '../category'

import * as MyAnimeList from './myanimelist'
import * as Google from './google'
import * as GogoAnime from './gogoanime'
// import { filterTagets } from '../utils'
import { Search, GetLatest, GetLatestOptions, GenreHandle, GetGenres, SearchFilter } from '../types'
import { EpisodeHandle, Get, GetOptions, Handle, TitleHandle } from '..'

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

const populateHandle = <T extends TitleHandle<true> | EpisodeHandle<true>>(target: Target, handle: T):
  T extends TitleHandle<true>
    ? TitleHandle<false>
    : (T extends EpisodeHandle<true>
      ? EpisodeHandle<false>
      : never) => {
  console.log('populateHandle', target, handle)
  return {
    ...handle,
    scheme: target.scheme,
    uri: `${target.scheme}:${handle.id}`
  } as (
    T extends TitleHandle<true>
      ? TitleHandle<false>
      : (T extends EpisodeHandle<true>
        ? EpisodeHandle<false>
        : never)
  )
}

const fromUri = (uri: string) => ({ scheme: uri.split(':')[0], id: uri.split(':')[1] })

export const get: Get = ({ scheme, id, uri }: Parameters<Get<false>>[0]) => {
  console.log('scheme, id, uri', scheme, id, uri)
  const filteredTargets = targets.filter(({ scheme, get }) => (scheme === scheme || scheme === fromUri(uri).scheme) && !!get)
  console.log('filteredTargets', filteredTargets)
  const results =
    filteredTargets
      .map<Promise<[Target, (TitleHandle<true> | EpisodeHandle<true>)[]]>>(async target => [target, (await target.get?.({ categories, ...rest })) ?? []])
  // populateHandle(target, res)
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
          .map<[Target, (TitleHandle<true> | EpisodeHandle<true>)[]]>((result) => (result as unknown as PromiseFulfilledResult<[Target, Awaited<ReturnType<GetLatest<true>>>]>).value)
          .flatMap(([target, handles]) => handles.map(handle => populateHandle(target, handle)))
      )
  )
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
      .map<Promise<[Target, (TitleHandle<true> | EpisodeHandle<true>)[]]>>(async target => [target, (await target.getLatest?.({ categories, ...rest })) ?? []])
  // populateHandle(target, res)
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
          .map<[Target, (TitleHandle<true> | EpisodeHandle<true>)[]]>((result) => (result as unknown as PromiseFulfilledResult<[Target, Awaited<ReturnType<GetLatest<true>>>]>).value)
          .flatMap(([target, handles]) => handles.map(handle => populateHandle(target, handle)))
      )
  )
}

export const getGenres = () => {

}
