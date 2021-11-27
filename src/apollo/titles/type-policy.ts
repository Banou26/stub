import type { FieldFunctionOptions, Reference } from '@apollo/client'

import type { InstalledPackage } from '../user'

import '../settings/type-policy'
import cache from '../cache'
import { PackageArtifacts, Package } from './types'

import getSupportedImageFormat from '../../utils/image-format'
import { PackageHeaderApolloCache, PACKAGE_HEADER_FRAGMENT } from '.'


export const archives =
  cache.makeVar
    <(
      Pick<PackageArtifacts, 'archive'>
      & { ref: string, archive: Buffer }
    )[]>([])

export const getArchiveFromRef = ref =>
  archives()
    .find(({ ref: _ref }) => _ref === ref)
    ?.archive

// setInterval(() => console.log(archives()), 5000)

// todo: replace this archive string ref with the real archive when https://github.com/apollographql/apollo-client/issues/6813 is fixed
// todo: try using "keyFields: false" https://www.apollographql.com/docs/react/caching/cache-configuration/#disabling-normalization
cache.policies.addTypePolicies({
  // PackageArtifacts: {
  //   keyFields: ['package', ['id'], 'version'],
  //   fields: {
  //     archive: {
  //       read: (_, { readField, toReference }) =>
  //         toReference({
  //           __typename: 'PackageArtifacts',
  //           package: {
  //             id: readField('id', readField('package'))
  //           },
  //           version: readField('version')
  //         })?.__ref,
  //       merge: (_, incoming, { toReference, args }) => {
  //         if (!args) return
  //         const ref =
  //           toReference({
  //             __typename: 'PackageArtifacts',
  //             package: {
  //               id: args.id
  //             },
  //             version: args.version
  //           })?.__ref
  //         if (!ref) return
  //         archives([
  //           ...archives()
  //             .filter(({ ref: _ref }) => _ref === ref),
  //           {
  //             ref,
  //             archive: incoming
  //           }
  //         ])
  //         return ref
  //       }
  //     }
  //   }
  // },
  Package: {
    fields: {
      headerUrl: {
        read: (_, { readField }) =>
          readField<PackageHeaderApolloCache[]>('headers')?.[0]
            ? `${process.env.CDN_ORIGIN}/packages/${readField('id')}/header/${readField<PackageHeaderApolloCache[]>('headers')![0]?.value}.${getSupportedImageFormat()}`
            : null
      }
    }
  },
  // Query: {
  //   fields: {
  //     package: (_, { toReference, args: { id } }: FieldFunctionOptions & { args: { id: string } }) =>
  //       toReference({
  //         __typename: 'Package',
  //         id
  //       })
  //   }
  // }
})
