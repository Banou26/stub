import { gql } from '@apollo/client'

export const TARGET_FRAGMENT = gql`
  fragment TargetFragment on Target {
    name
    scheme
    icon
  }
`
