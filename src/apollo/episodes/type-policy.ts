import type { FieldFunctionOptions } from '@apollo/client'

import type { Episode } from 'src/lib'
import type { EpisodeApolloCache } from '../types'

import { makeVar } from '@apollo/client'

import cache from '../cache'
import { defineTypename, undefinedToNull } from '../utils'
import { GET_EPISODE } from '.'
import { getEpisode } from '../../lib/targets'

export const episodeToEpisodeApolloCache = (episode: Episode): EpisodeApolloCache =>
  defineTypename(
    undefinedToNull({
      __typename: 'Episode',
      ...episode,
    }),
    'EpisodeHandle'
  )

cache.policies.addTypePolicies({
  Episode: {
    keyFields: ['uri']
  },
  EpisodeHandle: {
    keyFields: ['uri']
  },
  Query: {
    fields: {
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
