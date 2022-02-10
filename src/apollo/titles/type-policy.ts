import { FieldFunctionOptions, makeVar } from '@apollo/client'
import { Episode, EpisodeHandle, Handle, Image, Name, NameHandle, Relation, Relationship, ReleaseDate, Synopsis, Title, TitleHandle } from 'src/lib'
import { EpisodeApolloCache, EpisodeHandleApolloCache, GET_EPISODE, GET_TITLE, ImageApolloCache, NameApolloCache, RelationApolloCache, ReleaseDateApolloCache, SEARCH_TITLE, SynopsisApolloCache, TitleApolloCache, TitleHandleApolloCache } from '.'
import { get, searchTitle, getTitle, getEpisode } from '../../lib/targets'
import cache from '../cache'
import { HandleApolloCache } from './types'

export const asyncRead = (fn, query) => {
  return (_, args) => {
      if (!args.storage.var) {
          args.storage.var = makeVar(undefined)
          fn(_, args).then(
              data => {
                  args.storage.var(data)
                  args.cache.writeQuery({
                      query,
                      data: { [args.fieldName]: data }
                  })
              }
          )
      }
      return args.storage.var()
  }
}

// todo: try to type this function
const handleToHandleApolloCache = (handle) => {
  return ({
    url: handle.url ?? null,
    uri: handle.uri ?? null,
    id: handle.id ?? null,
    scheme: handle.scheme ?? null,
    ...handle,
    ...!handle.handles && { handles: null }
  })
}

const propertyToHandleProperty = (property: any, __typename: string) => ({
  ...property,
  handle: handleToHandleApolloCache({ ...property.handle, __typename })
})

// todo: fix typing issues
const handlePropertiesToHandlePropertiesApolloCache =
  <T extends (Title | Episode), T2 extends keyof T>(type: T, props: T2[], __typename: string): Pick<T, T2> =>
    Object.fromEntries(
      Object
        .entries(type)
        .filter(([key]) => props.includes(key))
        .map(([key, val]) => [key, propertyToHandleProperty(val, __typename)])
    )

const nullToUndefined = (object: any) =>
  Array.isArray(object)
    ? object.map(nullToUndefined)
    : (
      Object.fromEntries(
        Object
          .entries(object)
          .map(([key, val]) => [key, val === undefined ? null : val])
      )
    )

const typeToTypeApolloCache = <
  T extends (Title | Episode),
  T2 extends keyof T,
>(handles: T[], properties: T2[], override: Partial<T3>): T3 => ({
  uri: handles.map(({ uri }) => uri).join(','),
  uris: handles.flatMap(({ uri, scheme, id }) => ({ uri: uri!, scheme, id })),
  // @ts-ignore
  handles: [...handles, ...handles.flatMap(({ handles }) => handles)],
  ...handlesToHandleProperties(handles, properties),
  ...override
}) as unknown as T3

const episodeHandleToEpisodeHandleApolloCache = (episode: EpisodeHandle): EpisodeHandleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'EpisodeHandle',
    ...episode,
    releaseDates: episode.releaseDates.map(releaseDate => handleToHandleApolloCache({ date: null, start: null, end: null, ...releaseDate })),
    handles: episode.handles?.map(episodeHandleToEpisodeHandleApolloCache) ?? null
  }))

const episodeToEpisodeApolloCache = (episode: Episode): EpisodeApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'Episode',
    ...episode,
    names: episode.names.map(name => propertyToHandleProperty(name, 'EpisodeHandle')),
    related: episode.related.map(relation => propertyToHandleProperty<EpisodeApolloCache>(relation, 'EpisodeHandle')),
    releaseDates: episode.releaseDates.map(releaseDate => propertyToHandleProperty({ date: null, start: null, end: null, ...releaseDate }, 'EpisodeHandle')),
    images: episode.images.map(image => propertyToHandleProperty(image, 'EpisodeHandle')),
    synopses: episode.synopses.map(synopsis => propertyToHandleProperty(synopsis, 'EpisodeHandle')),
    handles: episode.handles.map(episodeHandleToEpisodeHandleApolloCache)
  }))

