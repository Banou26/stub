import type { Target } from 'src/lib'
import type { OptionalToNullable, ReplaceTypeWithType } from '../types'

import { StoreObject } from '@apollo/client'

export type TargetToTargetApolloCache<T> =
  ReplaceTypeWithType<
    Target,
    StoreObject &
    OptionalToNullable<Target> & {
      __typename: 'Target'
    },
    T
  >

export type TargetApolloCache = TargetToTargetApolloCache<Target>
