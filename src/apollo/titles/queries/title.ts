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
