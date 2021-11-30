import { Title, TitleHandle, TitleApolloCache, TitleHandleApolloCache } from '../types'

import { gql } from '@apollo/client'

import { TITLE_FRAGMENT, TITLE_HANDLE_FRAGMENT } from '../fragments'

export const GET_TITLE = gql`
  ${TITLE_FRAGMENT}
  query GetTitle($id: ID!) {
    title(id: $id) {
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

export interface GetTitlePayload {
  title: Title
}

export interface GetTitlePayloadApolloCache extends GetTitlePayload {
  title: TitleApolloCache
}

export interface GetTitleHandlePayload {
  titleHandle: TitleHandle
}

export interface GetTitleHandlePayloadApolloCache extends GetTitleHandlePayload {
  titleHandle: TitleHandleApolloCache
}
