import type { Target } from 'src/lib'
import type { TargetApolloCache } from './types'

import { gql } from '@apollo/client'

import { TARGET_FRAGMENT } from './fragments'

export const GET_TARGETS = gql`
  ${TARGET_FRAGMENT}
  query GetTargets($uri: String, $scheme: String, $id: ID, $title: Title) {
    targets @client {
      ...TargetFragment
    }
  }
`

export interface GetTargets {
  targets: Target[]
}

export interface GetTargetsApolloCache extends GetTargets {
  targets: TargetApolloCache[]
}
