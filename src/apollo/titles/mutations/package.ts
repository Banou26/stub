import type { Package } from '..'

import { gql } from '@apollo/client'

import { PACKAGE_FRAGMENT } from '..'

export const UPDATE_PACKAGE = gql`
  ${PACKAGE_FRAGMENT}
  mutation UpdatePackage($input: UpdatePackageInput!) {
    updatePackage(input: $input) {
      package {
        ...PackageFragment
      }
    }
  }
`

export interface UpdatePackagePayload {
  package: Package
}

export interface CropInput {
  left: number
  top: number
  height: number
  width: number
}

export interface UpdatePackageInput {
  input: {
    id: string
    packageProperties: Partial<Package> & {
      headerFile?: {
        language: string
        file: File | Blob
        crop: CropInput
      }
    }
  }
}


export const CREATE_PACKAGE = gql`
  ${PACKAGE_FRAGMENT}
  mutation CreatePackage($input: CreatePackageInput!) {
    createPackage(input: $input) {
      package {
        ...PackageFragment
      }
    }
  }
`

export interface CreatePackagePayload {
  package: Package
}

export interface CreatePackageInput {
  input: {
    owner: string
    name: string
  }
}
