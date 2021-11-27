import { Title } from '../types'

import { gql } from '@apollo/client'

import { TITLE_FRAGMENT } from '../fragments'

export const GET_TITLE = gql`
  ${TITLE_FRAGMENT}
  query GetTitle($id: ID!) {
    title(id: $id) {
      ...TitleFragment
    }
  }
`

// export const GET_TITLE = gql`
//   ${TITLE_FRAGMENT}
//   query GetTitle($id: ID!) {
//     title(id: $id) {
//       ...TitleFragment
//     }
//   }
// `

export interface GetTitlePayload {
  title: Title
}
