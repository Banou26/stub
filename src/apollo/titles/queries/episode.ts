import { Episode, EpisodeHandle } from '../../../lib/types'
import { EpisodeApolloCache, EpisodeHandleApolloCache } from '../types'

import { gql } from '@apollo/client'

import { EPISODE_FRAGMENT, EPISODE_HANDLE_FRAGMENT } from '../fragments'

export const GET_EPISODE = gql`
  ${EPISODE_FRAGMENT}
  query GetEpisode($uri: String, $scheme: String, $id: ID, $title: Title) {
    episode(uri: $uri, scheme: $scheme, id: $id, title: $title) @client {
      ...EpisodeFragment
    }
  }
`

export const GET_EPISODE_HANDLE = gql`
  ${EPISODE_HANDLE_FRAGMENT}
  query GetEpisodeHandle($uri: String, $scheme: String!, $id: ID!) {
    episodeHandle(uri: $uri, scheme: $scheme, id: $id) @client {
      ...EpisodeHandleFragment
    }
  }
`

export const SEARCH_EPISODE = gql`
  ${EPISODE_FRAGMENT}
  query SearchEpisode(
    $uri: String,
    $scheme: String,
    $id: ID,
    $search: String,
    $categories: [String],
    $latest: Bool,
    $pagination: String,
    $genres: [String],
    $score: string,
    $tags: [String]
  ) {
    searchEpisode(
      uri: $uri,
      scheme: $scheme,
      id: $id,
      search: $search,
      categories: $categories,
      latest: $latest,
      pagination: $pagination,
      genres: $genres,
      score: $score,
      tags: $tags
    ) @client {
      ...EpisodeFragment
    }
  }
`

export interface SearchEpisode {
  searchEpisode: Episode[]
}

export interface SearchEpisodeApolloCache extends SearchEpisode {
  searchEpisode: EpisodeApolloCache[]
}

export interface GetEpisode {
  episode: Episode
}

export interface GetEpisodeApolloCache extends GetEpisode {
  episode: EpisodeApolloCache
}

export interface GetEpisodeHandle {
  episodeHandle: EpisodeHandle
}

export interface GetEpisodeHandleApolloCache extends GetEpisodeHandle {
  episodeHandle: EpisodeHandleApolloCache
}
