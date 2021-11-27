import { gql } from '@apollo/client'

import client from '../../client'
import cache from '../../cache'
import { PACKAGE_FRAGMENT, PACKAGE_ARTIFACTS_FRAGMENT, GET_PACKAGE } from '../../packages'
import { Package } from '../types'
// import events from '../../../api/events'

// todo: fix the package fragment
export const GET_PACKAGE_ARTIFACTS = gql`
  ${PACKAGE_FRAGMENT}
  ${PACKAGE_ARTIFACTS_FRAGMENT}
  query GetPackageArtifacts($id: ID!, $version: String!) {
    packageArtifacts(id: $id, version: $version) @client {
      ...PackageArtifactsFragment
      package {
        ...PackageFragment
      }
      package {
        id
      }
      manifest {
        name
        version
        web {
          script
        }
        background {
          script
        }
      }
      tag
      version
      readme
      archive(id: $id, version: $version)
    }
  }
`

client.addResolvers({
  Query: {
    packageArtifacts: async (_, { id, version }, ___, info) => {
      if (!info) return
      const { field: { selectionSet: { selections } = {} } } = info
      // @ts-ignore
      const resolvePackage = selections?.some(({ name: { value } }) => value === 'package')
      // @ts-ignore
      const resolveArchive = selections?.some(({ name: { value } }) => value === 'archive')
      // console.log('packageArtifacts resolver', resolveArchive, id)
      try {
        const res = client.readQuery({
          query: GET_PACKAGE,
          variables: { id }
        })

        // console.log('FOOFOFOOFOOFOF', res)
      } catch (err) { console.error(err); throw err }
      const pkg =
        resolvePackage
          ? cache.readQuery<{ package: Package }>({
            query: GET_PACKAGE,
            variables: { id }
          })?.package
          : undefined
      

      // const packageArtifacts = await fetchPackageArtifact(pkg?.sources[0])

      // console.log('resolvers packageArtifacts', packageArtifacts)

      // const packageArtifacts = await events.dispatch(Api.FETCH_PACKAGE, pkg?.sources[0])

      // console.log('packageArtifacts resolver returned', pkg, packageArtifacts)
      return {
        // ...packageArtifacts,
        package: pkg
      }
    }
  }
})
