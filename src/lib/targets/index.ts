import Category from '../category'

import * as MyAnimeList from './myanimelist'

import { _Title, _Episode, Episode, EpisodeHandle, Get, GetEpisode, GetGenre, GetTitle, Handle, SearchEpisode, SearchGenre, SearchTitle, Title, TitleHandle } from '..'

const targets: Target[] = [
  MyAnimeList
]

export default targets

export interface Target {
  categories?: Category[]
  scheme: string
  name: string
  searchTitle?: SearchTitle
  searchEpisode?: SearchEpisode
  searchGenre?: SearchGenre
  getTitle?: GetTitle
  getEpisode?: GetEpisode
  getGenre?: GetGenre
}

type TargetCallable =
  Omit<Target, 'categories' | 'scheme' | 'name'>

const populateHandle = <T extends TitleHandle | EpisodeHandle>(handle: T): T & { uri: string } => ({
  ...handle,
  uri: `${handle.scheme}:${handle.id}`,
  handles: handle.handles?.map(populateHandle)
}) as T & { uri: string }

export const fromUri = (uri: string) => {
  const [scheme, id] = uri.split(':')
  return { scheme, id }
}

export const toUri = ({ scheme, id }: { scheme: string, id: string }) => `${scheme}:${id}`

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
              .then(populateHandle)
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
          .then(handles => handles.map(populateHandle))
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

const filterTargets = <T extends keyof Target>(
  { targets, categories, method, params }:
  { targets: Target[], categories?: Category[], method: T, params: Omit<Target[T], 'function'> }
) =>
  targets
    .filter(target => !!target[method])
    .filter(({ categories: targetCategories }) =>
      categories
        ? categories.some(category => targetCategories?.includes(category))
        : true
    )
    .filter(target =>
      Object
        .keys(params ?? {})
        .every(key => target[method]?.[key])
    )

// todo: try to fix the typing issues
const filterTargetResponses = <T extends keyof TargetCallable>(
  { targets, categories, method, params, injectCategories }:
  { targets: Target[], categories?: Category[], method: T, params: Parameters<Exclude<Target[T], undefined>['function']>[0], injectCategories?: boolean }
): ReturnType<Exclude<Target[T], undefined>['function']> =>
  // @ts-ignore
  Promise
    .allSettled(
      targets
        .filter(target =>
          categories
            ? target[method]
            : true
        )
        .map(target =>
          target[method]
            // @ts-ignore
            ?.function({ categories, ...params })
            ?.then(handles =>
              Array.isArray(handles)
                ? handles.map(populateHandle)
                : populateHandle(handles)
            )
        )
    )
    .then(results =>
      results
        .filter(result => {
          if (result.status === 'fulfilled') return true
          else console.error(result.reason)
        })
        // @ts-ignore
        .flatMap((result) => (result as unknown as PromiseFulfilledResult<Awaited<ReturnType<Exclude<Target[T], undefined>['function']>>>).value)
    )

// const handleToHandleProperty =
//   <T extends keyof (TitleHandle & EpisodeHandle)>(props: T[]) =>
//     <T2 extends Parameters<typeof populateHandle>[0]>({ uri, scheme, id, ...rest }: T2) => ({
//       ...Object.fromEntries(
//         Object
//         .entries(rest)
//         .filter(([key]: [T, any]) => props.includes(key))
//       ) as Pick<(TitleHandle & EpisodeHandle) & { uri: string }, T>,
//       uri,
//       scheme,
//       id
//     })

// const handleToHandleProperty =
//   <T extends keyof (TitleHandle & EpisodeHandle)>(props: T[]) =>
//     <T2 extends Parameters<typeof populateHandle>[0]>({ uri, scheme, id, ...rest }: T2) => ({
//       ...Object.fromEntries(
//         Object
//         .entries(rest)
//         .filter(([key]: [T, any]) => props.includes(key))
//       ),
//       uri,
//       scheme,
//       id
//     }) as Pick<(TitleHandle & EpisodeHandle), T> & Handle & { uri: string }

