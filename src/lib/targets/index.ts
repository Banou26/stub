import * as A from 'fp-ts/lib/Array'


import { targets } from './targets'
import Category from '../category'

import { _Title, _Episode, Episode, EpisodeHandle, Get, GetEpisode, GetGenre, GetTitle, Handle, SearchEpisode, SearchGenre, SearchTitle, Title, TitleHandle } from '..'

import './myanimelist'
import './nyaasi'
import { findMostCommon, fromUri, getAlignedStringParts, populateHandle } from '../utils'
import { Name } from '../types'
import { pipe } from 'fp-ts/lib/function'

export * from './targets'

export default targets

export interface Target {
  categories?: Category[]
  scheme: string
  name: string
  icon?: string
  searchTitle?: SearchTitle<true>
  searchEpisode?: SearchEpisode
  searchGenre?: SearchGenre
  getTitle?: GetTitle<true>
  getEpisode?: GetEpisode<true>
  getGenre?: GetGenre
}

type TargetCallable =
  Omit<Target, 'categories' | 'scheme' | 'name'>

// todo: implemement url get
export const get: Get = (params: Parameters<Get>[0]): ReturnType<Get> => {
  const filteredTargets = targets.filter(({ scheme, get }) => (scheme === scheme || scheme === fromUri(params.uri).scheme) && !!get)
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
  const results =
    filteredTargets
      .map(target =>
        target
          .getLatest?.({ categories, ...rest })
          .then(handles => handles.map(populateHandle))
      )
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
        .every(key =>
          Array.isArray(params[key])
            ? target[method]?.[key].filter(item => params[key].includes(item)).length === params[key].length
            : target[method]?.[key] === params[key]
        )
    )

