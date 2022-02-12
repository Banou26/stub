import type { Episode, EpisodeHandle } from 'src/lib'
import type { OptionalToNullable, ReplaceTypeWithType } from '../types'

import { StoreObject } from '@apollo/client'

export type EpisodeHandleToEpisodeHandleApolloCache<T> =
  ReplaceTypeWithType<
    EpisodeHandle,
    StoreObject &
    OptionalToNullable<EpisodeHandle> & {
      __typename: 'EpisodeHandle'
      handles: EpisodeHandleToEpisodeHandleApolloCache<T>[]
    },
    T
  >

export type EpisodeToEpisodeApolloCache<T> =
  ReplaceTypeWithType<
    Episode,
    StoreObject &
    OptionalToNullable<Episode> & {
      __typename: 'Episode'
      handles: EpisodeHandleToEpisodeHandleApolloCache<T>[]
    },
    T
  >
