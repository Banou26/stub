import type { FieldFunctionOptions } from '@apollo/client'

import type { Title } from 'src/lib'
import type { TitleApolloCache } from '../types'

import { makeVar } from '@apollo/client'

import cache from '../cache'
import { defineTypename, undefinedToNull } from '../utils'
import { GET_TITLE, SEARCH_TITLE } from '.'
import { searchTitle, getTitle } from '../../lib/targets'
import { episodeToEpisodeApolloCache } from '../episodes'

const titleToTitleApolloCache = (title: Title): TitleApolloCache =>
  defineTypename(
    undefinedToNull(({
      __typename: 'Title',
      ...title,
      episodes: title.episodes.map(episodeToEpisodeApolloCache)
    })),
    'TitleHandle'
  )

cache.policies.addTypePolicies({
  Title: {
    keyFields: ['uri']
  },
  TitleHandle: {
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
        })
    }
  }
})
