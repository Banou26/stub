import { Title, TitleHandle } from '../../../lib/types'
import { TitleApolloCache, TitleHandleApolloCache } from '../types'

import { gql } from '@apollo/client'

import { TITLE_FRAGMENT, TITLE_HANDLE_FRAGMENT } from '../fragments'

export const GET_TITLE = gql`
  ${TITLE_FRAGMENT}
  query GetTitle($uri: String, $scheme: String, $id: ID) {
    title(uri: $uri, scheme: $scheme, id: $id) @client {
      ...TitleFragment
    }
  }
`

export const GET_TITLE_HANDLE = gql`
  ${TITLE_HANDLE_FRAGMENT}
  query GetTitleHandle($scheme: String!, $id: ID!) {
    title(scheme: $scheme, id: $id) {
      ...TitleHandleFragment
    }
  }
`

export const SEARCH_TITLE = gql`
  ${TITLE_FRAGMENT}
  query SearchTitle(
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
    searchTitle(
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
      ...TitleFragment
    }
  }
`

export interface SearchTitle {
  searchTitle: Title[]
}

export interface SearchTitleApolloCache extends SearchTitle {
  searchTitle: TitleApolloCache[]
}

export interface GetTitle {
  title: Title
}

export interface GetTitleApolloCache extends GetTitle {
  title: TitleApolloCache
}

export interface GetTitleHandle {
  titleHandle: TitleHandle
}

export interface GetTitleHandleApolloCache extends GetTitleHandle {
  titleHandle: TitleHandleApolloCache
}