// todo: try to fix the typing issues
const filterTargetResponses = <T extends keyof TargetCallable>(
  { targets, scheme, categories, method, params, injectCategories }:
  { targets: Target[], scheme?: string, categories?: Category[], method: T, params: Parameters<Exclude<Target[T], undefined>['function']>[0], injectCategories?: boolean }
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

// todo: try to make this shit curryiable and fix the ts ignore once TS is finally good
const handleToHandleProperty =
  <
    T extends Handle,
    T2 extends keyof T = keyof T,
    T3 extends Handle = T extends { episodes: any } ? TitleHandle : EpisodeHandle
  >(handle: T, prop: T2):
    Pick<T, T2>[T2] extends any[]
      ? ({ handle: T3 } & Pick<T, T2>[T2][number])
      : ({ handle: T3 } & Pick<T, T2>[T2]) =>
      Array.isArray(handle[prop])
        ? (
          handle[prop]
            // @ts-ignore
            .map(val => ({
              ...val,
              handle: handle
            }))
        )
        : ({
          [prop]: handle[prop],
          handle
        })

// todo: fix typing issues
const handlesToHandleProperties =
  <T extends (TitleHandle | EpisodeHandle), T2 extends keyof T>(handles: T[], props: T2[]): Pick<T, T2> =>
    Object.fromEntries(
      props
        .map(prop => [
          prop,
          handles.flatMap(handle => handleToHandleProperty(handle, prop))
        ])
    ) as unknown as Pick<T, T2>

// todo: fix typing issues
const handlesToType = <
  T extends (TitleHandle | EpisodeHandle),
  T2 extends keyof T,
  T3 = T extends { episodes: any } ? Title : Episode,
>(handles: T[], properties: T2[], override: Partial<T3>): T3 => ({
  uri: handles.map(({ uri }) => uri).join(','),
  uris: handles.flatMap(({ uri, scheme, id }) => ({ uri: uri!, scheme, id })),
  // @ts-ignore
  handles: [...handles, ...handles.flatMap(({ handles }) => handles)],
  ...handlesToHandleProperties(handles, properties),
  ...override
}) as unknown as T3

const normalizeEpisodeHandle = ({
  categories, handles, id, images, names, number,
  related, releaseDates, scheme, season, synopses,
  tags, uri, url, type, resolution, size, teamEpisode,
  batch
}: EpisodeHandle): EpisodeHandle => {
  if (!id || typeof id !== 'string') throw new Error('Episode handle "id" property must be a non empty string')
  if (!scheme || typeof scheme !== 'string') throw new Error('Episode handle "scheme" property must be a non empty string')

  return ({
    categories: categories?.filter(category => Object.values(Category).includes(category)) ?? [],
    handles: handles?.map(normalizeEpisodeHandle) ?? [],
    id,
    images: images?.map(({ size, type, url }) => ({
      size,
      type,
      url
    })) ?? [],
    names: names?.map(({ search, language, name }) => ({
      search,
      language,
      name
    })) ?? [],
    number,
    related: related?.map(({ reference, relation }) => ({
      reference,
      relation
    })) ?? [],
    releaseDates: releaseDates?.map(({ language, date, end, start }) => ({
      language,
      date,
      end,
      start
    })) ?? [],
    scheme,
    season,
    synopses: synopses?.map(({ language, synopsis }) => ({
      language,
      synopsis
    })) ?? [],
    tags: tags?.map(({ type, extra, value }) => ({
      type,
      extra,
      value
    })) ?? [],
    uri,
    url,
    type,
    resolution,
    size,
    batch,
    teamEpisode:
      teamEpisode
        ? {
          url: teamEpisode.url,
          team:
            teamEpisode.team
            && {
              name: teamEpisode.team.name,
              tag: teamEpisode.team.tag,
              url: teamEpisode.team.url,
              icon: teamEpisode.team.icon
            }
        }
        : undefined
  })
}

const makeEpisodeFromEpisodeHandles = (episodeHandles: EpisodeHandle[]): Episode =>
  handlesToType(
    episodeHandles.map(normalizeEpisodeHandle),
    ['season', 'number', 'names', 'images', 'releaseDates', 'synopses', 'tags', 'resolution'],
    {
      categories: episodeHandles.map(handle => handle.categories.map(category => ({ handle, categories: category }))),
      related: []
    }
  ) as unknown as Episode

const normalizeTitleHandle = ({
  categories, episodes, genres, handles, id, images, names,
  recommended, related, releaseDates, scheme, synopses, tags,
  uri, url
}: TitleHandle): TitleHandle => {
  if (!id || typeof id !== 'string') throw new Error('Title handle "id" property must be a non empty string')
  if (!scheme || typeof scheme !== 'string') throw new Error('Title handle "scheme" property must be a non empty string')

  return ({
    categories: categories?.filter(category => Object.values(Category).includes(category)) ?? [],
    episodes: episodes?.map(normalizeEpisodeHandle) ?? [],
    genres: genres?.map(({ categories, id, name, scheme, uri, adult, amount, handles, url }) => ({
      categories,
      id,
      name,
      scheme,
      uri,
      adult,
      amount,
      handles,
      url
    })) ?? [],
    handles: handles?.map(normalizeTitleHandle) ?? [],
    id,
    images: images?.map(({ size, type, url }) => ({
      size,
      type,
      url
    })) ?? [],
    names: names?.map(({ search, language, name }) => ({
      search,
      language,
      name
    })) ?? [],
    recommended: recommended?.map(normalizeTitleHandle) ?? [],
    related: related?.map(({ reference, relation }) => ({
      reference,
      relation
    })) ?? [],
    releaseDates: releaseDates?.map(({ language, date, end, start }) => ({
      language,
      date,
      end,
      start
    })) ?? [],
    scheme,
    synopses: synopses?.map(({ language, synopsis }) => ({
      language,
      synopsis
    })) ?? [],
    tags: tags?.map(({ type, extra, value }) => ({
      type,
      extra,
      value
    })) ?? [],
    uri,
    url,
  })
}

const makeTitleFromTitleHandles = (titleHandles: TitleHandle[]): Title =>
  handlesToType(
    titleHandles.map(normalizeTitleHandle),
    ['names', 'images', 'releaseDates', 'synopses', 'tags'],
    {
      categories: titleHandles.flatMap(handle => handle.categories.map(category => ({ handle, categories: category }))),
      episodes: titleHandles.map(populateHandle).flatMap(({ episodes }) => episodes.map(handle => makeEpisodeFromEpisodeHandles([handle]))),
      related: [],
      recommended: [],
      genres: []
    }
  ) as unknown as Title

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
    params: {
      ...args.uri && { scheme: fromUri(args.uri).scheme }
    }
  })

  const titleHandles = await filterTargetResponses({
    targets: _targets,
    method: 'getTitle',
    params: args
  }) as unknown as TitleHandle[]

  for (const handle of titleHandles) handles.push(handle)

  const title = makeTitleFromTitleHandles(titleHandles)
  return title
}