// const handleToHandleProperty =
//   <T extends keyof (TitleHandle & EpisodeHandle)>(prop: T) =>
//     <T2 extends ReturnType<typeof populateHandle>>(handle: T2) => ({
//       ...handle[prop],
//       uri: handle.uri,
//       scheme: handle.scheme,
//       id: handle.id
//     }) as Pick<(TitleHandle & EpisodeHandle), T> & Handle & { uri: string }

// const handleToHandleProperty =
//   <T extends Handle = (TitleHandle | EpisodeHandle), T2 extends keyof T = keyof T>(prop: T2) =>
//     (handle: T): Handle & Pick<T, T2>[T2] => ({
//       ...handle[prop],
//       uri: handle.uri,
//       scheme: handle.scheme,
//       id: handle.id
//     })

// const handleToHandleProperty =
//   <T extends _Episode, T2 extends keyof T>(prop: T2) =>
//     (handle: T): T[T2] => handle[prop]

// const handleToHandleProperty = <T extends Handle, T2 extends keyof T = keyof T>(handle: T, prop: T2) => handle[prop]

// const foo = handleToHandleProperty<EpisodeHandle>({
//   scheme: '',
//   id: '',
//   season: 0,
//   number: 0,
//   names: [{ language: '', name: '' }],
//   releaseDates: [],
//   categories: [],
//   handles: [],
//   images: [],
//   related: [],
//   synopses: [],
//   tags: []
// }, 'names')

// todo: try to fix the type issue here
// const handleToHandleProperty =
//   <T2 extends keyof (Handle & { uri: string })>(prop: T2) =>
//     (handle: )
//     Pick<T, T2>[T2] extends Pick<T, T2>[T2][]
//       ? (Handle & { uri: string } & Pick<T, T2>[T2][number])
//       : (Handle & { uri: string } & Pick<T, T2>[T2]) => {
//       => {

//         const value = handle[prop]

//         if (Array.isArray(value)) {
//           return (
//             value
//               .map(val => ({
//                 ...val,
//                 uri: handle.uri,
//                 scheme: handle.scheme,
//                 id: handle.id
//               }))
//           )
//         }

//         return ({
//           [prop]: value,
//           uri: handle.uri,
//           scheme: handle.scheme,
//           id: handle.id
//         })

//         // return (
//         //   Array.isArray(value)
//         //     ? (
//         //       value
//         //         .map(val => ({
//         //           ...val,
//         //           uri: handle.uri,
//         //           scheme: handle.scheme,
//         //           id: handle.id
//         //         }))
//         //     )
//         //     :  ({
//         //       [prop]: value,
//         //       uri: handle.uri,
//         //       scheme: handle.scheme,
//         //       id: handle.id
//         //     })
//         )
//       }

// const foo = handleToHandleProperty({
//   scheme: '',
//   id: '',
//   season: 0,
//   number: 0,
//   names: [{ language: '', name: '' }],
//   releaseDates: [],
//   categories: [],
//   handles: [],
//   images: [],
//   related: [],
//   synopses: [],
//   tags: []
// }, 'names')

// const foo = handleToHandleProperty({
//   scheme: '',
//   id: '',
//   season: 0,
//   number: 0,
//   names: [{ language: '', name: '' }],
//   releaseDates: [],
//   categories: [],
//   handles: [],
//   images: [],
//   related: [],
//   synopses: [],
//   tags: []
// }, 'names')
// const bar = foo.

// todo: try to make this shit curryiable and fix the ts ignore once TS is finally good
const handleToHandleProperty =
  <T extends Handle, T2 extends keyof T = keyof T>(prop: T2, handle: T):
    Pick<T, T2>[T2] extends any[]
      ? (Handle & { uri: string } & Pick<T, T2>[T2][number])
      : (Handle & { uri: string } & Pick<T, T2>[T2]) =>
      Array.isArray(handle[prop])
        ? (
          handle[prop]
            // @ts-ignore
            .map(val => populateHandle({
              ...val,
              uri: handle.uri,
              scheme: handle.scheme,
              id: handle.id
            }))
        )
        // @ts-ignore
        : populateHandle({
          [prop]: handle[prop],
          uri: handle.uri,
          scheme: handle.scheme,
          id: handle.id
        })