const titleHandleToTitleHandleApolloCache = (titleHandle: TitleHandle): TitleHandleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'TitleHandle',
    ...titleHandle,
    releaseDates: titleHandle.releaseDates.map(releaseDate => handleToHandleApolloCache({ date: null, start: null, end: null, ...releaseDate })),
    handles: titleHandle.handles?.map(titleHandleToTitleHandleApolloCache) ?? null
  }))

const titleToTitleApolloCache = (title: Title): TitleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'Title',
    ...title,
    names: title.names.map(name => propertyToHandleProperty(name, 'TitleHandle')),
    related: title.related.map(relation => propertyToHandleProperty<TitleApolloCache>(relation, 'TitleHandle')),
    recommended: title.recommended?.map(titleToTitleApolloCache),
    releaseDates: title.releaseDates.map(releaseDate => propertyToHandleProperty({ date: null, start: null, end: null, ...releaseDate }, 'TitleHandle')),
    images: title.images.map(image => propertyToHandleProperty(image, 'TitleHandle')),
    synopses: title.synopses.map(synopsis => propertyToHandleProperty(synopsis, 'TitleHandle')),
    handles: title.handles.map(titleHandleToTitleHandleApolloCache),
    episodes: title.episodes.map(episodeToEpisodeApolloCache)
  }))

cache.policies.addTypePolicies({
  Handle: {
    keyFields: ['uri'],
  },
  Title: {
    keyFields: ['uri']
  },
  TitleHandle: {
    keyFields: ['uri']
  },
  Episode: {
    keyFields: ['uri']
  },
  EpisodeHandle: {
    keyFields: ['uri']
  },
  Query: {
    fields: {
      searchTitle: (_, args: FieldFunctionOptions & { args: { uri: string } | { scheme: string, id: string } }) => {
        const { toReference, args: arrrrg, storage, cache, fieldName } = args
        if (!storage.var) {
          args.storage.var = makeVar(undefined)
          searchTitle(arrrrg).then((data) => {
            const titles = data.map(titleToTitleApolloCache)
            storage.var(titles)
            cache.writeQuery({ query: SEARCH_TITLE, data: { [fieldName]: titles } })
          })
        }
        return storage.var()
      },
      title: (_, args: FieldFunctionOptions & { args: { uri: string } | { scheme: string, id: string } }) => {
        const { toReference, args: { uri, scheme, id }, storage, cache, fieldName } = args
        if (!storage.var) {
          args.storage.var = makeVar(undefined)
          getTitle({ uri, scheme, id }).then((_title) => {
            const title = titleToTitleApolloCache(_title)
            storage.var(title)
            cache.writeQuery({ query: GET_TITLE, data: { [fieldName]: title } })
          })
        }
        return storage.var()
      },
      titles: (_, { toReference, args: { id } }: FieldFunctionOptions & { args: { id: string } }) =>
        toReference({
          __typename: 'Title',
          id
        }),
      episode: (_, args: FieldFunctionOptions & { args: { uri: string, title: any } | { scheme: string, id: string } }) => {
        const { toReference, args: { uri, scheme, id }, storage, cache, fieldName } = args
        if (!storage.var) {
          args.storage.var = makeVar(undefined)
          getEpisode({ uri, scheme, id, title: args.args.title }).then((_episode) => {
            const episode = episodeToEpisodeApolloCache(_episode)
            storage.var(episode)
            cache.writeQuery({ query: GET_EPISODE, data: { [fieldName]: episode } })
          })
        }
        return storage.var()
      },
      episodeHandle: (_, args: FieldFunctionOptions & { args: { uri: string, title: any } | { scheme: string, id: string } }) => {
        const { toReference, args: { uri, scheme, id }, storage, cache, fieldName } = args
        return toReference(`EpisodeHandle:{"uri":"${uri}"}`)
      }
    }
  }
})