export const getEpisode: GetEpisode['function'] = async (args) => {
  const _targets = filterTargets({
    targets,
    method: 'getEpisode',
    params: {
      ...args.uri && { scheme: fromUri(args.uri).scheme }
    }
  })

  const episodeHandles = await filterTargetResponses({
    targets: _targets,
    method: 'getEpisode',
    params: args
  }) as unknown as EpisodeHandle[]

  for (const handle of episodeHandles) handles.push(handle)

  const title: Title = args.title

  const episodePreSearch = makeEpisodeFromEpisodeHandles(episodeHandles)

  const Name = {
    EqByName: {
      equals: (name: Name, name2: Name) => name.name === name2.name
    }
  }
  
  // const findNewTeams =
  //   (episodes: Impl<EpisodeHandle>[]) =>
  //     (teams: Team[]) =>
  //       pipe(
  //         episodes,
  //         A.filter<Impl<EpisodeHandle> & { teamEpisode: TeamEpisode }>((ep: Impl<EpisodeHandle>) => !!ep.teamEpisode.team),
  //         A.filter((ep) => !A.elem(Team.EqByTag)(ep.teamEpisode.team)(teams)),
  //         A.map(ep => ep.teamEpisode.team),
  //         A.uniq(Team.EqByTag)
  //       )

  const searchNames =
    pipe(
      title.names,
      A.filter(({ search }) => Boolean(search))
    )

  // console.log('names', title.names)

  // console.log(
  //   'pipe test',
  //   pipe(
  //     title.names,
  //     A.uniq(Name.EqByName)
  //   )
  // )

  const mostCommonSubnames =
    findMostCommon(
      pipe(
        title.names,
        A.uniq(Name.EqByName)
      )
        .flatMap(name =>
          title.names.flatMap(_name => getAlignedStringParts(name.name, _name.name))
        )
        .map(alignment => alignment.alignedSequences)
        .filter(([val, val2]) => val === val2)
        .map(([val]) => val)
        .filter(val => val.trim().length)
    )[0]
    .replace(/^[\s:\-\!]*?(.*?)[\s:\-\!]*?$/, '$1')

  // const mostCommonSubnames2 =
  //     pipe(
  //       title.names,
  //       A.uniq(Name.EqByName)
  //     )
  //       .flatMap(name =>
  //         title.names.flatMap(_name => getAlignedStringParts(name.name, _name.name))
  //       )
  //       .map(alignment => alignment)

  // console.log('mostCommonSubnames', mostCommonSubnames)

  

  const titles = []

  // @ts-ignore
  const _searchedEpisodeHandles = await searchEpisode({
    // categories: [Category.ANIME],
    titles:
      [
        ...title.names.filter((name) => name.language === 'ja-en'),
        { handle: undefined, search: true, name: mostCommonSubnames, language: '' },
        ...title.names.filter((name) => name.language !== 'ja-en'),
      ],
    season: episodePreSearch.season.at(0)?.season,
    number: episodePreSearch.number.at(0)?.number,
    // batch: 
    // search: `${mostCommonSubnames ? mostCommonSubnames : title.names.find((name) => name.language === 'ja-en')?.name} ${episodePreSearch.number.at(0)?.number.toString().padStart(2, '0')}`,
    // search: episodePreSearch.names.find((name) => name.language === 'ja-en')?.name,
    // title: args.title
  })
  const searchedEpisodeHandles = _searchedEpisodeHandles[0]?.handles ?? []
  const postSearchHandles = [...episodeHandles, ...searchedEpisodeHandles]
  const postSearchEpisode = makeEpisodeFromEpisodeHandles(postSearchHandles)
  return postSearchEpisode
}

export const searchEpisode: SearchEpisode['function'] = async (args) => {
  const _targets = filterTargets({
    targets,
    method: 'searchEpisode',
    params: {
      // ...args.uri && { scheme: fromUri(args.uri).scheme }
    }
  })

  const episodeHandles = await filterTargetResponses({
    targets: _targets,
    method: 'searchEpisode',
    params: args
  }) as unknown as EpisodeHandle[]

  for (const handle of episodeHandles) handles.push(handle)

  return [makeEpisodeFromEpisodeHandles(episodeHandles)]
}