const makeEpisodeFromEpisodeHandles = (episodeHandles: EpisodeHandle[]): Episode => ({
  uri: episodeHandles.map(({ uri }) => uri).join(','),
  season: findMostCommon(episodeHandles.map(({ season }) => season))[0],
  number: findMostCommon(episodeHandles.map(({ number }) => number))[0],
  uris: episodeHandles.flatMap(({ uri, scheme, id }) => ({ uri: uri!, scheme, id })),
  categories: [...new Set(episodeHandles.flatMap(handle => handleToHandleProperty('categories', handle)))],
  names: episodeHandles.flatMap(handle => handleToHandleProperty('names', handle)),
  images: episodeHandles.flatMap(handle => handleToHandleProperty('images', handle)),
  releaseDates: episodeHandles.flatMap(handle => handleToHandleProperty('releaseDates', handle)),
  synopses: episodeHandles.flatMap(handle => handleToHandleProperty('synopses', handle)),
  handles: episodeHandles.flatMap(({ handles }) => handles),
  tags: [],
  related: []
})

const findMostCommon = (arr) => {
  const instances = [
    ...arr
      .reduce(
        (map, val) => map.set(val, (map.get(val) ?? 0) + 1),
        new Map()
      )
      .entries()
  ]
  const max = Math.max(...instances.map(([, instances]) => instances))
  return instances.filter(([, instances]) => instances === max).map(([num]) => num)
}

const makeTitleFromTitleHandles = (titleHandles: TitleHandle[]): Title => ({
  uri: titleHandles.map(({ uri }) => uri).join(','),
  categories: [...new Set(titleHandles.flatMap(handle => handleToHandleProperty('categories', handle)))],
  uris: titleHandles.flatMap(({ uri, scheme, id }) => ({ uri: uri!, scheme, id })),
  names: titleHandles.flatMap(handle => handleToHandleProperty('names', handle)),
  releaseDates: titleHandles.flatMap(handle => handleToHandleProperty('releaseDates', handle)),
  images: titleHandles.flatMap(handle => handleToHandleProperty('images', handle)),
  synopses: titleHandles.flatMap(handle => handleToHandleProperty('synopses', handle)),
  related: [],
  handles: titleHandles,
  // episodes: titleHandles.map(makeEpisodeFromEpisodeHandles).map(handleToHandleProperty(['episodes'])),
  episodes: titleHandles.flatMap(({ episodes }) => episodes.map(handle => makeEpisodeFromEpisodeHandles([handle]))),
  recommended: [],
  tags: [],
  genres: []
})

const handles: Handle[] = []

export const searchTitle: SearchTitle['function'] = async ({ categories, ...rest }) => {
  const _targets = filterTargets({
    targets,
    method: 'searchTitle',
    categories,
    params:
      Object.fromEntries(
        Object
          .entries({ ...rest, categories })
          .filter(([key, val])  => val !== undefined)
      )
  })

  const titleHandles = await filterTargetResponses({
    targets: _targets,
    categories,
    method: 'searchTitle',
    params: { ...rest, categories }
  }) as unknown as TitleHandle[]

  for (const handle of titleHandles) handles.push(handle)

  return titleHandles.map(titleHandle => makeTitleFromTitleHandles([titleHandle]))
}

export const getTitle: GetTitle['function'] = async (args) => {
  const _targets = filterTargets({
    targets,
    method: 'getTitle',
    params: {}
  })

  const titleHandles = await filterTargetResponses({
    targets: _targets,
    method: 'getTitle',
    params: args
  }) as unknown as TitleHandle[]

  for (const handle of titleHandles) handles.push(handle)

  return makeTitleFromTitleHandles(titleHandles)
}

export const getEpisode: GetEpisode['function'] = async (args) => {
  const _targets = filterTargets({
    targets,
    method: 'getEpisode',
    params: {}
  })

  const episodeHandles = await filterTargetResponses({
    targets: _targets,
    method: 'getEpisode',
    params: args
  }) as unknown as EpisodeHandle[]

  for (const handle of episodeHandles) handles.push(handle)

  return makeEpisodeFromEpisodeHandles(episodeHandles)
}

