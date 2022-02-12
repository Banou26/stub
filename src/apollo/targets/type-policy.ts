import type { FieldFunctionOptions } from '@apollo/client'

import type { Target } from 'src/lib'
import type { TargetApolloCache } from '../types'

import { makeVar } from '@apollo/client'

import cache from '../cache'
import { undefinedToNull } from '../utils'
import { getTargets } from 'src/lib/targets'
import { GET_TARGETS } from './queries'

export const targetToTargetApolloCache = (target: Target): TargetApolloCache =>
  undefinedToNull({
    __typename: 'Target',
    ...target,
  })

cache.policies.addTypePolicies({
  Target: {
    keyFields: ['uri']
  },
  TargetHandle: {
    keyFields: ['uri']
  },
  Query: {
    fields: {
      targets: () => getTargets().map(targetToTargetApolloCache)
      // targets: (_, args: FieldFunctionOptions & { args: { uri: string, title: any } | { scheme: string, id: string } }) => {
      //   const { storage, cache, fieldName } = args
      //   if (!storage.var) {
      //     args.storage.var = makeVar(undefined)
      //     const _targets = getTargets()
      //     const targets = _targets.map(targetToTargetApolloCache)
      //     console.log('tp targets', targets)
      //     storage.var(targets)
      //     cache.writeQuery({ query: GET_TARGETS, data: { [fieldName]: targets } })
      //   }
      //   return storage.var()
      // },
    }
  }
})
