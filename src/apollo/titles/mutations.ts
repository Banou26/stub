import { gql } from '@apollo/client'

import { PACKAGE_SANDBOX_FRAGMENT } from './fragments'

export * from './mutations/index'

export const ADD_PACKAGE_BACKGROUND_SANDBOX = gql`
  ${PACKAGE_SANDBOX_FRAGMENT}
  mutation AddPackageBackgroundSandbox($packageId: ID!, $iframe: HTMLIFrameElementInput) {
    addPackageBackgroundSandbox(packageId: $packageId, iframe: $iframe) {
      ...PackageSandboxFragment
    }
  }
`

export const REMOVE_PACKAGE_BACKGROUND_SANDBOX = gql`
  ${PACKAGE_SANDBOX_FRAGMENT}
  mutation RemovePackageBackgroundSandbox($packageId: ID!) {
    removePackageBackgroundSandbox(packageId: $packageId) {
      ...PackageSandboxFragment
    }
  }
`
