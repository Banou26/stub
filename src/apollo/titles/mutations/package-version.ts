import { Package, PackageVersion, PACKAGE_FRAGMENT } from '..'

import { gql } from '@apollo/client'

import { PACKAGE_VERSION_FRAGMENT } from '..'

export const UPDATE_PACKAGE_VERSION = gql`
  ${PACKAGE_VERSION_FRAGMENT}
  mutation UpdatePackageVersion($input: UpdatePackageVersionInput!) {
    updatePackageVersion(input: $input) {
      packageVersion {
        ...PackageVersionFragment
      }
    }
  }
`

export const CREATE_PACKAGE_VERSION = gql`
  ${PACKAGE_FRAGMENT}
  ${PACKAGE_VERSION_FRAGMENT}
  mutation CreatePackageVersion($input: CreatePackageVersionInput!) {
    createPackageVersion(input: $input) {
      package {
        ...PackageFragment
        versions {
          id
        }
      }
      packageVersion {
        ...PackageVersionFragment
      }
    }
  }
`


export const DELETE_PACKAGE_VERSION = gql`
  ${PACKAGE_FRAGMENT}
  mutation DeletePackageVersion($input: DeletePackageVersionInput!) {
    deletePackageVersion(input: $input) {
      package {
        ...PackageFragment
        versions {
          id
        }
      }
    }
  }
`

export interface CreatePackageVersionPayload {
  package: Package
  packageVersion: PackageVersion
}

export interface CreatePackageVersionInput {
  input: {
    package: string
    tag?: string
    archive: File | Blob
  }
}

export interface DeletePackageVersionPayload {
  package: Package
}

export interface DeletePackageVersionInput {
  input: {
    packageVersion: string
  }
}
