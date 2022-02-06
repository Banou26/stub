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

const propertyToHandleProperty = (handle: any, __typename: string) => {
  return ({
    url: handle.url ?? null,
    uri: handle.uri ?? null,
    id: handle.id ?? null,
    scheme: handle.scheme ?? null,
    ...handle,
    handle: handleToHandleApolloCache({ ...handle.handle, __typename })
  })
}

// todo: try to fix this mess of type casting
const relationToRelationApolloCache = <T, T2 = any>(relation: Relation<T2>, __typename?: string): RelationApolloCache<T> => ({
  __typename: 'Relation',
  relation: relation.relation as any,
  reference: relation.reference as unknown as T
})

const episodeHandleToEpisodeHandleApolloCache = (episode: EpisodeHandle): EpisodeHandleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'EpisodeHandle',
    ...episode,
    names: episode.names.map(name => handleToHandleApolloCache(name)),
    related: episode.related.map(relation => relationToRelationApolloCache<EpisodeHandleApolloCache>(relation)),
    releaseDates: episode.releaseDates.map(releaseDate => handleToHandleApolloCache({ date: null, start: null, end: null, ...releaseDate })),
    images: episode.images.map(image => handleToHandleApolloCache(image)),
    synopses: episode.synopses.map(synopsis => handleToHandleApolloCache(synopsis)),
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
    names: titleHandle.names.map(name => handleToHandleApolloCache(name)),
    related: titleHandle.related.map(relation => relationToRelationApolloCache<TitleHandleApolloCache>( relation)),
    releaseDates: titleHandle.releaseDates.map(releaseDate => handleToHandleApolloCache({ date: null, start: null, end: null, ...releaseDate })),
    images: titleHandle.images.map(image => handleToHandleApolloCache(image)),
    synopses: titleHandle.synopses.map(synopsis => handleToHandleApolloCache(synopsis)),
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
    keyFields: ['uri'],
  },
  TitleHandle: {
    keyFields: ['uri'],
  },
  Episode: {
    keyFields: ['uri'],
  },
  EpisodeHandle: {
    keyFields: ['uri'],
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
