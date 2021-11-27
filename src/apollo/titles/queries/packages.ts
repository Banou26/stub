import { gql } from '@apollo/client'

import { PACKAGE_FRAGMENT } from '../fragments'

export const GET_PACKAGES = gql`
  ${PACKAGE_FRAGMENT}
  query GetPackages {
    packages {
      ...PackageFragment
    }
  }
`
