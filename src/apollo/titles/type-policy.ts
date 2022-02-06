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

const propertyToHandleProperty = (handle: any, __typename?: string) => {
  if (__typename) {
    return ({
      url: handle.url ?? null,
      uri: handle.uri ?? null,
      id: handle.id ?? null,
      scheme: handle.scheme ?? null,
      ...handle,
      handle: handleToHandleApolloCache({ ...handle.handle, __typename })
    })
  }
  return handleToHandleApolloCache(handle)
}

const nameToNameApolloCache = (name: Title['names'][number], __typename?: string): TitleApolloCache['names'][number] =>
  propertyToHandleProperty(({
    ...name
  }), __typename)

const imageToImageApolloCache = (image: Title['images'][number], __typename?: string): TitleApolloCache['images'][number] =>
  propertyToHandleProperty(({
    ...image
  }), __typename)

const synopsisToSynopsisApolloCache = (synopsis: Title['synopses'][number], __typename?: string): TitleApolloCache['synopses'][number] =>
  propertyToHandleProperty(({
    ...synopsis
  }), __typename)

// todo: try to fix this mess of type casting
const relationToRelationApolloCache = <T, T2 = any>(relation: Relation<T2>, __typename?: string): RelationApolloCache<T> => ({
  __typename: 'Relation',
  relation: relation.relation as any,
  reference: relation.reference as unknown as T
})

const releaseDateToReleaseDateApolloCache = <T>(releaseDate: Title['releaseDates'][number], __typename?: string): TitleApolloCache['releaseDates'][number] =>
  propertyToHandleProperty(({
    date: null,
    start: null,
    end: null,
    ...releaseDate
  }), __typename)

const episodeHandleToEpisodeHandleApolloCache = (episode: EpisodeHandle): EpisodeHandleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'EpisodeHandle',
    ...episode,
    names: episode.names.map(name => nameToNameApolloCache(name)),
    related: episode.related.map(relation => relationToRelationApolloCache<EpisodeHandleApolloCache>(relation)),
    releaseDates: episode.releaseDates.map(releaseDate => releaseDateToReleaseDateApolloCache(releaseDate)),
    images: episode.images.map(image => imageToImageApolloCache(image)),
    synopses: episode.synopses.map(synopsis => synopsisToSynopsisApolloCache(synopsis)),
    handles: episode.handles?.map(episodeHandleToEpisodeHandleApolloCache) ?? null
  }))

const episodeToEpisodeApolloCache = (episode: Episode): EpisodeApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'Episode',
    ...episode,
    names: episode.names.map(name => nameToNameApolloCache(name, 'EpisodeHandle')),
    related: episode.related.map(relation => relationToRelationApolloCache<EpisodeApolloCache>(relation, 'EpisodeHandle')),
    releaseDates: episode.releaseDates.map(releaseDate => releaseDateToReleaseDateApolloCache(releaseDate, 'EpisodeHandle')),
    images: episode.images.map(image => imageToImageApolloCache(image, 'EpisodeHandle')),
    synopses: episode.synopses.map(synopsis => synopsisToSynopsisApolloCache(synopsis, 'EpisodeHandle')),
    handles: episode.handles.map(episodeHandleToEpisodeHandleApolloCache)
  }))

const titleHandleToTitleHandleApolloCache = (titleHandle: TitleHandle): TitleHandleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'TitleHandle',
    ...titleHandle,
    names: titleHandle.names.map(name => nameToNameApolloCache(name)),
    related: titleHandle.related.map(relation => relationToRelationApolloCache<TitleHandleApolloCache>( relation)),
    releaseDates: titleHandle.releaseDates.map(releaseDate => releaseDateToReleaseDateApolloCache(releaseDate)),
    images: titleHandle.images.map(image => imageToImageApolloCache(image)),
    synopses: titleHandle.synopses.map(synopsis => synopsisToSynopsisApolloCache(synopsis)),
    handles: titleHandle.handles?.map(titleHandleToTitleHandleApolloCache) ?? null
  }))

const titleToTitleApolloCache = (title: Title): TitleApolloCache =>
  handleToHandleApolloCache(({
    __typename: 'Title',
    ...title,
    names: title.names.map(name => nameToNameApolloCache(name, 'TitleHandle')),
    related: title.related.map(relation => relationToRelationApolloCache<TitleApolloCache>(relation, 'TitleHandle')),
    recommended: title.recommended?.map(titleToTitleApolloCache),
    releaseDates: title.releaseDates.map(releaseDate => releaseDateToReleaseDateApolloCache(releaseDate, 'TitleHandle')),
    images: title.images.map(image => imageToImageApolloCache(image, 'TitleHandle')),
    synopses: title.synopses.map(synopsis => synopsisToSynopsisApolloCache(synopsis, 'TitleHandle')),
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
