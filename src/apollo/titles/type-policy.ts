import { FieldFunctionOptions, makeVar } from '@apollo/client'
import { Episode, Title } from 'src/lib'
import { EpisodeApolloCache, GET_EPISODE, GET_TITLE, SEARCH_TITLE, TitleApolloCache } from '.'
import { get, searchTitle, getTitle, getEpisode } from '../../lib/targets'
import cache from '../cache'
import { OptionalToNullable } from './types'

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

const nullToUndefined = <T>(object: T): OptionalToNullable<T> =>
  // @ts-ignore
  Array.isArray(object)
    ? object.map(nullToUndefined)
    : (
      Object.fromEntries(
        Object
          .entries(object)
          .map(([key, val]) => [
            key,
            val === undefined ? null :
            Array.isArray(val) ? val.map(nullToUndefined) :
            typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.getPrototypeOf({}) ? nullToUndefined(val) :
            val
          ])
      )
    )

const defineTypename = (object: any, typename: string, setTypename = false) =>
  Array.isArray(object)
    ? object.map(obj => defineTypename(obj, typename, setTypename))
    : ({
      ...setTypename && { __typename: typename },
      // keep the original typename if it exists, we only want to set it if its not defined
      // as this algorithm goes down the tree, we don't want Titles to override Episodes typenames
      ...Object.fromEntries(
        Object
          .entries(object)
          .map(([key, val]) => [
            key,
            Array.isArray(val) ? val.map(_val => defineTypename(_val, typename, key === 'handle' || key === 'handles' ? true : false)) :
            typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.getPrototypeOf({}) ? defineTypename(val, typename, key === 'handle' || key === 'handles' ? true : false) :
            val
          ])
      ) 
    })

const episodeToEpisodeApolloCache = (episode: Episode): EpisodeApolloCache =>
  defineTypename(
    nullToUndefined({
      __typename: 'Episode',
      ...episode,
    }),
    'EpisodeHandle'
  )

const titleToTitleApolloCache = (title: Title): TitleApolloCache =>
  defineTypename(
    nullToUndefined(({
      __typename: 'Title',
      ...title,
      episodes: title.episodes.map(episodeToEpisodeApolloCache)
    })),
    'TitleHandle'
  )

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
